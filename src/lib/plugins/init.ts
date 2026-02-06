/**
 * Plugin System Initialization
 *
 * This module handles initializing the plugin system on app startup.
 * It discovers bundled plugins and restores previously-enabled plugins.
 */

import { getPluginRegistry } from './registry';
import { getPluginLoader, createCoreAPI } from './loader';
import { getHookSystem } from './hooks';

// Track initialization state
let initialized = false;
let initializationPromise: Promise<void> | null = null;

/**
 * Initialize the plugin system
 * Safe to call multiple times - only initializes once
 */
export async function initializePlugins(): Promise<void> {
  // Return existing promise if already initializing
  if (initializationPromise) {
    return initializationPromise;
  }

  // Skip if already initialized
  if (initialized) {
    return;
  }

  initializationPromise = doInitialize();
  return initializationPromise;
}

/**
 * Internal initialization logic
 */
async function doInitialize(): Promise<void> {
  try {
    console.log('[PluginInit] Starting plugin system initialization...');

    // Create the core API
    const hooks = getHookSystem();
    const coreAPI = createCoreAPI(hooks);

    // Initialize the loader (discovers bundled plugins)
    const loader = getPluginLoader();
    await loader.initialize(coreAPI);

    // Get registry to check previously-enabled plugins
    const registry = getPluginRegistry();
    const enabledIds = registry.getEnabledPluginIds();

    // Activate any previously-enabled plugins
    if (enabledIds.length > 0) {
      console.log(`[PluginInit] Restoring ${enabledIds.length} enabled plugins...`);
      for (const pluginId of enabledIds) {
        try {
          await loader.activatePlugin(pluginId);
        } catch (err) {
          console.error(`[PluginInit] Failed to activate plugin ${pluginId}:`, err);
        }
      }
    }

    initialized = true;
    console.log('[PluginInit] Plugin system initialized successfully');
  } catch (error) {
    console.error('[PluginInit] Failed to initialize plugin system:', error);
    throw error;
  }
}

/**
 * Check if the plugin system is initialized
 */
export function isPluginSystemInitialized(): boolean {
  return initialized;
}

/**
 * Get the initialization state
 */
export function getPluginSystemState(): {
  initialized: boolean;
  pluginCount: number;
  enabledCount: number;
} {
  const loader = getPluginLoader();
  const registry = getPluginRegistry();

  return {
    initialized,
    pluginCount: loader.getAllPlugins().length,
    enabledCount: registry.getEnabledPluginIds().length,
  };
}

/**
 * Ensure plugins are initialized
 * Convenience wrapper that initializes if needed
 */
export async function ensurePluginsInitialized(): Promise<void> {
  if (!initialized) {
    await initializePlugins();
  }
}
