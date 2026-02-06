/**
 * Juggernaut Hook System
 *
 * An event emitter system that allows plugins to subscribe to and modify
 * data at various points in the application lifecycle.
 *
 * Hooks can:
 * - Transform data (return modified data)
 * - Perform side effects (return unchanged data)
 * - Run asynchronously
 *
 * Callbacks run in priority order (lower numbers first).
 */

import type { HookSystem, HookCallback, HookContext } from './types';

/**
 * Internal hook registration
 * Uses unknown for storage, actual types are enforced at registration time
 */
interface HookRegistration {
  // Using Function type for internal storage - type safety is enforced at API boundaries
  callback: (data: unknown, context: HookContext) => unknown | Promise<unknown>;
  priority: number;
  id: string;
}

/**
 * Create a new hook system instance
 */
export function createHookSystem(): HookSystem {
  // Map of hook name to registered callbacks
  const hooks = new Map<string, HookRegistration[]>();

  // Counter for generating unique IDs
  let idCounter = 0;

  /**
   * Subscribe to a hook
   */
  function on<T = unknown, R = T>(
    hookName: string,
    callback: HookCallback<T, R>,
    priority: number = 10
  ): () => void {
    const id = `hook_${++idCounter}`;

    const registration: HookRegistration = {
      callback: callback as HookRegistration['callback'],
      priority,
      id,
    };

    // Get or create the hook's callback list
    const callbacks = hooks.get(hookName) || [];
    callbacks.push(registration);

    // Sort by priority (lower numbers first)
    callbacks.sort((a, b) => a.priority - b.priority);

    hooks.set(hookName, callbacks);

    // Return unsubscribe function
    return () => {
      const currentCallbacks = hooks.get(hookName);
      if (currentCallbacks) {
        const index = currentCallbacks.findIndex((reg) => reg.id === id);
        if (index !== -1) {
          currentCallbacks.splice(index, 1);
        }
        if (currentCallbacks.length === 0) {
          hooks.delete(hookName);
        }
      }
    };
  }

  /**
   * Trigger a hook, running all registered callbacks
   * Each callback can transform the data
   */
  async function trigger<T = unknown>(
    hookName: string,
    data: T,
    context: HookContext = {}
  ): Promise<T> {
    const callbacks = hooks.get(hookName);

    if (!callbacks || callbacks.length === 0) {
      return data;
    }

    let result = data;

    for (const registration of callbacks) {
      try {
        const callbackResult = await registration.callback(result, context);

        // If callback returns undefined, keep the previous result
        if (callbackResult !== undefined) {
          result = callbackResult as T;
        }
      } catch (error) {
        console.error(
          `[Hooks] Error in hook "${hookName}" (callback ${registration.id}):`,
          error
        );
        // Continue with other callbacks even if one fails
      }
    }

    return result;
  }

  /**
   * Clear all callbacks for a hook
   */
  function clear(hookName: string): void {
    hooks.delete(hookName);
  }

  /**
   * Get the number of registered callbacks for a hook (for debugging)
   */
  function getCallbackCount(hookName: string): number {
    return hooks.get(hookName)?.length || 0;
  }

  /**
   * Get all registered hook names (for debugging)
   */
  function getRegisteredHooks(): string[] {
    return Array.from(hooks.keys());
  }

  return {
    on,
    trigger,
    clear,
    // Expose debug methods in development
    ...(process.env.NODE_ENV === 'development'
      ? { getCallbackCount, getRegisteredHooks }
      : {}),
  } as HookSystem;
}

/**
 * Standard hook names with descriptions
 * Use these constants to avoid typos
 */
