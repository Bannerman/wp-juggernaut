/**
 * Meta Box Plugin for Juggernaut
 *
 * Provides support for Meta Box custom fields in WordPress.
 * Handles syncing meta_box data and provides field renderers.
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
import { getProfileManager } from '../../../profiles';

/**
 * Get taxonomy to Meta Box field mapping from the current profile.
 * Reads taxonomy.meta_field entries from the active profile's taxonomy config.
 */
export function getTaxonomyMetaFieldMappingFromProfile(): Record<string, string> {
  const manager = getProfileManager();
  const profile = manager.getCurrentProfile();
  if (profile) {
    const mapping: Record<string, string> = {};
    for (const tax of profile.taxonomies || []) {
      if (tax.meta_field) {
        mapping[tax.slug] = tax.meta_field;
      }
    }
    return mapping;
  }
  return {};
}

/**
 * Feature item structure from Meta Box
 */
export interface FeatureItem {
  feature_text: string;
  feature_icon?: string;
}

/**
 * Changelog item structure from Meta Box
 */
export interface ChangelogItem {
  changelog_version: string;
  changelog_date: string;
  changelog_notes: string[];
}

/**
 * Download link structure from Meta Box
 */
export interface DownloadLink {
  link_text: string;
  download_link_type: 'link' | 'upload';
  download_file_format?: number;
  download_link_url?: string;
  download_link_upload?: string;
}

/**
 * Download section structure from Meta Box
 */
export interface DownloadSection {
  download_section_heading: string;
  download_version?: string;
  download_section_color?: string;
  download_archive?: boolean;
  download_links: DownloadLink[];
}

/**
 * Meta Box Plugin implementation
 */
class MetaBoxPlugin implements JuggernautPlugin {
  id = manifest.id;
  name = manifest.name;
  version = manifest.version;
  manifest = manifest as PluginManifest;

  private coreAPI: CoreAPI | null = null;
  private hooks: HookSystem | null = null;
  private unsubscribers: Array<() => void> = [];
  private settings: Record<string, unknown> = {};

  /**
   * Initialize the plugin
   */
  async initialize(core: CoreAPI): Promise<void> {
    this.coreAPI = core;
    this.hooks = core.hooks;

    core.log(`[MetaBox] Plugin initializing v${this.version}`, 'info');

    // Register hooks for resource lifecycle
    this.registerHooks();

    core.log('[MetaBox] Plugin initialized', 'info');
  }

  /**
   * Activate plugin for a profile
   */
  async activate(profile: SiteProfile, settings: Record<string, unknown>): Promise<void> {
    this.settings = settings;
    this.coreAPI?.log(`[MetaBox] Activated for profile: ${profile.profile_id}`, 'info');
  }

  /**
   * Deactivate the plugin
   */
  async deactivate(): Promise<void> {
    // Unsubscribe from all hooks
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];

    this.coreAPI?.log('[MetaBox] Plugin deactivated', 'info');
  }

  /**
   * Register hook subscriptions
   */
  private registerHooks(): void {
    if (!this.hooks) return;

    // Transform resource data during sync (WP → Local)
    const unsubSync = this.hooks.on<WPResource>(
      HOOKS.RESOURCE_BEFORE_SYNC,
      (resource, context) => this.transformResourceForSync(resource),
      5 // High priority - run early
    );
    this.unsubscribers.push(unsubSync);

    // Transform resource data during push (Local → WP)
    const unsubPush = this.hooks.on<{ resource: LocalResource; payload: PushPayload }>(
      HOOKS.RESOURCE_BEFORE_PUSH,
      (data, context) => this.handleBeforePush(data),
      5
    );
    this.unsubscribers.push(unsubPush);
  }

  /**
   * Transform resource data during sync
   */
  async transformResourceForSync(resource: WPResource): Promise<WPResource> {
    // Ensure meta_box exists
    if (!resource.meta_box) {
      resource.meta_box = {};
    }

    // Normalize Meta Box field structures
    resource.meta_box = this.normalizeMetaBoxData(resource.meta_box);

    return resource;
  }

  /**
   * Normalize Meta Box data structures
   */
  private normalizeMetaBoxData(metaBox: Record<string, unknown>): Record<string, unknown> {
    const normalized = { ...metaBox };

    // Ensure arrays are properly initialized
    if (!normalized.group_features) {
      normalized.group_features = [];
    }
    if (!normalized.group_changelog) {
      normalized.group_changelog = [];
    }
    if (!normalized.download_sections) {
      normalized.download_sections = [];
    }

    // Ensure nested structures in download sections
    const sections = normalized.download_sections as DownloadSection[];
    if (Array.isArray(sections)) {
      normalized.download_sections = sections.map((section) => ({
        ...section,
        download_links: section.download_links || [],
      }));
    }

    return normalized;
  }

  /**
   * Handle before push hook
   */
  private async handleBeforePush(data: {
    resource: LocalResource;
    payload: PushPayload;
  }): Promise<{ resource: LocalResource; payload: PushPayload }> {
    const { resource, payload } = data;

    // Transform payload for Meta Box
    const transformedPayload = await this.transformResourceForPush(resource, payload);

    return { resource, payload: transformedPayload };
  }

  /**
   * Transform resource for pushing to WordPress
   */
  async transformResourceForPush(
    resource: LocalResource,
    payload: PushPayload
  ): Promise<PushPayload> {
    const transformedPayload = { ...payload };

    // Ensure meta_box object exists
    if (!transformedPayload.meta_box) {
      transformedPayload.meta_box = {};
    }

    // Add taxonomy Meta Box fields
    if (resource.taxonomies) {
      const taxonomyMetaMapping = getTaxonomyMetaFieldMappingFromProfile();
      for (const [taxonomy, termIds] of Object.entries(resource.taxonomies)) {
        const metaField = taxonomyMetaMapping[taxonomy];
        if (metaField && termIds && termIds.length > 0) {
          transformedPayload.meta_box[metaField] = termIds;
        }
      }
    }

    // Copy meta_box fields from resource
    if (resource.meta_box) {
      transformedPayload.meta_box = {
        ...transformedPayload.meta_box,
        ...resource.meta_box,
      };
    }

    return transformedPayload;
  }

  /**
   * Detect if Meta Box plugin is installed on WordPress
   */
  async detectWordPressPlugin(baseUrl: string, authHeader: string): Promise<boolean> {
    try {
      const response = await fetch(`${baseUrl}/wp-json/mb/v1/`, {
        headers: { Authorization: authHeader },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get taxonomy to Meta Box field mapping (reads from active profile)
   */
  getTaxonomyMetaFieldMapping(): Record<string, string> {
    return getTaxonomyMetaFieldMappingFromProfile();
  }

  /**
   * Check if a field is a known Meta Box taxonomy meta field
   */
  isKnownField(fieldName: string): boolean {
    const mapping = getTaxonomyMetaFieldMappingFromProfile();
    return Object.values(mapping).includes(fieldName);
  }
}

// Export singleton instance
export const metaBoxPlugin = new MetaBoxPlugin();
export default metaBoxPlugin;
