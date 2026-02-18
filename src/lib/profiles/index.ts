/**
 * Juggernaut Profile System
 *
 * Profiles define the configuration for a Juggernaut installation,
 * including which sites to connect to, which plugins to enable,
 * and how the UI should be configured.
 */

import type { SiteProfile, SiteConfig, FieldMappingEntry, TabConfig, FieldDefinition, ViewConfig } from '../plugins/types';
import path from 'path';
import fs from 'fs';

// Import bundled profiles
import plexkitsProfile from './plexkits-resources.json';

/**
 * Profile state
 */
interface ProfileState {
  /** Currently loaded profile */
  currentProfile: SiteProfile | null;

  /** Active site within the profile */
  activeSiteId: string | null;

  /** Available profiles */
  availableProfiles: Map<string, SiteProfile>;
}

/**
 * Profile Manager class
 * Manages profile loading, switching, and state
 */
class ProfileManager {
  private state: ProfileState;
  private static instance: ProfileManager | null = null;

  private constructor() {
    this.state = {
      currentProfile: null,
      activeSiteId: null,
      availableProfiles: new Map(),
    };

    // Register bundled profiles
    this.registerProfile(plexkitsProfile as SiteProfile);
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): ProfileManager {
    if (!ProfileManager.instance) {
      ProfileManager.instance = new ProfileManager();
    }
    return ProfileManager.instance;
  }

  /**
   * Reset the singleton (for testing)
   */
  static reset(): void {
    ProfileManager.instance = null;
  }

  /**
   * Register a profile
   */
  registerProfile(profile: SiteProfile): void {
    this.state.availableProfiles.set(profile.profile_id, profile);
    console.log(`[ProfileManager] Registered profile: ${profile.profile_id}`);
  }