export const HOOKS = {
  // ─── Resource Lifecycle ─────────────────────────────────────────────────

  /**
   * Called before syncing a resource from WordPress
   * Data: WPResource from WordPress API
   * Return: Modified WPResource to save locally
   */
  RESOURCE_BEFORE_SYNC: 'resource:beforeSync',

  /**
   * Called after a resource is synced and saved locally
   * Data: LocalResource that was saved
   * Return: Modified LocalResource (for plugin_data updates)
   */
  RESOURCE_AFTER_SYNC: 'resource:afterSync',

  /**
   * Called before pushing a resource to WordPress
   * Data: { resource: LocalResource, payload: PushPayload }
   * Return: Modified object with updated payload
   */
  RESOURCE_BEFORE_PUSH: 'resource:beforePush',

  /**
   * Called after a resource is successfully pushed
   * Data: { resource: LocalResource, response: WPResource }
   * Return: Same object (side effects only)
   */
  RESOURCE_AFTER_PUSH: 'resource:afterPush',

  /**
   * Called before saving a resource to local database
   * Data: LocalResource to save
   * Return: Modified LocalResource
   */
  RESOURCE_BEFORE_SAVE: 'resource:beforeSave',

  /**
   * Called after a resource is saved locally
   * Data: LocalResource that was saved
   * Return: Same resource (side effects only)
   */
  RESOURCE_AFTER_SAVE: 'resource:afterSave',

  // ─── UI Hooks ───────────────────────────────────────────────────────────

  /**
   * Called when registering tabs for the editor modal
   * Data: TabDefinition[] (current tabs)
   * Return: TabDefinition[] (with additional tabs)
   */
  UI_REGISTER_TABS: 'ui:registerTabs',

  /**
   * Called when registering filter components
   * Data: FilterComponent[] (current filters)
   * Return: FilterComponent[] (with additional filters)
   */
  UI_REGISTER_FILTERS: 'ui:registerFilters',

  /**
   * Called before rendering the edit modal
   * Data: { resource: LocalResource, tabs: TabDefinition[] }
   * Return: Same object (for modifications)
   */
  UI_BEFORE_RENDER: 'ui:beforeRender',

  // ─── Settings Hooks ─────────────────────────────────────────────────────

  /**
   * Called when registering settings panels
   * Data: SettingsPanel[] (current panels)
   * Return: SettingsPanel[] (with additional panels)
   */
  SETTINGS_REGISTER_PANEL: 'settings:registerPanel',

  /**
   * Called before saving settings
   * Data: { settings: Record<string, unknown>, profile: SiteProfile }
   * Return: Same object (with modified settings)
   */
  SETTINGS_BEFORE_SAVE: 'settings:beforeSave',

  // ─── Sync Hooks ─────────────────────────────────────────────────────────

  /**
   * Called when sync starts
   * Data: { incremental: boolean, profile: SiteProfile }
   * Return: Same object (side effects only)
   */
  SYNC_START: 'sync:start',

  /**
   * Called when sync completes successfully
   * Data: { resourceCount: number, termCount: number, duration: number }
   * Return: Same object (side effects only)
   */
  SYNC_COMPLETE: 'sync:complete',

  /**
   * Called when sync fails
   * Data: { error: Error, partial: boolean }
   * Return: Same object (side effects only)
   */
  SYNC_ERROR: 'sync:error',

  // ─── Push Hooks ─────────────────────────────────────────────────────────

  /**
   * Called when push starts
   * Data: { resourceIds: number[], profile: SiteProfile }
   * Return: Same object (side effects only)
   */
  PUSH_START: 'push:start',

  /**
   * Called when push completes
   * Data: { successCount: number, failCount: number, duration: number }
   * Return: Same object (side effects only)
   */
  PUSH_COMPLETE: 'push:complete',

  /**
   * Called when push fails
   * Data: { error: Error, failedIds: number[] }
   * Return: Same object (side effects only)
   */
  PUSH_ERROR: 'push:error',

  // ─── Profile Hooks ──────────────────────────────────────────────────────

  /**
   * Called when a profile is loaded
   * Data: SiteProfile
   * Return: Modified SiteProfile
   */
  PROFILE_LOADED: 'profile:loaded',

  /**
   * Called when active site changes
   * Data: { siteId: string, site: SiteConfig }
   * Return: Same object (side effects only)
   */
  SITE_CHANGED: 'site:changed',

  // ─── Plugin Hooks ───────────────────────────────────────────────────────

  /**
   * Called when a plugin is enabled
   * Data: { pluginId: string, plugin: JuggernautPlugin }
   * Return: Same object (side effects only)
   */
  PLUGIN_ENABLED: 'plugin:enabled',

  /**
   * Called when a plugin is disabled
   * Data: { pluginId: string }
   * Return: Same object (side effects only)
   */
  PLUGIN_DISABLED: 'plugin:disabled',
} as const;

/**
 * Global hook system instance
 * Used by the core application
 */
let globalHooks: HookSystem | null = null;

/**
 * Get or create the global hook system
 */
export function getHookSystem(): HookSystem {
  if (!globalHooks) {
    globalHooks = createHookSystem();
  }
  return globalHooks;
}

/**
 * Reset the global hook system (for testing)
 */
export function resetHookSystem(): void {
  globalHooks = null;
}
