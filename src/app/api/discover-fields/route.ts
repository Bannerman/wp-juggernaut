/**
 * GET /api/discover-fields?postType=resource
 *
 * Discovers available meta and taxonomy fields for a post type
 * by fetching a sample of resources from WordPress.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWpBaseUrl, getWpCredentials } from '@/lib/wp-client';
import { discoverFieldsForPostType } from '@/lib/discovery';
import { ensureProfileLoaded, getProfileManager } from '@/lib/profiles';
import type { MappableField } from '@/lib/plugins/types';

function getAuthHeader(): string {
  const creds = getWpCredentials();
  return 'Basic ' + Buffer.from(`${creds.username}:${creds.appPassword}`).toString('base64');
}

/** Convert a meta_box key like "text_content" to "Text Content" */
function humanizeKey(key: string): string {
  return key
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const postTypeSlug = searchParams.get('postType');

    if (!postTypeSlug) {
      return NextResponse.json(
        { error: 'postType query parameter is required' },
        { status: 400 }
      );
    }

    ensureProfileLoaded();
    const manager = getProfileManager();
    const postTypes = manager.getPostTypes();
    const ptConfig = postTypes.find((pt) => pt.slug === postTypeSlug);

    if (!ptConfig) {
      return NextResponse.json(
        { error: `Unknown post type: ${postTypeSlug}` },
        { status: 400 }
      );
    }

    const baseUrl = getWpBaseUrl();
    const authHeader = getAuthHeader();

    const discovered = await discoverFieldsForPostType(
      baseUrl,
      authHeader,
      ptConfig.rest_base,
      ptConfig.slug
    );

    const metaFields: MappableField[] = discovered.metaKeys.map((key) => ({
      key,
      label: humanizeKey(key),
      category: 'meta' as const,
      type: 'unknown',
    }));

    const taxonomyFields: MappableField[] = discovered.taxonomies.map((tax) => ({
      key: tax.slug,
      label: tax.name,
      category: 'taxonomy' as const,
      type: 'taxonomy',
    }));

    return NextResponse.json({ metaFields, taxonomyFields });
  } catch (error) {
    console.error('[API] Field discovery failed:', error);
    return NextResponse.json(
      { error: 'Field discovery failed', details: String(error) },
      { status: 500 }
    );
  }
}
