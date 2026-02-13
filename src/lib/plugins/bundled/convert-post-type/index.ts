/**
 * Convert Post Type Plugin for Juggernaut
 *
 * Provides post type conversion with field mapping support.
 * When enabled, adds the "Convert Type" button to the EditModal
 * and the "Field Mappings" settings page.
 *
 * This is a feature-flag plugin — it gates access to conversion
 * and field mapping functionality but doesn't register hooks
 * or transform data during sync/push.
 */

import type {
  JuggernautPlugin,
  PluginManifest,
  CoreAPI,
  SiteProfile,
} from '../../types';
import manifest from './manifest.json';

class ConvertPostTypePlugin implements JuggernautPlugin {
  // ─── Metadata (from manifest.json) ───────────────────────────────────────
  id = manifest.id;
  name = manifest.name;
  version = manifest.version;
  manifest = manifest as PluginManifest;

  // ─── Private State ───────────────────────────────────────────────────────
  private coreAPI: CoreAPI | null = null;
  private settings: Record<string, unknown> = {};

  // ─── Lifecycle: initialize() ─────────────────────────────────────────────
  async initialize(core: CoreAPI): Promise<void> {
    this.coreAPI = core;
    core.log(`[ConvertPostType] Plugin initializing v${this.version}`, 'info');
    core.log('[ConvertPostType] Plugin initialized', 'info');
  }

  // ─── Lifecycle: activate() ───────────────────────────────────────────────
  async activate(profile: SiteProfile, settings: Record<string, unknown>): Promise<void> {
    this.settings = settings;
    this.coreAPI?.log(`[ConvertPostType] Activated for profile: ${profile.profile_id}`, 'info');
  }

  // ─── Lifecycle: deactivate() ─────────────────────────────────────────────
  async deactivate(): Promise<void> {
    this.coreAPI?.log('[ConvertPostType] Plugin deactivated', 'info');
  }

  // ─── Settings Access ─────────────────────────────────────────────────────
  getDefaultCreateRedirect(): boolean {
    return (this.settings.default_create_redirect as boolean) ?? true;
  }

  getDefaultTrashOldPost(): boolean {
    return (this.settings.default_trash_old_post as boolean) ?? true;
  }
}

// ─── Export ──────────────────────────────────────────────────────────────────
export const convertPostTypePlugin = new ConvertPostTypePlugin();
export default convertPostTypePlugin;
