/**
 * Juggernaut Profile System
 *
 * Profiles define the configuration for a Juggernaut installation,
 * including which sites to connect to, which plugins to enable,
 * and how the UI should be configured.
 */

import type { SiteProfile, SiteConfig } from '../plugins/types';

// Import bundled profiles
import plexkitsProfile from './plexkits.json';

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
  async loadProfileFromFile(filePath: string): Promise<SiteProfile> {
    // In a browser/Electron context, this would use file APIs
    // For now, throw an error indicating this isn't implemented yet
    throw new Error('loadProfileFromFile not yet implemented - use registerProfile instead');
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

// Export the ProfileManager class for testing
export { ProfileManager };

// Re-export bundled profiles
export { plexkitsProfile };
