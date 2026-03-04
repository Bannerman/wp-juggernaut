/**
 * GET /api/views
 *   No params: returns { postTypes }
 *   ?postType=resource: returns views, availableColumns for the post type
 *
 * PUT /api/views
 *   Saves view config for a post type to the profile JSON
 */

import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync } from 'fs';
import { ensureProfileLoaded, getProfileManager, getActiveProfileFilePath } from '@/lib/profiles';
import { ensurePluginsInitialized } from '@/lib/plugins/init';
import { getWpBaseUrl, getWpCredentials } from '@/lib/wp-client';
import { discoverFieldsForPostType } from '@/lib/discovery';
import type { ViewConfig, ViewColumn } from '@/lib/plugins/types';

function humanizeKey(key: string): string {
  return key
    .replace(/^[-_]+|[-_]+$/g, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    || key;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await ensurePluginsInitialized();
    ensureProfileLoaded();
    const manager = getProfileManager();
    const postTypes = manager.getPostTypes();
    const { searchParams } = new URL(request.url);
    const postType = searchParams.get('postType');

    if (!postType) {
      return NextResponse.json({ postTypes });
    }

    const views = manager.getViewsForPostType(postType);

    // Build available columns: core fields + taxonomies + meta keys
    const availableColumns: ViewColumn[] = [];

    // Core columns
    availableColumns.push(
      { key: 'status', label: 'Status', source: 'core', sortable: true },
      { key: 'date_gmt', label: 'Created', source: 'core', sortable: true },
      { key: 'modified_gmt', label: 'Modified', source: 'core', sortable: true },
    );

    // Taxonomy columns from profile
    const taxonomies = manager.getTaxonomies().filter(
      (t) => !t.post_types || t.post_types.includes(postType)
    );
    for (const tax of taxonomies) {
      availableColumns.push({
        key: tax.slug,
        label: tax.name,
        source: 'taxonomy',
        taxonomy_slug: tax.slug,
        max_display: tax.table_max_display,
      });
    }

    // Meta keys from WordPress discovery
    try {
      const ptConfig = postTypes.find((pt) => pt.slug === postType);
      if (ptConfig) {
        const baseUrl = getWpBaseUrl();
        const creds = getWpCredentials();
        const authHeader = 'Basic ' + Buffer.from(`${creds.username}:${creds.appPassword}`).toString('base64');
        const discovered = await discoverFieldsForPostType(baseUrl, authHeader, ptConfig.rest_base, ptConfig.slug);

        // Exclude taxonomy meta_field keys (handled by taxonomy columns)
        const taxonomyMetaKeys = new Set<string>();
        for (const tax of manager.getTaxonomies()) {
          if (tax.meta_field) taxonomyMetaKeys.add(tax.meta_field);
        }

        for (const key of discovered.metaKeys) {
          if (!taxonomyMetaKeys.has(key)) {
            availableColumns.push({
              key,
              label: humanizeKey(key),
              source: 'meta',
              type: 'text',
            });
          }
        }
      }
    } catch (err) {
      console.warn('[views] Field discovery failed, returning partial availableColumns:', err);
    }

    // SEO columns from plugin_data (seopress)
    availableColumns.push(
      {
        key: 'seo_title',
        label: 'SEO Title',
        source: 'plugin',
        type: 'text',
        plugin_id: 'seopress',
        data_path: 'seo.title',
      },
      {
        key: 'seo_description',
        label: 'SEO Description',
        source: 'plugin',
        type: 'text',
        plugin_id: 'seopress',
        data_path: 'seo.description',
      },
      {
        key: 'seo_target_keywords',
        label: 'Target Keywords',
        source: 'plugin',
        type: 'text',
        plugin_id: 'seopress',
        data_path: 'seo.targetKeywords',
      },
      {
        key: 'seo_canonical',
        label: 'Canonical URL',
        source: 'plugin',
        type: 'text',
        plugin_id: 'seopress',
        data_path: 'seo.canonical',
      },
      {
        key: 'seo_og_title',
        label: 'OG Title',
        source: 'plugin',
        type: 'text',
        plugin_id: 'seopress',
        data_path: 'seo.og.title',
      },
      {
        key: 'seo_og_description',
        label: 'OG Description',
        source: 'plugin',
        type: 'text',
        plugin_id: 'seopress',
        data_path: 'seo.og.description',
      },
      {
        key: 'seo_og_image',
        label: 'OG Image',
        source: 'plugin',
        type: 'text',
        plugin_id: 'seopress',
        data_path: 'seo.og.image',
      },
      {
        key: 'seo_twitter_title',
        label: 'Twitter Title',
        source: 'plugin',
        type: 'text',
        plugin_id: 'seopress',
        data_path: 'seo.twitter.title',
      },
      {
        key: 'seo_twitter_description',
        label: 'Twitter Description',
        source: 'plugin',
        type: 'text',
        plugin_id: 'seopress',
        data_path: 'seo.twitter.description',
      },
      {
        key: 'seo_twitter_image',
        label: 'Twitter Image',
        source: 'plugin',
        type: 'text',
        plugin_id: 'seopress',
        data_path: 'seo.twitter.image',
      },
      {
        key: 'seo_noindex',
        label: 'Noindex',
        source: 'plugin',
        type: 'text',
        plugin_id: 'seopress',
        data_path: 'seo.robots.noindex',
      },
      {
        key: 'seo_nofollow',
        label: 'Nofollow',
        source: 'plugin',
        type: 'text',
        plugin_id: 'seopress',
        data_path: 'seo.robots.nofollow',
      },
    );

    return NextResponse.json({ postTypes, views, availableColumns });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to get views: ${error}` },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    ensureProfileLoaded();
    const manager = getProfileManager();
    const body = await request.json() as {
      postType: string;
      views: ViewConfig[];
      initialViewIds: string[];
    };

    const { postType, views, initialViewIds } = body;

    if (!postType || !views || !initialViewIds) {
      return NextResponse.json(
        { error: 'postType, views, and initialViewIds are required' },
        { status: 400 }
      );
    }

    // Read current profile JSON
    const filePath = getActiveProfileFilePath();
    const fileContent = JSON.parse(readFileSync(filePath, 'utf-8'));
    if (!fileContent.ui) fileContent.ui = {};
    if (!fileContent.ui.views) fileContent.ui.views = [];

    const existingViews: ViewConfig[] = fileContent.ui.views;
    const submittedIds = new Set(views.map((v) => v.id));
    const initialIds = new Set(initialViewIds);

    // Compute deleted views (were in initial load but not in final submission)
    const deletedIds = new Set<string>();
    initialViewIds.forEach((id) => {
      if (!submittedIds.has(id)) deletedIds.add(id);
    });

    // Merge: keep existing views that weren't deleted, update modified, add new
    const mergedViews: ViewConfig[] = [];
    const handledIds = new Set<string>();

    for (const existing of existingViews) {
      if (deletedIds.has(existing.id)) continue;
      const submitted = views.find((v) => v.id === existing.id);
      if (submitted) {
        mergedViews.push(submitted);
        handledIds.add(existing.id);
      } else {
        mergedViews.push(existing);
      }
    }

    // Add brand-new views
    for (const view of views) {
      if (!handledIds.has(view.id)) {
        mergedViews.push(view);
      }
    }

    fileContent.ui.views = mergedViews;

    writeFileSync(filePath, JSON.stringify(fileContent, null, 2) + '\n', 'utf-8');

    // Update in-memory profile
    manager.setViews(fileContent.ui.views);

    return NextResponse.json({
      success: true,
      viewCount: views.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to save views: ${error}` },
      { status: 500 }
    );
  }
}
