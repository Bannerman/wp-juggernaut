/**
 * SEO API Route
 *
 * GET /api/seo/[id] - Fetch SEO data for a resource
 * PATCH /api/seo/[id] - Update SEO data for a resource
 *
 * This route delegates to the SEOPress plugin for actual implementation.
 * If a different SEO plugin is needed (Yoast, RankMath), a separate
 * plugin would be created with its own API handling.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWpBaseUrl, getWpCredentials } from '@/lib/wp-client';
import { seopressPlugin, SEOData, DEFAULT_SEO_DATA } from '@/lib/plugins/bundled/seopress';

function getAuthHeader(): string {
  const creds = getWpCredentials();
  return 'Basic ' + Buffer.from(`${creds.username}:${creds.appPassword}`).toString('base64');
}

function getBaseUrl(): string {
  return getWpBaseUrl();
}

// Re-export SEOData type for consumers
export type { SEOData };

// GET /api/seo/[id] - Fetch SEO data for a resource
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const postId = parseInt(params.id, 10);

    if (isNaN(postId)) {
      return NextResponse.json({ error: 'Invalid post ID' }, { status: 400 });
    }

    // Check for source param - 'local' reads from DB, 'remote' fetches from WP
    const source = request.nextUrl.searchParams.get('source') || 'remote';

    if (source === 'local') {
      // Return locally cached SEO data
      const localSEO = seopressPlugin.getLocalSEOData(postId);
      return NextResponse.json({ seo: localSEO || DEFAULT_SEO_DATA, source: 'local' });
    }

    // Fetch from WordPress via SEOPress plugin
    const seo = await seopressPlugin.fetchSEOData(postId, getBaseUrl(), getAuthHeader());

    return NextResponse.json({ seo, source: 'remote' });
  } catch (error) {
    console.error('Error fetching SEO data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SEO data' },
      { status: 500 }
    );
  }
}

// PATCH /api/seo/[id] - Update SEO data for a resource
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const postId = parseInt(params.id, 10);

    if (isNaN(postId)) {
      return NextResponse.json({ error: 'Invalid post ID' }, { status: 400 });
    }

    const body = await request.json();

    // Check for target param - 'local' saves to DB only, 'remote' pushes to WP, 'both' does both
    const target = request.nextUrl.searchParams.get('target') || 'remote';

    // Build SEO data from body
    const seoData: Partial<SEOData> = {};
    if (body.title !== undefined) seoData.title = body.title;
    if (body.description !== undefined) seoData.description = body.description;
    if (body.canonical !== undefined) seoData.canonical = body.canonical;
    if (body.targetKeywords !== undefined) seoData.targetKeywords = body.targetKeywords;
    if (body.og) seoData.og = body.og;
    if (body.twitter) seoData.twitter = body.twitter;
    if (body.robots) seoData.robots = body.robots;

    let localSuccess = true;
    let remoteResult = { success: true, errors: [] as string[] };

    // Save to local database
    if (target === 'local' || target === 'both') {
      try {
        // Get existing data and merge
        const existing = seopressPlugin.getLocalSEOData(postId) || DEFAULT_SEO_DATA;
        const merged: SEOData = {
          ...existing,
          ...seoData,
          og: { ...existing.og, ...seoData.og },
          twitter: { ...existing.twitter, ...seoData.twitter },
          robots: { ...existing.robots, ...seoData.robots },
        };
        seopressPlugin.saveLocalSEOData(postId, merged);
      } catch (err) {
        localSuccess = false;
        console.error('Error saving SEO data locally:', err);
      }
    }

    // Push to WordPress
    if (target === 'remote' || target === 'both') {
      remoteResult = await seopressPlugin.updateSEOData(
        postId,
        seoData,
        getBaseUrl(),
        getAuthHeader()
      );
    }

    const allSuccess = localSuccess && remoteResult.success;

    if (!allSuccess) {
      return NextResponse.json({
        success: false,
        localSuccess,
        remoteSuccess: remoteResult.success,
        errors: remoteResult.errors,
      }, { status: 207 });
    }

    return NextResponse.json({ success: true, target });
  } catch (error) {
    console.error('Error updating SEO data:', error);
    return NextResponse.json(
      { error: 'Failed to update SEO data' },
      { status: 500 }
    );
  }
}
