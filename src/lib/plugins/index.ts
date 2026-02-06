/**
 * Juggernaut Plugin System
 *
 * This module provides the public API for the plugin system.
 * Import from '@/lib/plugins' to access plugin functionality.
 */

// ─── Types ───────────────────────────────────────────────────────────────────
export type {
  // Plugin core types
  PluginManifest,
  JuggernautPlugin,
  SettingDefinition,

  // Core API
  CoreAPI,
  ApiRouteHandler,

  // Hook system
  HookSystem,
  HookCallback,
  HookContext,
  StandardHooks,

  // UI types
  TabDefinition,
  TabComponentProps,
  FieldRendererProps,
  FieldDefinition,
  SettingsPanelProps,
  FilterComponentProps,

  // Resource types
  WPResource,
  LocalResource,
  PushPayload,
  Term,

  // Profile types
  SiteProfile,
  SiteConfig,
  RequiredPlugin,
  PostTypeConfig,
  TaxonomyConfig,
  UIConfig,
  TabConfig,

  // Registry types
  PluginState,
  PluginRegistryState,
} from './types';

// ─── Hook System ─────────────────────────────────────────────────────────────
export {
  createHookSystem,
  getHookSystem,
  resetHookSystem,
  HOOKS,
} from './hooks';

// ─── Plugin Registry ─────────────────────────────────────────────────────────
export {
  PluginRegistry,
  getPluginRegistry,
  loadRegistryState,
  saveRegistryState,
} from './registry';

// ─── Plugin Loader ───────────────────────────────────────────────────────────
export {
  PluginLoader,
  getPluginLoader,
  createCoreAPI,
} from './loader';

// ─── Initialization Helper ───────────────────────────────────────────────────

import { getHookSystem } from './hooks';
import { getPluginLoader, createCoreAPI } from './loader';

/**
 * Initialize the entire plugin system
 * Call this once at application startup
 */
export async function initializePluginSystem(): Promise<void> {
  const hooks = getHookSystem();
  const coreAPI = createCoreAPI(hooks);
  const loader = getPluginLoader();

  await loader.initialize(coreAPI);

  console.log('[PluginSystem] Initialization complete');
}

/**
 * Shutdown the plugin system
 * Call this when the application is closing
 */
export async function shutdownPluginSystem(): Promise<void> {
  const loader = getPluginLoader();
  await loader.deactivateAllPlugins();

  console.log('[PluginSystem] Shutdown complete');
}

// ─── Bundled Plugins ─────────────────────────────────────────────────────────

export { bundledPlugins, getBundledPlugin, getBundledPluginIds } from './bundled';
export { metaBoxPlugin } from './bundled/metabox';
export { seopressPlugin } from './bundled/seopress';

// ─── Initialization ──────────────────────────────────────────────────────────

export {
  initializePlugins,
  ensurePluginsInitialized,
  isPluginSystemInitialized,
  getPluginSystemState,
} from './init';
