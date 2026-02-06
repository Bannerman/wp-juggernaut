/**
 * Profile API Route
 *
 * GET /api/profile - Get active profile configuration for frontend
 * PATCH /api/profile - Switch active profile or site
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getProfileManager,
  ensureProfileLoaded,
  getProfileConfig,
} from '@/lib/profiles';
import { getPluginRegistry } from '@/lib/plugins/registry';
import { bundledPlugins } from '@/lib/plugins/bundled';
import { ensurePluginsInitialized } from '@/lib/plugins/init';

/**
 * GET /api/profile
 * Returns the active profile configuration for the frontend
 */
export async function GET() {
  try {
    // Ensure profile is loaded
    const profile = ensureProfileLoaded();
    const config = getProfileConfig();

    // Get enabled plugins
    await ensurePluginsInitialized();
    const registry = getPluginRegistry();

    // Determine which plugin features are enabled
    const enabledPluginIds = registry.getEnabledPluginIds();
    const enabledTabs: string[] = ['basic', 'classification', 'ai']; // Core tabs

    for (const plugin of bundledPlugins) {
      if (enabledPluginIds.includes(plugin.id)) {
        if (plugin.manifest.provides?.tabs) {
          enabledTabs.push(...plugin.manifest.provides.tabs);
        }
      }
    }

    // Get primary post type
    const primaryPostType = config.postTypes?.find(pt => pt.is_primary) || config.postTypes?.[0];

    return NextResponse.json({
      profile: {
        id: profile.profile_id,
        name: profile.profile_name,
        version: profile.profile_version,
      },
      activeSite: config.activeSite,
      siteUrl: config.activeSite?.url || '',
      postTypes: config.postTypes,
      postType: primaryPostType ? {
        slug: primaryPostType.slug,
        name: primaryPostType.name,
        rest_base: primaryPostType.rest_base,
      } : null,
      taxonomies: config.taxonomies,
      taxonomyLabels: config.taxonomyLabels,
      filterTaxonomies: config.filterTaxonomies,
      enabledPlugins: enabledPluginIds,
      enabledTabs: Array.from(new Set(enabledTabs)),
      ui: config.ui,
    });
  } catch (error) {
    console.error('[API] Failed to get profile:', error);
    return NextResponse.json(
      { error: 'Failed to get profile configuration' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/profile
 * Switch active profile or site
 *
 * Body: { profileId?: string, siteId?: string }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { profileId, siteId } = body;

    const manager = getProfileManager();

    // Switch profile if specified
    if (profileId) {
      const success = manager.setCurrentProfile(profileId);
      if (!success) {
        return NextResponse.json(
          { error: `Profile not found: ${profileId}` },
          { status: 404 }
        );
      }
    }

    // Switch site if specified
    if (siteId) {
      const success = manager.setActiveSite(siteId);
      if (!success) {
        return NextResponse.json(
          { error: `Site not found: ${siteId}` },
          { status: 404 }
        );
      }
    }

    // Return updated config
    const config = getProfileConfig();

    return NextResponse.json({
      success: true,
      activeSite: config.activeSite,
      message: profileId
        ? `Switched to profile: ${profileId}`
        : siteId
          ? `Switched to site: ${siteId}`
          : 'No changes made',
    });
  } catch (error) {
    console.error('[API] Failed to update profile:', error);
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}
