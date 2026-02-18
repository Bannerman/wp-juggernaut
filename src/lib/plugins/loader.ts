/**
 * Juggernaut Plugin Loader
 *
 * Discovers, loads, and initializes plugins.
 * Manages plugin lifecycle and provides access to loaded plugins.
 */

import type {
  JuggernautPlugin,
  PluginManifest,
  CoreAPI,
  SiteProfile,
  HookSystem,
} from './types';
import { getPluginRegistry } from './registry';
import { getHookSystem, HOOKS } from './hooks';
import { getProfileManager } from '../profiles';

/**
 * Plugin loader state
 */
interface LoaderState {
  /** All discovered plugins (keyed by ID) */
  plugins: Map<string, JuggernautPlugin>;

  /** Currently active (initialized) plugins */
  activePlugins: Set<string>;

  /** Core API instance */
  coreAPI: CoreAPI | null;

  /** Whether the loader has been initialized */
  initialized: boolean;
}

/**
 * Plugin Loader class
 * Singleton that manages plugin discovery and lifecycle
 */
export class PluginLoader {
  private state: LoaderState;
  private static instance: PluginLoader | null = null;

  private constructor() {
    this.state = {
      plugins: new Map(),
      activePlugins: new Set(),
      coreAPI: null,
      initialized: false,
    };
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): PluginLoader {
    if (!PluginLoader.instance) {
      PluginLoader.instance = new PluginLoader();
    }
    return PluginLoader.instance;
  }

  /**
   * Reset the singleton (for testing)
   */
  static reset(): void {
    PluginLoader.instance = null;
  }

  /**
   * Initialize the plugin loader
   * Call this once at app startup
   */
  async initialize(coreAPI: CoreAPI): Promise<void> {
    if (this.state.initialized) {
      console.warn('[PluginLoader] Already initialized');
      return;
    }

    this.state.coreAPI = coreAPI;
    this.state.initialized = true;

    // Discover bundled plugins
    await this.discoverBundledPlugins();

    console.log(
      `[PluginLoader] Initialized with ${this.state.plugins.size} plugins`
    );
  }

  /**
   * Discover bundled plugins from the plugins directory
   * In v1.0, plugins are statically imported
   */
  private async discoverBundledPlugins(): Promise<void> {
    try {
      // Import bundled plugins
      const { bundledPlugins } = await import('./bundled');

      // Register each bundled plugin
      for (const plugin of bundledPlugins) {
        this.registerPlugin(plugin);
      }

      console.log(
        `[PluginLoader] Discovered ${bundledPlugins.length} bundled plugins`
      );
    } catch (error) {
      console.error('[PluginLoader] Failed to discover bundled plugins:', error);
    }
  }

  /**
   * Register a plugin with the loader
   */
  registerPlugin(plugin: JuggernautPlugin): void {
    if (this.state.plugins.has(plugin.id)) {
      console.warn(`[PluginLoader] Plugin already registered: ${plugin.id}`);
      return;
    }

    this.state.plugins.set(plugin.id, plugin);

    // Register in the registry for persistence
    const registry = getPluginRegistry();
    registry.registerPlugin(
      plugin.id,
      plugin.manifest.tier,
      plugin.manifest.version
    );

    console.log(`[PluginLoader] Registered plugin: ${plugin.id}`);
  }

  /**
   * Get a plugin by ID
   */
  getPlugin(pluginId: string): JuggernautPlugin | undefined {
    return this.state.plugins.get(pluginId);
  }

  /**
   * Get all registered plugins
   */
  getAllPlugins(): JuggernautPlugin[] {
    return Array.from(this.state.plugins.values());
  }

  /**
   * Get all active (initialized) plugins
   */
  getActivePlugins(): JuggernautPlugin[] {
    return Array.from(this.state.activePlugins)
      .map((id) => this.state.plugins.get(id))
      .filter((p): p is JuggernautPlugin => p !== undefined);
  }

  /**
   * Check if a plugin is active
   */
  isPluginActive(pluginId: string): boolean {
    return this.state.activePlugins.has(pluginId);
  }

