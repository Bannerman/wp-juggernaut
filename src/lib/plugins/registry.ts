/**
 * Juggernaut Plugin Registry
 *
 * Manages plugin state (enabled/disabled) and persists it to disk.
 * The registry tracks which plugins are installed and their settings.
 */

import fs from 'fs';
import path from 'path';
import type { PluginState, PluginRegistryState } from './types';

// Registry file location (in user data directory)
const REGISTRY_FILENAME = 'plugin-registry.json';

/**
 * Get the path to the registry file
 */
function getRegistryPath(): string {
  // In development, store in project root
  // In production (Electron), this would be in app data directory
  const dataDir = process.env.JUGGERNAUT_DATA_DIR || process.cwd();
  return path.join(dataDir, 'data', REGISTRY_FILENAME);
}

/**
 * Ensure the data directory exists
 */
function ensureDataDir(): void {
  const registryPath = getRegistryPath();
  const dir = path.dirname(registryPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Load registry state from disk
 */
export function loadRegistryState(): PluginRegistryState {
  const registryPath = getRegistryPath();

  if (!fs.existsSync(registryPath)) {
    return {
      plugins: {},
      updatedAt: new Date().toISOString(),
    };
  }

  try {
    const content = fs.readFileSync(registryPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('[PluginRegistry] Failed to load registry:', error);
    return {
      plugins: {},
      updatedAt: new Date().toISOString(),
    };
  }
}

/**
 * Save registry state to disk
 */
export function saveRegistryState(state: PluginRegistryState): void {
  ensureDataDir();
  const registryPath = getRegistryPath();

  try {
    const content = JSON.stringify(
      { ...state, updatedAt: new Date().toISOString() },
      null,
      2
    );
    fs.writeFileSync(registryPath, content, 'utf-8');
  } catch (error) {
    console.error('[PluginRegistry] Failed to save registry:', error);
  }
}

/**
 * Plugin Registry class
 * Singleton that manages plugin state
 */
export class PluginRegistry {
  private state: PluginRegistryState;
  private static instance: PluginRegistry | null = null;

  private constructor() {
    this.state = loadRegistryState();
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): PluginRegistry {
    if (!PluginRegistry.instance) {
      PluginRegistry.instance = new PluginRegistry();
    }
    return PluginRegistry.instance;
  }

  /**
   * Reset the singleton (for testing)
   */
  static reset(): void {
    PluginRegistry.instance = null;
  }

  /**
   * Get state for a specific plugin
   */
  getPluginState(pluginId: string): PluginState | undefined {
    return this.state.plugins[pluginId];
  }

  /**
   * Get all plugin states
   */
  getAllPluginStates(): Record<string, PluginState> {
    return { ...this.state.plugins };
  }

  /**
   * Check if a plugin is enabled
   */
  isPluginEnabled(pluginId: string): boolean {
    return this.state.plugins[pluginId]?.enabled ?? false;
  }

  /**
   * Register a plugin (called when plugin is discovered)
   */
  registerPlugin(
    pluginId: string,
    tier: 'bundled' | 'community' | 'premium',
    version: string
  ): void {
    if (!this.state.plugins[pluginId]) {
      this.state.plugins[pluginId] = {
        id: pluginId,
        enabled: false, // Disabled by default
        tier,
        version,
        installedAt: new Date().toISOString(),
      };
      this.save();
    } else {
      // Update version if changed
      if (this.state.plugins[pluginId].version !== version) {
        this.state.plugins[pluginId].version = version;
        this.save();
      }
    }
  }

  /**
   * Enable a plugin
   */
  enablePlugin(pluginId: string): boolean {
    const state = this.state.plugins[pluginId];
    if (!state) {
      console.error(`[PluginRegistry] Cannot enable unknown plugin: ${pluginId}`);
      return false;
    }

    if (!state.enabled) {
      state.enabled = true;
      state.enabledAt = new Date().toISOString();
      this.save();
    }

    return true;
  }

  /**
   * Disable a plugin
   */
  disablePlugin(pluginId: string): boolean {
    const state = this.state.plugins[pluginId];
    if (!state) {
      console.error(`[PluginRegistry] Cannot disable unknown plugin: ${pluginId}`);
      return false;
    }

    if (state.enabled) {
      state.enabled = false;
      state.enabledAt = undefined;
      this.save();
    }

    return true;
  }

  /**
   * Update plugin settings
   */
  updatePluginSettings(
    pluginId: string,
    settings: Record<string, unknown>
  ): boolean {
    const state = this.state.plugins[pluginId];
    if (!state) {
      console.error(`[PluginRegistry] Cannot update settings for unknown plugin: ${pluginId}`);
      return false;
    }

    state.settings = { ...state.settings, ...settings };
    this.save();
    return true;
  }

  /**
   * Get plugin settings
   */
  getPluginSettings(pluginId: string): Record<string, unknown> {
    return this.state.plugins[pluginId]?.settings ?? {};
  }

  /**
   * Remove a plugin from registry (for community plugins)
   */
  unregisterPlugin(pluginId: string): boolean {
    const state = this.state.plugins[pluginId];
    if (!state) {
      return false;
    }

    // Don't allow removing bundled plugins
    if (state.tier === 'bundled') {
      console.error(`[PluginRegistry] Cannot unregister bundled plugin: ${pluginId}`);
      return false;
    }

    delete this.state.plugins[pluginId];
    this.save();
    return true;
  }

  /**
   * Get list of enabled plugin IDs
   */
  getEnabledPluginIds(): string[] {
    return Object.entries(this.state.plugins)
      .filter(([, state]) => state.enabled)
      .map(([id]) => id);
  }

  /**
   * Get list of bundled plugin IDs
   */
  getBundledPluginIds(): string[] {
    return Object.entries(this.state.plugins)
      .filter(([, state]) => state.tier === 'bundled')
      .map(([id]) => id);
  }

  /**
   * Enable multiple plugins at once (for profile import)
   */
  enablePlugins(pluginIds: string[]): { success: string[]; failed: string[] } {
    const success: string[] = [];
    const failed: string[] = [];

    for (const id of pluginIds) {
      if (this.enablePlugin(id)) {
        success.push(id);
      } else {
        failed.push(id);
      }
    }

    return { success, failed };
  }

  /**
   * Save state to disk
   */
  private save(): void {
    saveRegistryState(this.state);
  }

  /**
   * Reload state from disk
   */
  reload(): void {
    this.state = loadRegistryState();
  }
}

/**
 * Get the plugin registry instance
 */
export function getPluginRegistry(): PluginRegistry {
  return PluginRegistry.getInstance();
}
