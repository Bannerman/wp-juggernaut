/**
 * WordPress Discovery API Route
 *
 * GET /api/discover - Discover post types, taxonomies, and plugins on the connected WordPress site
 * POST /api/discover - Generate a profile from discovery results
 */

import { NextRequest, NextResponse } from 'next/server';
import { discoverWordPressSite, generateProfileFromDiscovery } from '@/lib/discovery';
import { getActiveBaseUrl } from '@/lib/site-config';

const WP_USERNAME = process.env.WP_USERNAME || '';
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD || '';

function getAuthHeader(): string {
  return 'Basic ' + Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString('base64');
}

/**
 * GET /api/discover
 * Discovers what's available on the connected WordPress site
 */
export async function GET() {
  try {
    const baseUrl = getActiveBaseUrl();
    const authHeader = getAuthHeader();

    if (!baseUrl) {
      return NextResponse.json(
        { error: 'No WordPress site configured' },
        { status: 400 }
      );
    }

    const discovery = await discoverWordPressSite(baseUrl, authHeader);

    return NextResponse.json(discovery);
  } catch (error) {
    console.error('[API] Discovery failed:', error);
    return NextResponse.json(
      { error: 'Discovery failed', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/discover
 * Generate a profile from discovery results
 *
 * Body: { profileName: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { profileName } = body;

    if (!profileName) {
      return NextResponse.json(
        { error: 'profileName is required' },
        { status: 400 }
      );
    }

    const baseUrl = getActiveBaseUrl();
    const authHeader = getAuthHeader();

    if (!baseUrl) {
      return NextResponse.json(
        { error: 'No WordPress site configured' },
        { status: 400 }
      );
    }

    // Run discovery
    const discovery = await discoverWordPressSite(baseUrl, authHeader);

    if (!discovery.success && discovery.post_types.length === 0) {
      return NextResponse.json(
        { error: 'Discovery failed - no post types found', details: discovery.errors },
        { status: 500 }
      );
    }

    // Generate profile
    const profile = generateProfileFromDiscovery(discovery, profileName);

    return NextResponse.json({
      success: true,
      discovery,
      profile,
    });
  } catch (error) {
    console.error('[API] Profile generation failed:', error);
    return NextResponse.json(
      { error: 'Profile generation failed', details: String(error) },
      { status: 500 }
    );
  }
}