  /**
   * Activate a plugin
   * Calls the plugin's initialize() method
   */
  async activatePlugin(pluginId: string): Promise<boolean> {
    const plugin = this.state.plugins.get(pluginId);
    if (!plugin) {
      console.error(`[PluginLoader] Cannot activate unknown plugin: ${pluginId}`);
      return false;
    }

    if (this.state.activePlugins.has(pluginId)) {
      console.warn(`[PluginLoader] Plugin already active: ${pluginId}`);
      return true;
    }

    if (!this.state.coreAPI) {
      console.error('[PluginLoader] Cannot activate plugin: loader not initialized');
      return false;
    }

    try {
      // Initialize the plugin
      await plugin.initialize(this.state.coreAPI);
      this.state.activePlugins.add(pluginId);

      // Update registry
      const registry = getPluginRegistry();
      registry.enablePlugin(pluginId);

      // Trigger hook
      const hooks = getHookSystem();
      await hooks.trigger(HOOKS.PLUGIN_ENABLED, { pluginId, plugin });

      console.log(`[PluginLoader] Activated plugin: ${pluginId}`);
      return true;
    } catch (error) {
      console.error(`[PluginLoader] Failed to activate plugin ${pluginId}:`, error);
      return false;
    }
  }

  /**
   * Deactivate a plugin
   * Calls the plugin's deactivate() method
   */
  async deactivatePlugin(pluginId: string): Promise<boolean> {
    const plugin = this.state.plugins.get(pluginId);
    if (!plugin) {
      console.error(`[PluginLoader] Cannot deactivate unknown plugin: ${pluginId}`);
      return false;
    }

    if (!this.state.activePlugins.has(pluginId)) {
      console.warn(`[PluginLoader] Plugin not active: ${pluginId}`);
      return true;
    }

    try {
      // Deactivate the plugin
      await plugin.deactivate();
      this.state.activePlugins.delete(pluginId);

      // Update registry
      const registry = getPluginRegistry();
      registry.disablePlugin(pluginId);

      // Trigger hook
      const hooks = getHookSystem();
      await hooks.trigger(HOOKS.PLUGIN_DISABLED, { pluginId });

      console.log(`[PluginLoader] Deactivated plugin: ${pluginId}`);
      return true;
    } catch (error) {
      console.error(`[PluginLoader] Failed to deactivate plugin ${pluginId}:`, error);
      return false;
    }
  }

  /**
   * Activate a plugin for a specific profile
   * Calls both initialize() and activate() with profile settings
   */
  async activatePluginForProfile(
    pluginId: string,
    profile: SiteProfile
  ): Promise<boolean> {
    const plugin = this.state.plugins.get(pluginId);
    if (!plugin) {
      console.error(`[PluginLoader] Cannot activate unknown plugin: ${pluginId}`);
      return false;
    }

    // First ensure plugin is initialized
    if (!this.state.activePlugins.has(pluginId)) {
      const initialized = await this.activatePlugin(pluginId);
      if (!initialized) {
        return false;
      }
    }

    try {
      // Get plugin settings from profile
      const settings = profile.plugin_settings?.[pluginId] ?? {};

      // Call activate with profile
      await plugin.activate(profile, settings);

      console.log(`[PluginLoader] Activated plugin ${pluginId} for profile ${profile.profile_id}`);
      return true;
    } catch (error) {
      console.error(`[PluginLoader] Failed to activate plugin ${pluginId} for profile:`, error);
      return false;
    }
  }

  /**
   * Activate all plugins required by a profile
   */
  async activateProfilePlugins(profile: SiteProfile): Promise<{
    success: string[];
    failed: string[];
  }> {
    const success: string[] = [];
    const failed: string[] = [];

    const requiredPlugins = profile.required_plugins ?? [];

    for (const requirement of requiredPlugins) {
      const plugin = this.state.plugins.get(requirement.id);

      if (!plugin) {
        console.warn(`[PluginLoader] Required plugin not found: ${requirement.id}`);
        failed.push(requirement.id);
        continue;
      }

      // Check version compatibility if specified
      if (requirement.version) {
        // TODO: Implement semver comparison
        // For now, just log the requirement
        console.log(
          `[PluginLoader] Plugin ${requirement.id} requires version ${requirement.version}`
        );
      }

      const activated = await this.activatePluginForProfile(requirement.id, profile);
      if (activated) {
        success.push(requirement.id);
      } else {
        failed.push(requirement.id);
      }
    }

    return { success, failed };
  }

