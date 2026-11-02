/**
 * Profile Import/Export API Route
 *
 * GET    /api/profile/import-export?list=1        - List available profiles
 * GET    /api/profile/import-export?id=<profileId> - Export a profile as JSON
 * POST   /api/profile/import-export                - Import a profile from JSON body
 *                                                    (persisted to ~/.juggernaut/profiles)
 * DELETE /api/profile/import-export?id=<profileId> - Delete a user profile file
 */

import { NextRequest, NextResponse } from 'next/server';
import { getProfileManager, ensureProfileLoaded, validateProfile } from '@/lib/profiles';
import { getUserProfilesDir } from '@/lib/user-config-dir';
import { onProfileChanged } from '@/lib/plugins/init';
import type { SiteProfile } from '@/lib/plugins/types';

/**
 * POST /api/profile/import-export
 * Import a profile from a JSON body and persist it to the user profiles dir.
 * Body: the profile JSON, or `{ profile: <json>, activate?: boolean }`.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const wrapped = !!body && typeof body === 'object' && !Array.isArray(body)
      && 'profile' in body && !!body.profile && typeof body.profile === 'object';
    const rawProfile: unknown = wrapped ? body.profile : body;
    const activate = wrapped ? body.activate === true : false;

    try {
      validateProfile(JSON.parse(JSON.stringify(rawProfile)));
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 });
    }

    const manager = getProfileManager();
    const { profile, filePath } = manager.importProfile(rawProfile);

    if (activate) {
      manager.setCurrentProfile(profile.profile_id, { persist: true });
      await onProfileChanged();
    }

    return NextResponse.json({
      success: true,
      profile: {
        id: profile.profile_id,
        name: profile.profile_name,
        version: profile.profile_version,
      },
      filePath,
      activated: activate,
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
 * Export a profile as JSON. If no id is specified, exports the active profile.
 * GET /api/profile/import-export?list=1 lists all available profiles.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get('id');
    const manager = getProfileManager();

    if (searchParams.get('list')) {
      // Re-scan so files dropped into the folder show up without a restart
      manager.discoverUserProfiles();
      ensureProfileLoaded();
      return NextResponse.json({
        profiles: manager.listProfileSummaries(),
        profilesDir: getUserProfilesDir(),
      });
    }

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

/**
 * DELETE /api/profile/import-export?id=<profileId>
 * Delete a user profile file. The bundled default profile cannot be deleted.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get('id');
    if (!profileId) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    const manager = getProfileManager();
    const source = manager.getProfileSource(profileId);
    if (!source) {
      return NextResponse.json({ error: `Profile not found: ${profileId}` }, { status: 404 });
    }
    if (source.kind === 'bundled') {
      return NextResponse.json({ error: 'The bundled default profile cannot be deleted' }, { status: 400 });
    }
    const wasActive = manager.getCurrentProfile()?.profile_id === profileId;
    manager.deleteUserProfile(profileId);
    if (wasActive) await onProfileChanged();
    return NextResponse.json({ success: true, deleted: profileId });
  } catch (error) {
    console.error('[API] Failed to delete profile:', error);
    return NextResponse.json({ error: 'Failed to delete profile' }, { status: 500 });
  }
}
