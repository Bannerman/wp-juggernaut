/**
 * Juggernaut Plugin System - Type Definitions
 *
 * This file defines the core interfaces for the plugin system.
 * Plugins extend Juggernaut to add support for WordPress plugins like
 * MetaBox, SEOPress, ACF, WooCommerce, etc.
 */

import type { ComponentType } from 'react';

// ============================================================================
// Plugin Manifest
// ============================================================================

/**
 * Plugin manifest - defines metadata and capabilities
 * Stored in manifest.json at the root of each plugin
 */
export interface PluginManifest {
  /** Unique plugin identifier (lowercase, hyphens) */
  id: string;

  /** Human-readable plugin name */
  name: string;

  /** Semantic version (e.g., "1.0.0") */
  version: string;

  /** Brief description of what the plugin does */
  description: string;

  /** Plugin author information */
  author?: {
    name: string;
    url?: string;
    email?: string;
  };

  /** License identifier (e.g., "MIT") */
  license?: string;

  /** Minimum Juggernaut version required (e.g., ">=1.0.0") */
  requires_core?: string;

  /** Plugin tier: bundled with app or external */
  tier: 'bundled' | 'community' | 'premium';

  /** WordPress plugin this Juggernaut plugin supports */
  wordpress_plugin?: {
    /** WordPress plugin name */
    name: string;
    /** WordPress plugin slug */
    slug: string;
    /** WordPress plugin URL */
    url?: string;
    /** How to detect if the WP plugin is installed */
    detection?: {
      /** REST endpoint to check (e.g., "/wp-json/mb/v1/") */
      rest_endpoint?: string;
      /** WordPress option to check */
      option_check?: string;
    };
  };

  /** What this plugin provides */
  provides?: {
    /** Tabs added to the editor */
    tabs?: string[];
    /** Field types this plugin can render */
    field_types?: string[];
    /** API extensions provided */
    api_extensions?: string[];
  };

  /** Settings schema for auto-generated settings UI */
  settings_schema?: Record<string, SettingDefinition>;

  /** Repository URL */
  repository?: string;

  /** Bug tracker URL */
  bugs?: string;
}

/**
 * Setting definition for plugin settings schema
 */
export interface SettingDefinition {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  label: string;
  description?: string;
  default?: unknown;
  required?: boolean;
}

// ============================================================================
// Plugin Interface
// ============================================================================

/**
 * Main plugin interface - all plugins must implement this
 */
export interface JuggernautPlugin {
  // ─── Metadata ─────────────────────────────────────────────────────────────

  /** Unique plugin identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Plugin version */
  version: string;

  /** Full manifest */
  manifest: PluginManifest;

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Called when the plugin is first loaded
   * Use this to register hooks and set up the plugin
   */
  initialize(core: CoreAPI): Promise<void>;

  /**
   * Called when the plugin is activated for a profile
   * Use this to set up profile-specific configuration
   */
  activate(profile: SiteProfile, settings: Record<string, unknown>): Promise<void>;

  /**
   * Called when the plugin is deactivated
   * Clean up any resources
   */
  deactivate(): Promise<void>;

  /**
   * Called when the plugin is uninstalled (optional)
   * Clean up stored data
   */
  uninstall?(): Promise<void>;

  // ─── Data Transformation ──────────────────────────────────────────────────

  /**
   * Transform resource data during sync (WP → Local)
   * Called after fetching from WordPress, before saving to local DB
   */
  transformResourceForSync?(resource: WPResource): Promise<WPResource>;

  /**
   * Transform resource data during push (Local → WP)
   * Called before sending to WordPress
   */
  transformResourceForPush?(resource: LocalResource, payload: PushPayload): Promise<PushPayload>;

  /**
   * Fetch additional plugin-specific data after main sync
   * Called for each resource after it's synced
   */
  fetchAdditionalData?(resourceId: number, baseUrl: string): Promise<Record<string, unknown>>;

  /**
   * Push additional plugin-specific data after main push
   * Called for each resource after it's pushed
   */
  pushAdditionalData?(resourceId: number, data: Record<string, unknown>, baseUrl: string): Promise<void>;

  // ─── UI Extensions ────────────────────────────────────────────────────────

