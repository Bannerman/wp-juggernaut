/**
 * Example Plugin for Juggernaut
 *
 * A minimal, copy-pasteable plugin skeleton that demonstrates all extension points.
 * Copy this entire `_example/` directory, rename it, and modify to suit your needs.
 *
 * Extension points demonstrated:
 * 1. Lifecycle methods (initialize, activate, deactivate)
 * 2. Data transformation hooks (sync & push)
 * 3. Custom field renderer registration
 * 4. Custom tab component registration
 * 5. WordPress plugin detection
 */

import type {
  JuggernautPlugin,
  PluginManifest,
  CoreAPI,
  SiteProfile,
  WPResource,
  LocalResource,
  PushPayload,
  HookSystem,
} from '../../types';
import manifest from './manifest.json';
import { HOOKS } from '../../hooks';

// ─── UI Registration (client-side only) ──────────────────────────────────────
// These imports wire your plugin into the EditModal rendering system.
// They are safe to import at module level — the registrations happen
// inside initialize() so they only run when the plugin is activated.
//
// import { registerFieldRenderer, unregisterFieldRenderer } from '@/components/fields';
// import { registerPluginTab, unregisterPluginTab } from '@/components/fields';
// import { ExampleTab } from './ExampleTab';        // Your custom tab component
// import { RatingRenderer } from './RatingRenderer'; // Your custom field renderer

/**
 * Example Plugin implementation
 *
 * Every plugin is a class that implements JuggernautPlugin.
 * Export a singleton instance as the default export.
 */
class ExamplePlugin implements JuggernautPlugin {
  // ─── Metadata (from manifest.json) ───────────────────────────────────────
  id = manifest.id;
  name = manifest.name;
  version = manifest.version;
  manifest = manifest as PluginManifest;

  // ─── Private State ───────────────────────────────────────────────────────
  private coreAPI: CoreAPI | null = null;
  private hooks: HookSystem | null = null;
  private unsubscribers: Array<() => void> = [];
  private settings: Record<string, unknown> = {};

  // ─── Lifecycle: initialize() ─────────────────────────────────────────────
  // Called ONCE when the plugin is first loaded (app startup).
  // Use this to:
  //   - Store the CoreAPI reference
  //   - Register hook subscriptions
  //   - Register custom field renderers
  //   - Register custom tab components
  async initialize(core: CoreAPI): Promise<void> {
    this.coreAPI = core;
    this.hooks = core.hooks;

    core.log(`[Example] Plugin initializing v${this.version}`, 'info');

    // 1. Register hooks for data transformation
    this.registerHooks();

    // 2. Register custom field renderers (uncomment when you have one)
    // registerFieldRenderer('rating', RatingRenderer);

    // 3. Register custom tab components (uncomment when you have one)
    // registerPluginTab('example', ExampleTab);

    core.log('[Example] Plugin initialized', 'info');
  }

  // ─── Lifecycle: activate() ───────────────────────────────────────────────
  // Called when the plugin is activated for a specific profile.
  // Receives profile-specific settings from `plugin_settings.example` in the profile JSON.
  async activate(profile: SiteProfile, settings: Record<string, unknown>): Promise<void> {
    this.settings = settings;
    this.coreAPI?.log(`[Example] Activated for profile: ${profile.profile_id}`, 'info');

    // Example: read a setting
    // const autoSync = settings.auto_sync ?? true;
  }

  // ─── Lifecycle: deactivate() ─────────────────────────────────────────────
  // Called when the plugin is disabled. Clean up all subscriptions and registrations.
  async deactivate(): Promise<void> {
    // Always unsubscribe from hooks
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];

    // Unregister UI components (uncomment if you registered any)
    // unregisterFieldRenderer('rating');
    // unregisterPluginTab('example');

    this.coreAPI?.log('[Example] Plugin deactivated', 'info');
  }

  // ─── Hook Registration ───────────────────────────────────────────────────
  // Subscribe to lifecycle hooks to transform data during sync/push.
  // See HOOKS constant in src/lib/plugins/hooks.ts for all available hooks.
  private registerHooks(): void {
    if (!this.hooks) return;

    // Transform resource data during sync (WordPress → Local)
    const unsubSync = this.hooks.on<WPResource>(
      HOOKS.RESOURCE_BEFORE_SYNC,
      (resource, _context) => this.transformForSync(resource),
      10 // Priority: lower = runs first. Default is 10.
    );
    this.unsubscribers.push(unsubSync);

    // Transform resource data during push (Local → WordPress)
    const unsubPush = this.hooks.on<{ resource: LocalResource; payload: PushPayload }>(
      HOOKS.RESOURCE_BEFORE_PUSH,
      (data, _context) => this.transformForPush(data),
      10
    );
    this.unsubscribers.push(unsubPush);

    // Side-effect hook: do something after sync completes
    const unsubSyncComplete = this.hooks.on(
      HOOKS.SYNC_COMPLETE,
      (data, _context) => {
        this.coreAPI?.log(`[Example] Sync completed: ${JSON.stringify(data)}`, 'debug');
        return data; // Always return data from hooks, even for side-effects
      },
      10
    );
    this.unsubscribers.push(unsubSyncComplete);
  }

  // ─── Data Transformation: Sync (WP → Local) ─────────────────────────────
  // Modify the resource data coming from WordPress before it's saved locally.
  // Common use: extract plugin-specific fields from meta_box, normalize data.
  private async transformForSync(resource: WPResource): Promise<WPResource> {
    // Example: extract a custom field and normalize it
    // if (resource.meta_box?.my_custom_field) {
    //   resource.meta_box.my_custom_field = String(resource.meta_box.my_custom_field).trim();
    // }

    return resource;
  }

  // ─── Data Transformation: Push (Local → WP) ─────────────────────────────
  // Modify the payload being sent to WordPress.
  // Common use: add plugin-specific fields to the request body.
  private async transformForPush(data: {
    resource: LocalResource;
    payload: PushPayload;
  }): Promise<{ resource: LocalResource; payload: PushPayload }> {
    const { resource, payload } = data;

    // Example: include a custom field in the push payload
    // if (resource.meta_box?.my_custom_field) {
    //   payload.meta_box = {
    //     ...payload.meta_box,
    //     my_custom_field: resource.meta_box.my_custom_field,
    //   };
    // }

    return { resource, payload };
  }

  // ─── WordPress Detection ─────────────────────────────────────────────────
  // Check if the corresponding WordPress plugin is installed on the target site.
  // Called during site discovery (/api/discover).
  async detectWordPressPlugin(baseUrl: string, authHeader: string): Promise<boolean> {
    try {
      const response = await fetch(`${baseUrl}/wp-json/your-plugin/v1/`, {
        headers: { Authorization: authHeader },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// ─── Export ──────────────────────────────────────────────────────────────────
// Always export a singleton instance as both named and default export.
export const examplePlugin = new ExamplePlugin();
export default examplePlugin;
