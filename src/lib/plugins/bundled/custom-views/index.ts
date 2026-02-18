/**
 * Custom Views Plugin for Juggernaut
 *
 * Provides a settings page for creating named views with custom column
 * configurations for the resource table. Views can be assigned to specific
 * post types.
 *
 * This is a feature-flag plugin — it gates access to the /settings/views
 * page but doesn't register hooks or transform data during sync/push.
 * Views render from profile config regardless of plugin status.
 */

import type {
  JuggernautPlugin,
  PluginManifest,
  CoreAPI,
  SiteProfile,
} from '../../types';
import manifest from './manifest.json';

class CustomViewsPlugin implements JuggernautPlugin {
  // ─── Metadata (from manifest.json) ───────────────────────────────────────
  id = manifest.id;
  name = manifest.name;
  version = manifest.version;
  manifest = manifest as PluginManifest;

  // ─── Private State ───────────────────────────────────────────────────────
  private coreAPI: CoreAPI | null = null;

  // ─── Lifecycle: initialize() ─────────────────────────────────────────────
  async initialize(core: CoreAPI): Promise<void> {
    this.coreAPI = core;
    core.log(`[CustomViews] Plugin initializing v${this.version}`, 'info');
    core.log('[CustomViews] Plugin initialized', 'info');
  }

  // ─── Lifecycle: activate() ───────────────────────────────────────────────
  async activate(profile: SiteProfile, _settings: Record<string, unknown>): Promise<void> {
    this.coreAPI?.log(`[CustomViews] Activated for profile: ${profile.profile_id}`, 'info');
  }

  // ─── Lifecycle: deactivate() ─────────────────────────────────────────────
  async deactivate(): Promise<void> {
    this.coreAPI?.log('[CustomViews] Plugin deactivated', 'info');
  }
}

// ─── Export ──────────────────────────────────────────────────────────────────
export const customViewsPlugin = new CustomViewsPlugin();
export default customViewsPlugin;