  /**
   * Get tabs this plugin adds to the editor
   */
  getTabs?(): TabDefinition[];

  /**
   * Get field renderers for custom field types
   * Returns a map of field type → React component
   */
  getFieldRenderers?(): Record<string, ComponentType<FieldRendererProps>>;

  /**
   * Get settings panel component for plugin configuration
   */
  getSettingsPanel?(): ComponentType<SettingsPanelProps>;

  /**
   * Get filter components to add to the filter panel
   */
  getFilterComponents?(): ComponentType<FilterComponentProps>[];

  // ─── WordPress Detection ──────────────────────────────────────────────────

  /**
   * Detect if the corresponding WordPress plugin is installed
   */
  detectWordPressPlugin?(baseUrl: string, authHeader: string): Promise<boolean>;
}

// ============================================================================
// Core API (provided to plugins)
// ============================================================================

/**
 * Core API - passed to plugins during initialization
 * Provides access to Juggernaut core functionality
 */
export interface CoreAPI {
  /** Plugin system version */
  version: string;

  /** Hook system for subscribing to events */
  hooks: HookSystem;

  /** Current site profile (if loaded) */
  getProfile(): SiteProfile | null;

  /** Get WordPress base URL for current site */
  getBaseUrl(): string;

  /** Get auth header for WordPress API calls */
  getAuthHeader(): string;

  /** Database operations */
  database: {
    /** Execute a SQL query */
    query<T>(sql: string, params?: unknown[]): T[];
    /** Execute a SQL statement */
    run(sql: string, params?: unknown[]): void;
  };

  /** Show a notification to the user */
  showNotification(message: string, type: 'success' | 'error' | 'info' | 'warning'): void;

  /** Log a message (respects debug settings) */
  log(message: string, level?: 'debug' | 'info' | 'warn' | 'error'): void;

  /** Register a custom API route */
  registerApiRoute?(path: string, handler: ApiRouteHandler): void;
}

// ============================================================================
// Hook System
// ============================================================================

/**
 * Hook system for plugin event subscriptions
 */
export interface HookSystem {
  /**
   * Subscribe to a hook
   * @param hookName - Name of the hook (e.g., "resource:beforeSync")
   * @param callback - Function to call when hook is triggered
   * @param priority - Lower numbers run first (default: 10)
   * @returns Unsubscribe function
   */
  on<T = unknown, R = T>(
    hookName: string,
    callback: HookCallback<T, R>,
    priority?: number
  ): () => void;

  /**
   * Trigger a hook (internal use)
   * Runs all registered callbacks in priority order
   */
  trigger<T = unknown>(hookName: string, data: T, context?: HookContext): Promise<T>;

  /**
   * Remove all callbacks for a hook (internal use)
   */
  clear(hookName: string): void;
}

/**
 * Hook callback function type
 * Can modify and return data, or just perform side effects
 */
export type HookCallback<T = unknown, R = T> = (
  data: T,
  context: HookContext
) => R | Promise<R>;

/**
 * Context passed to hook callbacks
 */
export interface HookContext {
  /** ID of the plugin triggering (if applicable) */
  pluginId?: string;
  /** Current site profile */
  profile?: SiteProfile;
  /** Additional context data */
  [key: string]: unknown;
}

/**
 * Standard hook names used by Juggernaut
 */
export type StandardHooks =
  // Resource lifecycle
  | 'resource:beforeSync'
  | 'resource:afterSync'
  | 'resource:beforePush'
  | 'resource:afterPush'
  | 'resource:beforeSave'
  | 'resource:afterSave'
  // UI hooks
  | 'ui:registerTabs'
  | 'ui:registerFilters'
  | 'ui:beforeRender'
  // Settings hooks
  | 'settings:registerPanel'
  | 'settings:beforeSave'
  // Sync hooks
  | 'sync:start'
  | 'sync:complete'
  | 'sync:error'
  // Push hooks
  | 'push:start'
  | 'push:complete'
  | 'push:error';

// ============================================================================
// UI Types
// ============================================================================

/**
 * Tab definition for editor modal
 */
export interface TabDefinition {
  /** Unique tab identifier */
  id: string;

  /** Display label */
  label: string;

  /** Lucide icon name (optional) */
  icon?: string;

