/**
 * Plugin Features API Route
 *
 * GET /api/plugins/features - Get features provided by enabled plugins
 */

import { NextResponse } from 'next/server';
import { getPluginRegistry } from '@/lib/plugins/registry';
import { bundledPlugins } from '@/lib/plugins/bundled';
import { ensurePluginsInitialized } from '@/lib/plugins/init';

/**
 * Features provided by enabled plugins
 */
interface EnabledFeatures {
  /** Tabs that should be shown in the editor */
  tabs: string[];
  /** Field types that can be rendered */
  fieldTypes: string[];
  /** API extensions available */
  apiExtensions: string[];
  /** Plugin IDs that are enabled */
  enabledPlugins: string[];
}

/**
 * GET /api/plugins/features
 * Returns features that are currently active based on enabled plugins
 */
export async function GET() {
  try {
    // Ensure plugin system is initialized
    await ensurePluginsInitialized();

    const registry = getPluginRegistry();

    // Collect features from enabled plugins
    const features: EnabledFeatures = {
      tabs: ['basic', 'classification', 'ai'], // Core tabs always available
      fieldTypes: [],
      apiExtensions: [],
      enabledPlugins: [],
    };

    for (const plugin of bundledPlugins) {
      if (registry.isPluginEnabled(plugin.id)) {
        features.enabledPlugins.push(plugin.id);

        // Add tabs from this plugin
        if (plugin.manifest.provides?.tabs) {
          features.tabs.push(...plugin.manifest.provides.tabs);
        }

        // Add field types
        if (plugin.manifest.provides?.field_types) {
          features.fieldTypes.push(...plugin.manifest.provides.field_types);
        }

        // Add API extensions
        if (plugin.manifest.provides?.api_extensions) {
          features.apiExtensions.push(...plugin.manifest.provides.api_extensions);
        }
      }
    }

    // Deduplicate
    features.tabs = Array.from(new Set(features.tabs));
    features.fieldTypes = Array.from(new Set(features.fieldTypes));
    features.apiExtensions = Array.from(new Set(features.apiExtensions));

    return NextResponse.json(features);
  } catch (error) {
    console.error('[API] Failed to get plugin features:', error);
    return NextResponse.json(
      { error: 'Failed to get plugin features' },
      { status: 500 }
    );
  }
}
