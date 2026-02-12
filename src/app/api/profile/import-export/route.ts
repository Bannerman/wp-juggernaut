/**
 * Profile Import/Export API Route
 *
 * POST /api/profile/import-export - Import a profile from JSON body
 * GET  /api/profile/import-export?id=<profileId> - Export a profile as JSON download
 */

import { NextRequest, NextResponse } from 'next/server';
import { getProfileManager } from '@/lib/profiles';
import type { SiteProfile } from '@/lib/plugins/types';

/**
 * POST /api/profile/import-export
 * Import a profile from a JSON body
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.profile_id || typeof body.profile_id !== 'string') {
      return NextResponse.json(
        { error: 'Profile must have a string "profile_id" field' },
        { status: 400 }
      );
    }
    if (!body.profile_name || typeof body.profile_name !== 'string') {
      return NextResponse.json(
        { error: 'Profile must have a string "profile_name" field' },
        { status: 400 }
      );
    }
    if (!Array.isArray(body.sites) || body.sites.length === 0) {
      return NextResponse.json(
        { error: 'Profile must have at least one entry in "sites" array' },
        { status: 400 }
      );
    }

    const profile = body as SiteProfile;
    const manager = getProfileManager();

    // Register the imported profile
    manager.registerProfile(profile);

    return NextResponse.json({
      success: true,
      profile: {
        id: profile.profile_id,
        name: profile.profile_name,
        version: profile.profile_version,
      },
      message: `Profile "${profile.profile_name}" imported successfully`,
    });
  } catch (error) {
    console.error('[API] Failed to import profile:', error);
    return NextResponse.json(
      { error: 'Failed to import profile' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/profile/import-export?id=<profileId>
 * Export a profile as JSON
 * If no id is specified, exports the current active profile
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get('id');

    const manager = getProfileManager();
    let profile: SiteProfile | null | undefined;

    if (profileId) {
      profile = manager.getProfile(profileId);
      if (!profile) {
        return NextResponse.json(
          { error: `Profile not found: ${profileId}` },
          { status: 404 }
        );
      }
    } else {
      profile = manager.getCurrentProfile();
      if (!profile) {
        return NextResponse.json(
          { error: 'No active profile to export' },
          { status: 404 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error('[API] Failed to export profile:', error);
    return NextResponse.json(
      { error: 'Failed to export profile' },
      { status: 500 }
    );
  }
}
