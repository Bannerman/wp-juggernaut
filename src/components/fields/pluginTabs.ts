/**
 * Plugin Tab Registration
 *
 * Allows plugins to register custom React components as EditModal tabs.
 * This is the UI counterpart to the `getTabs()` method on JuggernautPlugin.
 *
 * Plugins call `registerPluginTab()` during their `initialize()` lifecycle
 * to make a tab component available. EditModal checks this registry when
 * rendering a tab that isn't hardcoded (basic/seo/classification/ai) and
 * isn't a dynamic field_layout tab.
 *
 * @example
 * ```ts
 * // In your plugin's initialize():
 * import { registerPluginTab } from '@/components/fields/pluginTabs';
 * import { MyCustomTab } from './MyCustomTab';
 *
 * registerPluginTab('my-tab', MyCustomTab);
 * ```
 */

import type { ComponentType } from 'react';

/**
 * Props passed to plugin-registered tab components.
 * Matches the shape that EditModal can provide.
 */
export interface PluginTabProps {
  /** The resource being edited (null in create mode) */
  resource: {
    id: number;
    title: string;
    slug: string;
    status: string;
    modified_gmt: string;
    is_dirty: boolean;
    taxonomies: Record<string, number[]>;
    meta_box: Record<string, unknown>;
  };
  /** All available terms by taxonomy slug */
  terms: Record<string, Array<{ id: number; taxonomy: string; name: string; slug: string; parent_id: number }>>;
  /** Update a meta_box field value */
  updateMetaField: (key: string, value: unknown) => void;
  /** Whether the modal is in create mode */
  isCreateMode: boolean;
  /** Site URL from profile */
  siteUrl?: string;
  /**
   * Plugin-specific context data passed by EditModal.
   * Plugins cast this to their expected shape (e.g., SEO state).
   */
  context?: Record<string, unknown>;
}

/**
 * Registry of plugin-provided tab components.
 * Keyed by tab ID (must match the tab ID in the profile's ui.tabs config).
 */
const pluginTabRegistry: Record<string, ComponentType<PluginTabProps>> = {};

/**
 * Register a custom tab component for a tab ID.
 * Call this from a plugin's `initialize()` method.
 *
 * The tab ID must match a tab defined in the profile's `ui.tabs[]` config,
 * or be added to `enabledTabs` via the profile's `required_plugins` setup.
 */
export function registerPluginTab(
  tabId: string,
  component: ComponentType<PluginTabProps>
): void {
  pluginTabRegistry[tabId] = component;
}

/**
 * Unregister a plugin tab component.
 * Call this from a plugin's `deactivate()` method.
 */
export function unregisterPluginTab(tabId: string): void {
  delete pluginTabRegistry[tabId];
}

/**
 * Get a registered plugin tab component by ID.
 * Returns undefined if no plugin has registered this tab.
 */
export function getPluginTab(tabId: string): ComponentType<PluginTabProps> | undefined {
  return pluginTabRegistry[tabId];
}

/**
 * Get all registered plugin tab IDs.
 * Useful for debugging or listing available plugin tabs.
 */
export function getRegisteredPluginTabIds(): string[] {
  return Object.keys(pluginTabRegistry);
}