  /**
   * Deactivate all active plugins
   */
  async deactivateAllPlugins(): Promise<void> {
    const activeIds = Array.from(this.state.activePlugins);

    for (const pluginId of activeIds) {
      await this.deactivatePlugin(pluginId);
    }
  }

  /**
   * Get plugin tabs for the editor
   * Collects tabs from all active plugins
   */
  getPluginTabs(): ReturnType<NonNullable<JuggernautPlugin['getTabs']>> {
    const tabs: ReturnType<NonNullable<JuggernautPlugin['getTabs']>> = [];

    for (const plugin of this.getActivePlugins()) {
      if (plugin.getTabs) {
        tabs.push(...plugin.getTabs());
      }
    }

    return tabs;
  }

  /**
   * Get field renderers from all active plugins
   */
  getFieldRenderers(): Record<string, React.ComponentType<any>> {
    const renderers: Record<string, React.ComponentType<any>> = {};

    for (const plugin of this.getActivePlugins()) {
      if (plugin.getFieldRenderers) {
        Object.assign(renderers, plugin.getFieldRenderers());
      }
    }

    return renderers;
  }

  /**
   * Get filter components from all active plugins
   */
  getFilterComponents(): React.ComponentType<any>[] {
    const components: React.ComponentType<any>[] = [];

    for (const plugin of this.getActivePlugins()) {
      if (plugin.getFilterComponents) {
        components.push(...plugin.getFilterComponents());
      }
    }

    return components;
  }

  /**
   * Get settings panels from all active plugins
   */
  getSettingsPanels(): Array<{
    pluginId: string;
    pluginName: string;
    component: React.ComponentType<any>;
  }> {
    const panels: Array<{
      pluginId: string;
      pluginName: string;
      component: React.ComponentType<any>;
    }> = [];

    for (const plugin of this.getActivePlugins()) {
      if (plugin.getSettingsPanel) {
        panels.push({
          pluginId: plugin.id,
          pluginName: plugin.name,
          component: plugin.getSettingsPanel(),
        });
      }
    }

    return panels;
  }
}

/**
 * Get the plugin loader instance
 */
export function getPluginLoader(): PluginLoader {
  return PluginLoader.getInstance();
}

/**
 * Create the Core API object to pass to plugins
 */
export function createCoreAPI(hooks: HookSystem): CoreAPI {
  return {
    version: '1.0.0',
    hooks,

    getProfile: () => {
      return getProfileManager().getCurrentProfile();
    },

    getBaseUrl: () => {
      // Will be connected to site config
      return process.env.WP_BASE_URL || '';
    },

    getAuthHeader: () => {
      // Will be connected to credential system
      const username = process.env.WP_USERNAME || '';
      const password = process.env.WP_APP_PASSWORD || '';
      return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    },

    database: {
      query: <T>(sql: string, params?: unknown[]): T[] => {
        // Will be connected to database module
        console.warn('[CoreAPI] database.query not yet implemented');
        return [];
      },
      run: (sql: string, params?: unknown[]): void => {
        // Will be connected to database module
        console.warn('[CoreAPI] database.run not yet implemented');
      },
    },

    showNotification: (message: string, type: 'success' | 'error' | 'info' | 'warning') => {
      // Will be connected to UI notification system
      console.log(`[Notification] [${type}] ${message}`);
    },

    log: (message: string, level: 'debug' | 'info' | 'warn' | 'error' = 'info') => {
      const prefix = '[Plugin]';
      switch (level) {
        case 'debug':
          console.debug(prefix, message);
          break;
        case 'info':
          console.info(prefix, message);
          break;
        case 'warn':
          console.warn(prefix, message);
          break;
        case 'error':
          console.error(prefix, message);
          break;
      }
    },
  };
}