  /**
   * Load a profile from a JSON file path
   */
  loadProfileFromFile(filePath: string): SiteProfile {
    const resolvedPath = path.resolve(filePath);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Profile file not found: ${resolvedPath}`);
    }

    const content = fs.readFileSync(resolvedPath, 'utf-8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error(`Invalid JSON in profile file: ${resolvedPath}`);
    }

    // Validate required fields
    const profile = parsed as Record<string, unknown>;
    if (!profile.profile_id || typeof profile.profile_id !== 'string') {
      throw new Error('Profile must have a string "profile_id" field');
    }
    if (!profile.profile_name || typeof profile.profile_name !== 'string') {
      throw new Error('Profile must have a string "profile_name" field');
    }
    if (!Array.isArray(profile.sites) || profile.sites.length === 0) {
      throw new Error('Profile must have at least one entry in "sites" array');
    }

    const siteProfile = parsed as SiteProfile;
    this.registerProfile(siteProfile);
    console.log(`[ProfileManager] Loaded profile from file: ${resolvedPath}`);
    return siteProfile;
  }

  /**
   * Export a profile to a JSON file
   */
  exportProfileToFile(profileId: string, filePath: string): void {
    const profile = this.state.availableProfiles.get(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    const resolvedPath = path.resolve(filePath);
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const content = JSON.stringify(profile, null, 2);
    fs.writeFileSync(resolvedPath, content, 'utf-8');
    console.log(`[ProfileManager] Exported profile "${profileId}" to: ${resolvedPath}`);
  }

  /**
   * Get all available profiles
   */
  getAvailableProfiles(): SiteProfile[] {
    return Array.from(this.state.availableProfiles.values());
  }

  /**
   * Get a profile by ID
   */
  getProfile(profileId: string): SiteProfile | undefined {
    return this.state.availableProfiles.get(profileId);
  }

  /**
   * Set the current active profile
   */
  setCurrentProfile(profileId: string): boolean {
    const profile = this.state.availableProfiles.get(profileId);
    if (!profile) {
      console.error(`[ProfileManager] Profile not found: ${profileId}`);
      return false;
    }

    this.state.currentProfile = profile;

    // Set default site as active
    const defaultSite = profile.sites.find((s) => s.is_default) || profile.sites[0];
    if (defaultSite) {
      this.state.activeSiteId = defaultSite.id;
    }

    console.log(`[ProfileManager] Activated profile: ${profileId}, site: ${this.state.activeSiteId}`);
    return true;
  }

  /**
   * Get the current profile
   */
  getCurrentProfile(): SiteProfile | null {
    return this.state.currentProfile;
  }

  /**
   * Get the active site configuration
   */
  getActiveSite(): SiteConfig | null {
    if (!this.state.currentProfile || !this.state.activeSiteId) {
      return null;
    }

    return (
      this.state.currentProfile.sites.find((s) => s.id === this.state.activeSiteId) || null
    );
  }

  /**
   * Set the active site within the current profile
   */
  setActiveSite(siteId: string): boolean {
    if (!this.state.currentProfile) {
      console.error('[ProfileManager] No profile loaded');
      return false;
    }

    const site = this.state.currentProfile.sites.find((s) => s.id === siteId);
    if (!site) {
      console.error(`[ProfileManager] Site not found: ${siteId}`);
      return false;
    }

    this.state.activeSiteId = siteId;
    console.log(`[ProfileManager] Switched to site: ${siteId}`);
    return true;
  }

  /**
   * Get the active site's base URL
   */
  getActiveBaseUrl(): string {
    const site = this.getActiveSite();
    return site?.url || process.env.WP_BASE_URL || '';
  }

  /**
   * Get plugin settings from the current profile
   */
  getPluginSettings(pluginId: string): Record<string, unknown> {
    return this.state.currentProfile?.plugin_settings?.[pluginId] ?? {};
  }

  /**
   * Get required plugins from the current profile
   */
  getRequiredPlugins(): SiteProfile['required_plugins'] {
    return this.state.currentProfile?.required_plugins ?? [];
  }

  /**
   * Get post types from the current profile
   */
  getPostTypes(): SiteProfile['post_types'] {
    return this.state.currentProfile?.post_types ?? [];
  }

  /**
   * Get taxonomies from the current profile
   */
  getTaxonomies(): SiteProfile['taxonomies'] {
    return this.state.currentProfile?.taxonomies ?? [];
  }

  /**
   * Get UI configuration from the current profile
   */
  getUIConfig(): SiteProfile['ui'] {
    return this.state.currentProfile?.ui;
  }

  /**
   * Check if a feature is enabled in the current profile
   */
  isFeatureEnabled(feature: string): boolean {
    const features = this.state.currentProfile?.ui?.features;
    if (!features) return false;
    return (features as Record<string, boolean>)[feature] ?? false;
  }

  /**
   * Get taxonomy slugs as an array (for wp-client compatibility)
   */
  getTaxonomySlugs(): string[] {
    return this.getTaxonomies().map((t) => t.slug);
  }

  /**
   * Get taxonomy labels as a map (slug -> name)
   */
  getTaxonomyLabels(): Record<string, string> {
    const labels: Record<string, string> = {};
    for (const tax of this.getTaxonomies()) {
      labels[tax.slug] = tax.name;
    }
    return labels;
  }

  /**
   * Get taxonomy REST bases as a map (slug -> rest_base)
   */
  getTaxonomyRestBases(): Record<string, string> {
    const bases: Record<string, string> = {};
    for (const tax of this.getTaxonomies()) {
      bases[tax.slug] = tax.rest_base;
    }
    return bases;
  }

  /**
   * Get taxonomies that should show in filters
   */
  getFilterTaxonomies(): SiteProfile['taxonomies'] {
    return this.getTaxonomies()
      .filter((t) => t.show_in_filter)
      .sort((a, b) => (a.filter_position || 99) - (b.filter_position || 99));
  }

  /**
   * Get the primary post type
   */
  getPrimaryPostType(): SiteProfile['post_types'][0] | undefined {
    const postTypes = this.getPostTypes();
    return postTypes.find((pt) => pt.is_primary) || postTypes[0];
  }

  /**
   * Get editable taxonomies (those with editable: true)
   */
  getEditableTaxonomies(): SiteProfile['taxonomies'] {
    return this.getTaxonomies().filter((t) => t.editable === true);
  }

  /**
   * Get editable taxonomy slugs
   */
  getEditableTaxonomySlugs(): string[] {
    return this.getEditableTaxonomies().map((t) => t.slug);
  }

  /**
   * Get taxonomy to Meta Box field mapping from profile
   */
  getTaxonomyMetaFieldMapping(): Record<string, string> {
    const mapping: Record<string, string> = {};
    for (const tax of this.getTaxonomies()) {
      if (tax.meta_field) {
        mapping[tax.slug] = tax.meta_field;
      }
    }
    return mapping;
  }

  /**
   * Get field mappings for a post type pair
   */
  getFieldMappings(sourceSlug: string, targetSlug: string): FieldMappingEntry[] {
    const key = `${sourceSlug}->${targetSlug}`;
    return this.state.currentProfile?.field_mappings?.[key] ?? [];
  }

  /**
   * Get all field mappings from the current profile
   */
  getAllFieldMappings(): Record<string, FieldMappingEntry[]> {
    return this.state.currentProfile?.field_mappings ?? {};
  }

  /**
   * Set field mappings for a post type pair (mutates the in-memory profile)
   */
  setFieldMappings(sourceSlug: string, targetSlug: string, mappings: FieldMappingEntry[]): void {
    if (!this.state.currentProfile) return;
    if (!this.state.currentProfile.field_mappings) {
      this.state.currentProfile.field_mappings = {};
    }
    const key = `${sourceSlug}->${targetSlug}`;
    this.state.currentProfile.field_mappings[key] = mappings;
  }

  /**
   * Set tabs in the current profile's UI config (mutates in-memory)
   */
  setTabs(tabs: TabConfig[]): void {
    if (!this.state.currentProfile) return;
    if (!this.state.currentProfile.ui) {
      this.state.currentProfile.ui = {};
    }
    this.state.currentProfile.ui.tabs = tabs;
  }

  /**
   * Set field layout in the current profile's UI config (mutates in-memory)
   */
  setFieldLayout(layout: Record<string, FieldDefinition[]>): void {
    if (!this.state.currentProfile) return;
    if (!this.state.currentProfile.ui) {
      this.state.currentProfile.ui = {};
    }
    this.state.currentProfile.ui.field_layout = layout;
  }

  /**
   * Set views in the current profile's UI config (mutates in-memory)
   */
  setViews(views: ViewConfig[]): void {
    if (!this.state.currentProfile) return;
    if (!this.state.currentProfile.ui) {
      this.state.currentProfile.ui = {};
    }
    this.state.currentProfile.ui.views = views;
  }

  /**
   * Get all views from the current profile
   */
  getViews(): ViewConfig[] {
    return this.state.currentProfile?.ui?.views ?? [];
  }

  /**
   * Get views filtered for a specific post type
   */
  getViewsForPostType(postType: string): ViewConfig[] {
    return this.getViews().filter(
      (v) => !v.post_types || v.post_types.length === 0 || v.post_types.includes(postType)
    );
  }

  /**
   * Get full configuration for frontend
   */
  getFullConfig(): {
    profile: SiteProfile | null;
    activeSite: SiteConfig | null;
    taxonomies: SiteProfile['taxonomies'];
    postTypes: SiteProfile['post_types'];
    taxonomyLabels: Record<string, string>;
    filterTaxonomies: SiteProfile['taxonomies'];
    ui: SiteProfile['ui'] | undefined;
  } {
    return {
      profile: this.state.currentProfile,
      activeSite: this.getActiveSite(),
      taxonomies: this.getTaxonomies(),
      postTypes: this.getPostTypes(),
      taxonomyLabels: this.getTaxonomyLabels(),
      filterTaxonomies: this.getFilterTaxonomies(),
      ui: this.getUIConfig(),
    };
  }
}

/**
 * Get the profile manager instance
 */
export function getProfileManager(): ProfileManager {
  return ProfileManager.getInstance();
}

/**
 * Initialize with a specific profile
 */
export function initializeWithProfile(profileId: string): boolean {
  const manager = getProfileManager();
  return manager.setCurrentProfile(profileId);
}

/**
 * Ensure a profile is loaded (auto-loads default if none)
 */
export function ensureProfileLoaded(): SiteProfile {
  const manager = getProfileManager();
  let profile = manager.getCurrentProfile();

  if (!profile) {
    // Auto-load the first available profile (plexkits by default)
    const available = manager.getAvailableProfiles();
    if (available.length > 0) {
      manager.setCurrentProfile(available[0].profile_id);
      profile = manager.getCurrentProfile();
    }
  }

  if (!profile) {
    throw new Error('No profile available');
  }

  return profile;
}

/**
 * Get current profile configuration (convenience function)
 * Auto-loads default profile if none is loaded
 */
export function getProfileConfig(): ReturnType<ProfileManager['getFullConfig']> {
  ensureProfileLoaded();
  return getProfileManager().getFullConfig();
}

/**
 * Get taxonomy slugs from current profile
 */
export function getProfileTaxonomySlugs(): string[] {
  ensureProfileLoaded();
  return getProfileManager().getTaxonomySlugs();
}

/**
 * Get taxonomy labels from current profile
 */
export function getProfileTaxonomyLabels(): Record<string, string> {
  ensureProfileLoaded();
  return getProfileManager().getTaxonomyLabels();
}

/**
 * Get editable taxonomy slugs from current profile
 */
export function getProfileEditableTaxonomySlugs(): string[] {
  ensureProfileLoaded();
  return getProfileManager().getEditableTaxonomySlugs();
}

/**
 * Get taxonomy to Meta Box field mapping from current profile
 */
export function getProfileTaxonomyMetaFieldMapping(): Record<string, string> {
  ensureProfileLoaded();
  return getProfileManager().getTaxonomyMetaFieldMapping();
}

/**
 * Get sites from the current profile
 */
export function getProfileSites(): SiteConfig[] {
  ensureProfileLoaded();
  const profile = getProfileManager().getCurrentProfile();
  return profile?.sites ?? [];
}

/**
 * Resolve the file path for the active profile's JSON file on disk.
 * Used by API routes that need to read/write the profile JSON directly.
 */
export function getActiveProfileFilePath(): string {
  ensureProfileLoaded();
  const profile = getProfileManager().getCurrentProfile();
  const profileId = profile?.profile_id ?? 'plexkits';
  // Bundled profiles live alongside this module
  const profilePath = path.join(__dirname, `${profileId}.json`);
  // Fallback: if __dirname doesn't resolve (e.g., Next.js bundling), use cwd
  if (!fs.existsSync(profilePath)) {
    return path.join(process.cwd(), 'lib', 'profiles', `${profileId}.json`);
  }
  return profilePath;
}

// Export the ProfileManager class for testing
export { ProfileManager };

// Re-export bundled profiles
export { plexkitsProfile };
