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
import { getUserProfilesDir, getActiveProfileStatePath } from '../user-config-dir';

// The only profile shipped with the app: a minimal, generic WordPress profile.
// Site-specific profiles live in the user's profiles dir (~/.juggernaut/profiles).
import defaultProfile from './default.json';

/** Profile id of the bundled generic profile. */
export const DEFAULT_PROFILE_ID = 'default';

/** Where a registered profile came from. */
export interface ProfileSource {
  kind: 'bundled' | 'user' | 'memory';
  /** Absolute path of the backing JSON file (user profiles only). */
  filePath?: string;
  /** Last modified time of the backing file (user profiles only). */
  mtimeMs?: number;
}

/** Summary row for listing profiles in the UI / API. */
export interface ProfileSummary {
  id: string;
  name: string;
  version: string;
  source: ProfileSource['kind'];
  filePath?: string;
  isActive: boolean;
  isDefault: boolean;
  siteCount: number;
  postTypes: string[];
}

/**
 * Validate a parsed profile object. Throws a descriptive error when invalid.
 */
export function validateProfile(parsed: unknown): SiteProfile {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Profile must be a JSON object');
  }
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
  if (profile.post_types !== undefined && !Array.isArray(profile.post_types)) {
    throw new Error('Profile "post_types" must be an array');
  }
  if (profile.taxonomies !== undefined && !Array.isArray(profile.taxonomies)) {
    throw new Error('Profile "taxonomies" must be an array');
  }
  const siteProfile = parsed as SiteProfile;
  if (!siteProfile.post_types) siteProfile.post_types = [];
  if (!siteProfile.taxonomies) siteProfile.taxonomies = [];
  if (!siteProfile.profile_version) siteProfile.profile_version = '1.0.0';
  return siteProfile;
}

/** Turn a profile id into a safe file name stem. */
export function profileFileStem(profileId: string): string {
  const stem = profileId.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+|-+$/g, '');
  return stem || 'profile';
}

function readActiveProfileState(): string | null {
  try {
    const raw = fs.readFileSync(getActiveProfileStatePath(), 'utf-8');
    const parsed = JSON.parse(raw) as { profile_id?: unknown };
    return typeof parsed.profile_id === 'string' ? parsed.profile_id : null;
  } catch {
    return null;
  }
}