  /** React component to render */
  component: ComponentType<TabComponentProps>;

  /** Position hint (e.g., "after:basic", "before:ai", or number) */
  position?: string | number;

  /** Only show tab when condition is met */
  condition?: (resource: LocalResource, profile: SiteProfile) => boolean;
}

/**
 * Props passed to tab components
 */
export interface TabComponentProps {
  /** The resource being edited */
  resource: LocalResource;

  /** Current profile */
  profile: SiteProfile;

  /** Plugin settings from profile */
  settings: Record<string, unknown>;

  /** Update a field value */
  updateField: (field: string, value: unknown) => void;

  /** All available terms by taxonomy */
  terms: Record<string, Term[]>;

  /** Whether the modal is in create mode */
  isCreateMode: boolean;
}

/**
 * Props for field renderer components
 */
export interface FieldRendererProps {
  /** Field configuration from profile */
  field: FieldDefinition;

  /** Current field value */
  value: unknown;

  /** Update the field value */
  onChange: (value: unknown) => void;

  /** Whether the field is disabled */
  disabled?: boolean;

  /** Additional context */
  context: {
    resource: LocalResource;
    profile: SiteProfile;
    allValues: Record<string, unknown>;
  };
}

/**
 * Field definition from profile
 */
export interface FieldDefinition {
  /** Unique field key (maps to metaBox key) */
  key: string;

  /** Field type */
  type: 'text' | 'textarea' | 'number' | 'checkbox' | 'date' | 'datetime' | 'color' | 'select' | 'url' | 'repeater' | 'textarea-list';

  /** Display label */
  label: string;

  /** Which tab to show this field on */
  tab?: string;

  /** Placeholder text */
  placeholder?: string;

  /** Number of rows (for textarea / textarea-list) */
  rows?: number;

  /** Nested fields (for repeater) */
  fields?: Record<string, FieldDefinition>;

  /** Whether the field is repeatable */
  repeatable?: boolean;

  /** Static options for select fields */
  options?: Array<{ value: string; label: string }>;

  /** Default value for the field */
  default_value?: unknown;

  /** Separator for textarea-list (splits/joins string[]) */
  separator?: string;

  /** Taxonomy slug to source select options from */
  taxonomy_source?: string;

  /** Width hint for layout */
  width?: 'full' | 'half' | 'quarter';

  /** Conditional display */
  conditional?: {
    field: string;
    operator?: 'eq' | 'neq' | 'truthy' | 'falsy';
    value?: unknown;
  };

  /** Side-effect triggers: when this field changes, set other fields */
  triggers?: Array<{
    /** Pattern to match against the selected term name (case-insensitive substring) */
    match_term_pattern: string;
    /** Field key to update */
    set_field: string;
    /** Value to set */
    set_value: unknown;
  }>;
}

/**
 * Props for settings panel components
 */
export interface SettingsPanelProps {
  /** Current plugin settings */
  settings: Record<string, unknown>;

  /** Update settings */
  onSettingsChange: (settings: Record<string, unknown>) => void;

  /** Profile being edited */
  profile: SiteProfile;
}

/**
 * Props for filter components
 */
export interface FilterComponentProps {
  /** Current filter value */
  value: unknown;

  /** Update filter value */
  onChange: (value: unknown) => void;

  /** Available resources (for computing options) */
  resources: LocalResource[];
}

// ============================================================================
// Resource Types
// ============================================================================

/**
 * WordPress resource from REST API
 */
export interface WPResource {
  id: number;
  date: string;
  date_gmt: string;
  modified: string;
  modified_gmt: string;
  slug: string;
  status: string;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  featured_media: number;
  meta_box?: Record<string, unknown>;
  [taxonomy: string]: unknown;
}

/**
 * Local resource in SQLite database
 */
export interface LocalResource {
  id: number;
  title: string;
  slug: string;
  status: string;
  date_gmt: string;
  modified_gmt: string;
  is_dirty: boolean;
  taxonomies: Record<string, number[]>;
  meta_box: Record<string, unknown>;
  /** Plugin-specific data stored by plugins */
  plugin_data?: Record<string, unknown>;
}

/**
 * Payload for pushing to WordPress
 */
