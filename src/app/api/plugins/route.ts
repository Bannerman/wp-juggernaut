/**
 * Plugins API Route
 *
 * GET /api/plugins - List all plugins with their status
 * PATCH /api/plugins - Enable or disable a plugin
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPluginRegistry } from '@/lib/plugins/registry';
import { getPluginLoader } from '@/lib/plugins/loader';
import { bundledPlugins } from '@/lib/plugins/bundled';
import { ensurePluginsInitialized } from '@/lib/plugins/init';
import { ensureProfileLoaded } from '@/lib/profiles';

/**
 * Plugin info returned by the API
 */
interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  tier: 'bundled' | 'community' | 'premium';
  enabled: boolean;
  wordpress_plugin?: {
    name: string;
    slug: string;
    url?: string;
  };
  provides?: {
    tabs?: string[];
    field_types?: string[];
    api_extensions?: string[];
  };
}

/**
 * GET /api/plugins
 * Returns all available plugins with their current status
 */
export async function GET() {
  try {
    // Ensure plugin system is initialized
    await ensurePluginsInitialized();

    const registry = getPluginRegistry();

    // Build plugin info from bundled plugins
    const plugins: PluginInfo[] = bundledPlugins.map((plugin) => {
      const state = registry.getPluginState(plugin.id);

      // If plugin isn't registered yet, register it
      if (!state) {
        registry.registerPlugin(plugin.id, plugin.manifest.tier, plugin.manifest.version);
      }

      return {
        id: plugin.id,
        name: plugin.name,
        version: plugin.version,
        description: plugin.manifest.description,
        tier: plugin.manifest.tier,
        enabled: registry.isPluginEnabled(plugin.id),
        wordpress_plugin: plugin.manifest.wordpress_plugin,
        provides: plugin.manifest.provides,
      };
    });

    // Get summary stats
    const stats = {
      total: plugins.length,
      enabled: plugins.filter((p) => p.enabled).length,
      bundled: plugins.filter((p) => p.tier === 'bundled').length,
      community: plugins.filter((p) => p.tier === 'community').length,
    };

    return NextResponse.json({ plugins, stats });
  } catch (error) {
    console.error('[API] Failed to get plugins:', error);
    return NextResponse.json(
      { error: 'Failed to get plugins' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/plugins
 * Enable or disable a plugin
 *
 * Body: { pluginId: string, enabled: boolean }
 */
export async function PATCH(request: NextRequest) {
  try {
    // Ensure plugin system is initialized
    await ensurePluginsInitialized();

    const body = await request.json();
    const { pluginId, enabled } = body;

    if (!pluginId || typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Missing pluginId or enabled status' },
        { status: 400 }
      );
    }

    const registry = getPluginRegistry();

    // Check if plugin exists
    const plugin = bundledPlugins.find((p) => p.id === pluginId);
    if (!plugin) {
      return NextResponse.json(
        { error: `Plugin not found: ${pluginId}` },
        { status: 404 }
      );
    }

    // Enable or disable via both registry and loader lifecycle
    const loader = getPluginLoader();
    let success: boolean;
    if (enabled) {
      // Activate through loader (calls initialize + activate with profile)
      try {
        const profile = ensureProfileLoaded();
        success = await loader.activatePluginForProfile(pluginId, profile);
      } catch {
        // Fall back to registry-only if profile isn't available
        success = registry.enablePlugin(pluginId);
      }
    } else {
      // Deactivate through loader (calls deactivate + updates registry)
      success = await loader.deactivatePlugin(pluginId);
    }

    if (!success) {
      return NextResponse.json(
        { error: `Failed to ${enabled ? 'enable' : 'disable'} plugin` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      pluginId,
      enabled: registry.isPluginEnabled(pluginId),
      message: `Plugin ${plugin.name} ${enabled ? 'enabled' : 'disabled'}`,
    });
  } catch (error) {
    console.error('[API] Failed to update plugin:', error);
    return NextResponse.json(
      { error: 'Failed to update plugin' },
      { status: 500 }
    );
  }
}
