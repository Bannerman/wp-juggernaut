/**
 * Bundled Plugins Index
 *
 * This module exports all bundled plugins that ship with Juggernaut.
 * Bundled plugins are disabled by default and must be enabled by profiles.
 */

import type { JuggernautPlugin } from '../types';

// Import bundled plugins
import metaBoxPlugin from './metabox';
import seopressPlugin from './seopress';
import aiFillPlugin from './ai-fill';
import convertPostTypePlugin from './convert-post-type';
// Future bundled plugins:
// import woocommercePlugin from './woocommerce';
// import acfPlugin from './acf';

/**
 * All bundled plugins
 */
export const bundledPlugins: JuggernautPlugin[] = [
  metaBoxPlugin,
  seopressPlugin,
  aiFillPlugin,
  convertPostTypePlugin,
  // woocommercePlugin,
  // acfPlugin,
];

/**
 * Get a bundled plugin by ID
 */
export function getBundledPlugin(pluginId: string): JuggernautPlugin | undefined {
  return bundledPlugins.find((p) => p.id === pluginId);
}

/**
 * Get all bundled plugin IDs
 */
export function getBundledPluginIds(): string[] {
  return bundledPlugins.map((p) => p.id);
}

// Re-export individual plugins for direct imports
export { metaBoxPlugin };
export { seopressPlugin };
export { aiFillPlugin };
export { convertPostTypePlugin };
// export { woocommercePlugin };
// export { acfPlugin };