export interface PushPayload {
  title?: string;
  slug?: string;
  status?: string;
  content?: string;
  featured_media?: number;
  meta_box?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Term from taxonomy
 */
export interface Term {
  id: number;
  taxonomy: string;
  name: string;
  slug: string;
  parent_id: number;
}

// ============================================================================
// Profile Types
// ============================================================================

/**
 * Site profile configuration
 */
export interface SiteProfile {
  profile_id: string;
  profile_name: string;
  profile_version: string;
  juggernaut_version?: string;

  /** Configured sites */
  sites: SiteConfig[];

  /** Required plugins with settings */
  required_plugins?: RequiredPlugin[];

  /** Post types to manage */
  post_types: PostTypeConfig[];

  /** Taxonomies to manage */
  taxonomies: TaxonomyConfig[];

  /** Plugin-specific settings */
  plugin_settings?: Record<string, Record<string, unknown>>;

  /** UI customization */
  ui?: UIConfig;
}

/**
 * Site configuration within a profile
 */
export interface SiteConfig {
  id: string;
  name: string;
  url: string;
  description?: string;
  is_default?: boolean;
}

/**
 * Required plugin specification
 */
export interface RequiredPlugin {
  /** Plugin ID */
  id: string;
  /** Required version (semver) */
  version?: string;
  /** Source: bundled or registry */
  source?: 'bundled' | 'registry';
  /** Auto-enable when profile is imported */
  auto_enable?: boolean;
}

/**
 * Post type configuration
 */
export interface PostTypeConfig {
  slug: string;
  name: string;
  rest_base: string;
  icon?: string;
  supports?: string[];
  is_primary?: boolean;
}

/**
 * Taxonomy configuration
 */
export interface TaxonomyConfig {
  slug: string;
  name: string;
  rest_base: string;
  post_types: string[];
  hierarchical?: boolean;
  show_in_filter?: boolean;
  filter_position?: number;
  /** Show this taxonomy as a column in the resource table */
  show_in_table?: boolean;
  /** Column position in the table (lower numbers first) */
  table_position?: number;
  /** Max terms to display before showing "+N more" */
  table_max_display?: number;
  /** Meta Box field ID for this taxonomy (e.g., 'tax_resource_type') */
  meta_field?: string;
  /** Whether this taxonomy is editable in the create/edit modal */
  editable?: boolean;
  conditional?: {
    show_when: {
      taxonomy: string;
      has_term_id: number;
    };
  };
}

/**
 * UI configuration in profile
 */
export interface UIConfig {
  tabs?: TabConfig[];
  /** Maps tab IDs to ordered arrays of field definitions for dynamic rendering */
  field_layout?: Record<string, FieldDefinition[]>;
  branding?: {
    app_name?: string;
    primary_color?: string;
    logo_url?: string;
  };
  features?: {
    ai_fill?: boolean;
    prompt_templates?: boolean;
    bulk_edit?: boolean;
    diagnostics?: boolean;
  };
}

/**
 * Tab configuration in profile
 */
export interface TabConfig {
  id: string;
  label: string;
  source: string;
  icon?: string;
  position?: number;
  /** Whether this tab's content is rendered dynamically from field_layout */
  dynamic?: boolean;
}

// ============================================================================
// API Types
// ============================================================================

/**
 * API route handler type
 */
export type ApiRouteHandler = (
  request: Request,
  context: { params: Record<string, string> }
) => Promise<Response>;

// ============================================================================
// Plugin Registry Types
// ============================================================================

/**
 * Plugin state in the registry
 */
export interface PluginState {
  /** Plugin ID */
  id: string;

  /** Whether plugin is enabled */
  enabled: boolean;

  /** Plugin tier */
  tier: 'bundled' | 'community' | 'premium';

  /** Installed version */
  version: string;

  /** When plugin was installed */
  installedAt?: string;

  /** When plugin was last enabled */
  enabledAt?: string;

  /** Plugin-specific persisted settings */
  settings?: Record<string, unknown>;
}

/**
 * Plugin registry state (persisted)
 */
export interface PluginRegistryState {
  /** Map of plugin ID to state */
  plugins: Record<string, PluginState>;

  /** Last updated timestamp */
  updatedAt: string;
}
