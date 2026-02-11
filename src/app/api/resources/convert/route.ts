/**
 * POST /api/resources/convert
 *
 * Converts a post from one post type to another:
 *   1. Creates a new WordPress post of the target type with mapped fields
 *   2. Creates a 301 redirect from old URL to new URL (via SEOPress)
 *   3. Updates the local database record
 *   4. Trashes the old WordPress post
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getResourceById } from '@/lib/queries';
import { savePluginData } from '@/lib/queries';
import { createResource } from '@/lib/wp-client';
import { getWpBaseUrl, getWpCredentials } from '@/lib/wp-client';
import { saveResource } from '@/lib/sync';
import { seopressPlugin } from '@/lib/plugins/bundled/seopress';
import { getProfileManager, ensureProfileLoaded } from '@/lib/profiles';

function getAuthHeader(): string {
  const creds = getWpCredentials();
  return 'Basic ' + Buffer.from(`${creds.username}:${creds.appPassword}`).toString('base64');
}

interface ConvertRequest {
  /** ID of the post to convert */
  resourceId: number;
  /** Target post type slug (e.g., "post") */
  targetPostType: string;
  /** Target post type REST base (e.g., "posts") */
  targetRestBase: string;
  /** Source post type REST base for trashing the old post */
  sourceRestBase: string;
  /** Field mapping: { targetField: sourceField } for meta_box */
  fieldMapping: Record<string, string>;
  /** Taxonomy mapping: { targetTaxonomy: sourceTaxonomy } */
  taxonomyMapping: Record<string, string>;
  /** Whether to create a 301 redirect */
  createRedirect: boolean;
  /** Whether to trash the old WP post */
  trashOldPost: boolean;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json() as ConvertRequest;
    const {
      resourceId,
      targetPostType,
      targetRestBase,
      sourceRestBase,
      fieldMapping,
      taxonomyMapping,
      createRedirect,
      trashOldPost,
    } = body;

    // Validate required fields
    if (!resourceId || !targetPostType || !targetRestBase) {
      return NextResponse.json(
        { error: 'resourceId, targetPostType, and targetRestBase are required' },
        { status: 400 }
      );
    }

    // Fetch the existing resource from local DB
    const resource = getResourceById(resourceId);
    if (!resource) {
      return NextResponse.json(
        { error: `Resource ${resourceId} not found` },
        { status: 404 }
      );
    }

    const baseUrl = getWpBaseUrl();
    const authHeader = getAuthHeader();
    const oldSlug = resource.slug;
    const errors: string[] = [];

    // ─── Step 1: Build payload for the new post ─────────────────────────────

    // Core WP fields that go at the top level of the API payload
    const CORE_FIELDS = new Set(['title', 'content', 'excerpt', 'slug', 'status', 'featured_media']);

    // Helper: get a value from the resource by field key and category
    function getSourceValue(key: string, category?: string): unknown {
      if (category === 'core' || CORE_FIELDS.has(key)) {
        return (resource as Record<string, unknown>)[key];
      }
      if (category === 'taxonomy') {
        return resource.taxonomies?.[key];
      }
      // Default: meta_box
      return resource.meta_box?.[key];
    }

    // Start with basic fields that always carry over
    // Create as draft so the user can review and push when ready
    const payload: Record<string, unknown> = {
      title: resource.title,
      slug: resource.slug,
      status: 'draft',
      featured_media: resource.featured_media || 0,
      date_gmt: resource.date_gmt,
    };

    // Apply field mappings (handles core↔meta, core↔core, meta↔meta)
    const mappedMeta: Record<string, unknown> = {};
    for (const [targetField, sourceField] of Object.entries(fieldMapping || {})) {
      if (!sourceField) continue;

      const value = getSourceValue(sourceField);
      if (value === undefined || value === null) continue;

      if (CORE_FIELDS.has(targetField)) {
        // Target is a core WP field (e.g., content, excerpt)
        payload[targetField] = value;
      } else {
        // Target is a meta_box field
        mappedMeta[targetField] = value;
      }
    }
    if (Object.keys(mappedMeta).length > 0) {
      payload.meta_box = mappedMeta;
    }

    // Map taxonomy terms
    for (const [targetTax, sourceTax] of Object.entries(taxonomyMapping || {})) {
      if (sourceTax && resource.taxonomies?.[sourceTax]) {
        payload[targetTax] = resource.taxonomies[sourceTax];
      }
    }

    // ─── Step 2: Create the new WP post ─────────────────────────────────────

    let newPost;
    try {
      newPost = await createResource(
        payload as Record<string, unknown> & { title: string },
        targetRestBase
      );
      console.log(`[convert] Created new ${targetPostType} #${newPost.id} from ${resource.id}`);
    } catch (error) {
      return NextResponse.json(
        { error: `Failed to create new ${targetPostType} on WordPress: ${error}` },
        { status: 500 }
      );
    }

    // ─── Step 3: Create redirect (old URL → new URL) ────────────────────────

    let redirectResult = { success: true, error: undefined as string | undefined };
    if (createRedirect && oldSlug) {
      // Build URL paths from the profile's post type config
      ensureProfileLoaded();
      const postTypes = getProfileManager().getPostTypes();
      const sourceType = postTypes.find(pt => pt.rest_base === sourceRestBase);
      const targetType = postTypes.find(pt => pt.rest_base === targetRestBase);

      // Use slug-based paths (WordPress default permalink structure)
      const oldPath = `/${sourceType?.slug || 'resource'}/${oldSlug}/`;
      const newPath = `/${targetType?.slug || targetPostType}/${newPost.slug}/`;

      redirectResult = await seopressPlugin.createRedirect(
        {
          redirectFrom: oldPath,
          redirectTo: newPath,
          statusCode: 301,
        },
        baseUrl,
        authHeader
      );

      if (!redirectResult.success) {
        errors.push(`Redirect: ${redirectResult.error}`);
      }
    }

    // ─── Step 4: Save the new post to local database ────────────────────────

    // Copy the featured image URL from the source post (already resolved during sync)
    const sourceImageUrl = resource.meta_box?.featured_image_url as string | undefined;
    saveResource(newPost, sourceImageUrl || undefined, targetPostType);

    // Mark as dirty so the user can review and push when ready
    const db = getDb();
    db.prepare('UPDATE posts SET is_dirty = 1 WHERE id = ?').run(newPost.id);

    // Copy SEO data to the new post if it exists
    const seoData = seopressPlugin.getLocalSEOData(resourceId);
    if (seoData) {
      savePluginData(newPost.id, 'seopress', 'seo', seoData, false);
    }

    // ─── Step 5: Trash the old WP post ──────────────────────────────────────

    if (trashOldPost) {
      // Try to trash on WordPress via DELETE endpoint
      try {
        const trashUrl = `${baseUrl}/wp-json/wp/v2/${sourceRestBase}/${resourceId}`;
        console.log(`[convert] Trashing old post: DELETE ${trashUrl}`);
        const trashResponse = await fetch(trashUrl, {
          method: 'DELETE',
          headers: { Authorization: authHeader },
        });
        if (!trashResponse.ok) {
          const trashError = await trashResponse.text();
          errors.push(`Failed to trash on WordPress: HTTP ${trashResponse.status} - ${trashError}`);
          console.error(`[convert] Trash failed: ${trashResponse.status} - ${trashError}`);
        } else {
          console.log(`[convert] Trashed old post #${resourceId} on WordPress`);
        }
      } catch (error) {
        errors.push(`Failed to trash on WordPress: ${error}`);
        console.error(`[convert] Trash request failed:`, error);
      }

      // Always remove from local database regardless of WP result
      db.prepare('DELETE FROM post_meta WHERE post_id = ?').run(resourceId);
      db.prepare('DELETE FROM post_terms WHERE post_id = ?').run(resourceId);
      db.prepare('DELETE FROM plugin_data WHERE post_id = ?').run(resourceId);
      db.prepare('DELETE FROM posts WHERE id = ?').run(resourceId);
      console.log(`[convert] Removed old post #${resourceId} from local database`);
    }

    return NextResponse.json({
      success: true,
      newPostId: newPost.id,
      newSlug: newPost.slug,
      redirectCreated: redirectResult.success,
      oldPostTrashed: trashOldPost,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('[convert] Error:', error);
    return NextResponse.json(
      { error: `Conversion failed: ${error}` },
      { status: 500 }
    );
  }
}