function writeActiveProfileState(profileId: string): void {
  try {
    const statePath = getActiveProfileStatePath();
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify({ profile_id: profileId }, null, 2) + '\n', 'utf-8');
  } catch (err) {
    console.warn('[ProfileManager] Could not persist active profile:', err);
  }
}

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

  /** Where each available profile came from */
  sources: Map<string, ProfileSource>;
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
      sources: new Map(),
    };

    // Register the bundled generic profile (deep-cloned so in-memory edits
    // never mutate the imported module object).
    this.registerProfile(JSON.parse(JSON.stringify(defaultProfile)) as SiteProfile, { kind: 'bundled' });

    // Discover user profiles (~/.juggernaut/profiles/*.json). A user profile
    // with the same id as the bundled one overrides it.
    this.discoverUserProfiles();
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
  registerProfile(profile: SiteProfile, source: ProfileSource = { kind: 'memory' }): void {
    this.state.availableProfiles.set(profile.profile_id, profile);
    this.state.sources.set(profile.profile_id, source);
    // Keep the active profile object in sync when it is re-registered
    if (this.state.currentProfile?.profile_id === profile.profile_id) {
      this.state.currentProfile = profile;
    }
    console.log(`[ProfileManager] Registered profile: ${profile.profile_id} (${source.kind})`);
  }

  /**
   * Scan the user profiles dir and register every valid `*.json` profile.
   * Invalid files are skipped with a warning. Returns the ids registered.
   */
  discoverUserProfiles(): string[] {
    const dir = getUserProfilesDir();
    const registered: string[] = [];
    let files: string[];
    try {
      files = fs.readdirSync(dir);
    } catch {
      return registered; // No user profiles dir yet
    }
    for (const file of files.filter((f) => f.endsWith('.json')).sort()) {
      const filePath = path.join(dir, file);
      try {
        const profile = this.readProfileFile(filePath);
        const mtimeMs = fs.statSync(filePath).mtimeMs;
        this.registerProfile(profile, { kind: 'user', filePath, mtimeMs });
        registered.push(profile.profile_id);
      } catch (err) {
        console.warn(`[ProfileManager] Skipping invalid profile ${filePath}: ${(err as Error).message}`);
      }
    }
    return registered;
  }

  private readProfileFile(filePath: string): SiteProfile {
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
    return validateProfile(parsed);
  }

  /**
   * Load a profile from a JSON file path (registers it in memory only)
   */
  loadProfileFromFile(filePath: string): SiteProfile {
    const siteProfile = this.readProfileFile(filePath);
    this.registerProfile(siteProfile, { kind: 'memory' });
    console.log(`[ProfileManager] Loaded profile from file: ${path.resolve(filePath)}`);
    return siteProfile;
  }

  /**
   * Import a profile: validate, persist to the user profiles dir, register.
   * Overwrites the existing user file for the same profile id.
   */
  importProfile(parsed: unknown): { profile: SiteProfile; filePath: string } {
    const profile = validateProfile(parsed);
    const existing = this.state.sources.get(profile.profile_id);
    const filePath = existing?.kind === 'user' && existing.filePath
      ? existing.filePath
      : path.join(getUserProfilesDir(), `${profileFileStem(profile.profile_id)}.json`);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(profile, null, 2) + '\n', 'utf-8');
    const mtimeMs = fs.statSync(filePath).mtimeMs;
    this.registerProfile(profile, { kind: 'user', filePath, mtimeMs });
    return { profile, filePath };
  }

  /**
   * Delete a user profile file and unregister it. If the bundled profile with
   * the same id exists it is restored. Bundled profiles cannot be deleted.
   */
  deleteUserProfile(profileId: string): boolean {
    const source = this.state.sources.get(profileId);
    if (!source || source.kind === 'bundled') return false;
    if (source.kind === 'user' && source.filePath && fs.existsSync(source.filePath)) {
      fs.unlinkSync(source.filePath);
    }
    this.state.availableProfiles.delete(profileId);
    this.state.sources.delete(profileId);
    if (profileId === DEFAULT_PROFILE_ID) {
      this.registerProfile(JSON.parse(JSON.stringify(defaultProfile)) as SiteProfile, { kind: 'bundled' });
    }
    if (this.state.currentProfile?.profile_id === profileId) {
      this.state.currentProfile = null;
      this.state.activeSiteId = null;
      if (readActiveProfileState() === profileId) {
        try { fs.unlinkSync(getActiveProfileStatePath()); } catch { /* none */ }
      }
      const fallback = this.pickDefaultProfileId();
      if (fallback) this.setCurrentProfile(fallback);
    }
    return true;
  }

  /**
   * Where a profile came from (bundled / user file / in-memory).
   */
  getProfileSource(profileId: string): ProfileSource | undefined {
    return this.state.sources.get(profileId);
  }

  /**
   * Pick the profile to activate when none is active yet. Priority:
   * 1. the profile the user last activated (persisted in active-profile.json)
   * 2. a user profile flagged `is_default: true`
   * 3. the most recently modified user profile
   * 4. the bundled default profile
   */
  pickDefaultProfileId(): string | null {
    const available = this.state.availableProfiles;
    const remembered = readActiveProfileState();
    if (remembered && available.has(remembered)) return remembered;

    const userProfiles = Array.from(this.state.sources.entries())
      .filter(([, src]) => src.kind === 'user')
      .map(([id, src]) => ({ id, src, profile: available.get(id) }))
      .filter((p): p is { id: string; src: ProfileSource; profile: SiteProfile } => !!p.profile);

    const flagged = userProfiles.find((p) => p.profile.is_default === true);
    if (flagged) return flagged.id;

    if (userProfiles.length > 0) {
      userProfiles.sort((a, b) => (b.src.mtimeMs ?? 0) - (a.src.mtimeMs ?? 0));
      return userProfiles[0].id;
    }

    if (available.has(DEFAULT_PROFILE_ID)) return DEFAULT_PROFILE_ID;
    const first = available.keys().next();
    return first.done ? null : first.value;
  }

  /**
   * Summaries of every available profile, for listing in the UI.
   */
  listProfileSummaries(): ProfileSummary[] {
    const currentId = this.state.currentProfile?.profile_id ?? null;
    return Array.from(this.state.availableProfiles.values()).map((p) => {
      const src = this.state.sources.get(p.profile_id) ?? { kind: 'memory' as const };
      return {
        id: p.profile_id,
        name: p.profile_name,
        version: p.profile_version,
        source: src.kind,
        filePath: src.filePath,
        isActive: p.profile_id === currentId,
        isDefault: p.is_default === true,
        siteCount: p.sites?.length ?? 0,
        postTypes: (p.post_types ?? []).map((pt) => pt.slug),
      };
    });
  }

  /**
   * Resolve the on-disk JSON file backing a profile, for routes that edit the
   * profile file directly (tab layout, views, field mappings). Bundled and
   * in-memory profiles are copied into the user profiles dir first
   * (copy-on-write) so edits never land in the app/repo directory.
   */
  ensureWritableProfileFile(profileId: string): string {
    const profile = this.state.availableProfiles.get(profileId);
    if (!profile) throw new Error(`Profile not found: ${profileId}`);
    const source = this.state.sources.get(profileId);
    if (source?.kind === 'user' && source.filePath && fs.existsSync(source.filePath)) {
      return source.filePath;
    }
    const filePath = path.join(getUserProfilesDir(), `${profileFileStem(profileId)}.json`);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(profile, null, 2) + '\n', 'utf-8');
    }
    this.state.sources.set(profileId, { kind: 'user', filePath, mtimeMs: fs.statSync(filePath).mtimeMs });
    return filePath;
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
  setCurrentProfile(profileId: string, options: { persist?: boolean } = {}): boolean {
    const profile = this.state.availableProfiles.get(profileId);
    if (!profile) {
      console.error(`[ProfileManager] Profile not found: ${profileId}`);
      return false;
    }

    this.state.currentProfile = profile;
    if (options.persist) writeActiveProfileState(profileId);

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
 * Ensure a profile is loaded (auto-loads the preferred profile if none).
 * See ProfileManager.pickDefaultProfileId() for the selection priority.
 */
export function ensureProfileLoaded(): SiteProfile {
  const manager = getProfileManager();
  let profile = manager.getCurrentProfile();

  if (!profile) {
    const preferred = manager.pickDefaultProfileId();
    if (preferred) {
      manager.setCurrentProfile(preferred);
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
 * Always a file in the user profiles dir (~/.juggernaut/profiles); a bundled
 * profile is copied there on first write so the app dir is never modified.
 */
export function getActiveProfileFilePath(): string {
  const profile = ensureProfileLoaded();
  return getProfileManager().ensureWritableProfileFile(profile.profile_id);
}

// Export the ProfileManager class for testing
export { ProfileManager };

// Re-export the bundled generic profile
export { defaultProfile };
