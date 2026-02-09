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
import { getPluginData, savePluginData } from '@/lib/queries';
import { createResource, updateResource } from '@/lib/wp-client';
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

    const payload: Record<string, unknown> = {
      title: resource.title,
      slug: resource.slug,
      status: resource.status,
      content: resource.meta_box?.text_content || '',
    };

    // Map meta_box fields
    const mappedMeta: Record<string, unknown> = {};
    for (const [targetField, sourceField] of Object.entries(fieldMapping || {})) {
      if (sourceField && resource.meta_box?.[sourceField] !== undefined) {
        mappedMeta[targetField] = resource.meta_box[sourceField];
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

    saveResource(newPost, undefined, targetPostType);

    // Copy SEO data to the new post if it exists
    const seoData = seopressPlugin.getLocalSEOData(resourceId);
    if (seoData) {
      savePluginData(newPost.id, 'seopress', 'seo', seoData, false);
    }

    // ─── Step 5: Trash the old WP post ──────────────────────────────────────

    if (trashOldPost) {
      try {
        // WordPress REST API: POST with status=trash to move to trash
        await updateResource(resourceId, { status: 'trash' } as Record<string, unknown> & { title: string }, sourceRestBase);
        console.log(`[convert] Trashed old post #${resourceId}`);

        // Remove from local database
        const db = getDb();
        db.prepare('DELETE FROM post_meta WHERE post_id = ?').run(resourceId);
        db.prepare('DELETE FROM post_terms WHERE post_id = ?').run(resourceId);
        db.prepare('DELETE FROM plugin_data WHERE post_id = ?').run(resourceId);
        db.prepare('DELETE FROM posts WHERE id = ?').run(resourceId);
      } catch (error) {
        errors.push(`Failed to trash old post: ${error}`);
      }
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
