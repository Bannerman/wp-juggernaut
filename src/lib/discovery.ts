/**
 * WordPress Discovery Module
 *
 * Scans a WordPress site to detect available post types, taxonomies,
 * and installed plugins. Used to auto-generate or validate profiles.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DiscoveredPostType {
  slug: string;
  name: string;
  rest_base: string;
  description: string;
  hierarchical: boolean;
  has_archive: boolean;
  supports: string[];
}

export interface DiscoveredTaxonomy {
  slug: string;
  name: string;
  rest_base: string;
  description: string;
  hierarchical: boolean;
  post_types: string[];
}

export interface DiscoveredPlugin {
  id: string;
  name: string;
  detected: boolean;
  detection_method: string;
  version?: string;
}

export interface DiscoveryResult {
  success: boolean;
  site_url: string;
  site_name?: string;
  post_types: DiscoveredPostType[];
  taxonomies: DiscoveredTaxonomy[];
  plugins: DiscoveredPlugin[];
  errors: string[];
  discovered_at: string;
}

// ─── Plugin Detection Config ─────────────────────────────────────────────────

interface PluginDetectionConfig {
  id: string;
  name: string;
  detection: {
    rest_endpoint?: string;
    rest_namespace?: string;
    meta_key?: string;
  };
}

const DETECTABLE_PLUGINS: PluginDetectionConfig[] = [
  {
    id: 'metabox',
    name: 'Meta Box',
    detection: {
      rest_namespace: 'mb/v1',
      rest_endpoint: '/wp-json/mb/v1/',
    },
  },
  {
    id: 'seopress',
    name: 'SEOPress',
    detection: {
      rest_namespace: 'seopress/v1',
      rest_endpoint: '/wp-json/seopress/v1/',
    },
  },
  {
    id: 'acf',
    name: 'Advanced Custom Fields',
    detection: {
      rest_namespace: 'acf/v3',
      rest_endpoint: '/wp-json/acf/v3/',
    },
  },
  {
    id: 'woocommerce',
    name: 'WooCommerce',
    detection: {
      rest_namespace: 'wc/v3',
      rest_endpoint: '/wp-json/wc/v3/',
    },
  },
  {
    id: 'yoast',
    name: 'Yoast SEO',
    detection: {
      rest_namespace: 'yoast/v1',
      rest_endpoint: '/wp-json/yoast/v1/',
    },
  },
  {
    id: 'rankmath',
    name: 'Rank Math',
    detection: {
      rest_namespace: 'rankmath/v1',
      rest_endpoint: '/wp-json/rankmath/v1/',
    },
  },
];

// ─── Discovery Functions ─────────────────────────────────────────────────────

/**
 * Discover everything about a WordPress site
 */
export async function discoverWordPressSite(
  baseUrl: string,
  authHeader: string
): Promise<DiscoveryResult> {
  const errors: string[] = [];
  const result: DiscoveryResult = {
    success: false,
    site_url: baseUrl,
    post_types: [],
    taxonomies: [],
    plugins: [],
    errors: [],
    discovered_at: new Date().toISOString(),
  };

  try {
    // Get site info
    const siteInfo = await fetchSiteInfo(baseUrl, authHeader);
    if (siteInfo) {
      result.site_name = siteInfo.name;
    }

    // Discover post types
    const postTypes = await discoverPostTypes(baseUrl, authHeader);
    result.post_types = postTypes.types;
    if (postTypes.error) errors.push(postTypes.error);

    // Discover taxonomies
    const taxonomies = await discoverTaxonomies(baseUrl, authHeader);
    result.taxonomies = taxonomies.types;
    if (taxonomies.error) errors.push(taxonomies.error);

    // Detect plugins
    const plugins = await detectPlugins(baseUrl, authHeader);
    result.plugins = plugins;

    result.errors = errors;
    result.success = errors.length === 0;

    return result;
  } catch (error) {
    result.errors.push(`Discovery failed: ${error}`);
    return result;
  }
}

/**
 * Fetch basic site information
 */
async function fetchSiteInfo(
  baseUrl: string,
  authHeader: string
): Promise<{ name: string; description: string } | null> {
  try {
    const response = await fetch(`${baseUrl}/wp-json/`, {
      headers: { Authorization: authHeader },
    });

    if (!response.ok) return null;

    const data = await response.json();
    return {
      name: data.name || '',
      description: data.description || '',
    };
  } catch {
    return null;
  }
}

/**
 * Discover available post types
 */
async function discoverPostTypes(
  baseUrl: string,
  authHeader: string
): Promise<{ types: DiscoveredPostType[]; error?: string }> {
  try {
    const response = await fetch(`${baseUrl}/wp-json/wp/v2/types`, {
      headers: { Authorization: authHeader },
    });

    if (!response.ok) {
      return { types: [], error: `Failed to fetch post types: ${response.status}` };
    }

    const data = await response.json();
    const types: DiscoveredPostType[] = [];

    for (const [slug, info] of Object.entries(data)) {
      const typeInfo = info as Record<string, unknown>;

      // Skip built-in types that aren't useful
      if (['attachment', 'nav_menu_item', 'wp_block', 'wp_template', 'wp_template_part', 'wp_navigation'].includes(slug)) {
        continue;
      }

      // Only include types with REST API support
      if (typeInfo.rest_base) {
        types.push({
          slug,
          name: (typeInfo.name as string) || slug,
          rest_base: typeInfo.rest_base as string,
          description: (typeInfo.description as string) || '',
          hierarchical: Boolean(typeInfo.hierarchical),
          has_archive: Boolean(typeInfo.has_archive),
          supports: Array.isArray(typeInfo.supports) ? typeInfo.supports : [],
        });
      }
    }

    return { types };
  } catch (error) {
    return { types: [], error: `Error discovering post types: ${error}` };
  }
}

/**
 * Discover available taxonomies
 */
async function discoverTaxonomies(
  baseUrl: string,
  authHeader: string
): Promise<{ types: DiscoveredTaxonomy[]; error?: string }> {
  try {
    const response = await fetch(`${baseUrl}/wp-json/wp/v2/taxonomies`, {
      headers: { Authorization: authHeader },
    });

    if (!response.ok) {
      return { types: [], error: `Failed to fetch taxonomies: ${response.status}` };
    }

    const data = await response.json();
    const types: DiscoveredTaxonomy[] = [];

    for (const [slug, info] of Object.entries(data)) {
      const taxInfo = info as Record<string, unknown>;

      // Skip built-in taxonomies that aren't useful
      if (['nav_menu', 'link_category', 'post_format', 'wp_theme', 'wp_template_part_area'].includes(slug)) {
        continue;
      }

      // Only include taxonomies with REST API support
      if (taxInfo.rest_base) {
        types.push({
          slug,
          name: (taxInfo.name as string) || slug,
          rest_base: taxInfo.rest_base as string,
          description: (taxInfo.description as string) || '',
          hierarchical: Boolean(taxInfo.hierarchical),
          post_types: Array.isArray(taxInfo.types) ? taxInfo.types : [],
        });
      }
    }

    return { types };
  } catch (error) {
    return { types: [], error: `Error discovering taxonomies: ${error}` };
  }
}

/**
 * Detect installed plugins by checking their REST endpoints
 */
async function detectPlugins(
  baseUrl: string,
  authHeader: string
): Promise<DiscoveredPlugin[]> {
  const results: DiscoveredPlugin[] = [];

  // First, get list of available namespaces from the root
  let availableNamespaces: string[] = [];
  try {
    const response = await fetch(`${baseUrl}/wp-json/`, {
      headers: { Authorization: authHeader },
    });
    if (response.ok) {
      const data = await response.json();
      availableNamespaces = data.namespaces || [];
    }
  } catch {
    // Continue with direct endpoint checks
  }

  // Check each plugin
  for (const plugin of DETECTABLE_PLUGINS) {
    let detected = false;
    let detectionMethod = '';

    // Check via namespace list first (faster)
    if (plugin.detection.rest_namespace && availableNamespaces.includes(plugin.detection.rest_namespace)) {
      detected = true;
      detectionMethod = 'namespace';
    }
    // Fallback to direct endpoint check
    else if (plugin.detection.rest_endpoint) {
      try {
        const response = await fetch(`${baseUrl}${plugin.detection.rest_endpoint}`, {
          headers: { Authorization: authHeader },
          method: 'HEAD',
        });
        if (response.ok || response.status === 401) {
          // 401 means endpoint exists but needs auth
          detected = true;
          detectionMethod = 'endpoint';
        }
      } catch {
        // Plugin not detected
      }
    }

    results.push({
      id: plugin.id,
      name: plugin.name,
      detected,
      detection_method: detectionMethod,
    });
  }

  return results;
}

/**
 * Quick check if a specific plugin is installed
 */
export async function isPluginInstalled(
  pluginId: string,
  baseUrl: string,
  authHeader: string
): Promise<boolean> {
  const plugin = DETECTABLE_PLUGINS.find((p) => p.id === pluginId);
  if (!plugin) return false;

  if (plugin.detection.rest_endpoint) {
    try {
      const response = await fetch(`${baseUrl}${plugin.detection.rest_endpoint}`, {
        headers: { Authorization: authHeader },
        method: 'HEAD',
      });
      return response.ok || response.status === 401;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Generate a basic profile from discovery results
 */
export function generateProfileFromDiscovery(
  discovery: DiscoveryResult,
  profileName: string
): Record<string, unknown> {
  // Find the primary post type (not page or post)
  const customPostTypes = discovery.post_types.filter(
    (pt) => !['post', 'page'].includes(pt.slug)
  );
  const primaryPostType = customPostTypes[0] || discovery.post_types[0];

  // Get taxonomies for the primary post type
  const relevantTaxonomies = discovery.taxonomies.filter((tax) =>
    tax.post_types.includes(primaryPostType?.slug || 'post')
  );

  // Determine required plugins
  const detectedPlugins = discovery.plugins
    .filter((p) => p.detected)
    .map((p) => ({
      id: p.id,
      source: 'bundled',
      auto_enable: true,
    }));

  return {
    profile_id: profileName.toLowerCase().replace(/\s+/g, '-'),
    profile_name: profileName,
    profile_version: '1.0.0',
    juggernaut_version: '>=1.0.0',

    sites: [
      {
        id: 'default',
        name: discovery.site_name || 'WordPress Site',
        url: discovery.site_url,
        is_default: true,
      },
    ],

    required_plugins: detectedPlugins,

    post_types: discovery.post_types
      .filter((pt) => !['post', 'page'].includes(pt.slug) || customPostTypes.length === 0)
      .slice(0, 5) // Limit to first 5
      .map((pt, idx) => ({
        slug: pt.slug,
        name: pt.name,
        rest_base: pt.rest_base,
        is_primary: idx === 0,
      })),

    taxonomies: relevantTaxonomies.map((tax, idx) => ({
      slug: tax.slug,
      name: tax.name,
      rest_base: tax.rest_base,
      post_types: tax.post_types,
      hierarchical: tax.hierarchical,
      show_in_filter: idx < 6, // Show first 6 in filter
      filter_position: idx + 1,
    })),

    ui: {
      branding: {
        app_name: discovery.site_name || 'Juggernaut',
      },
      features: {
        ai_fill: true,
        bulk_edit: true,
        diagnostics: true,
      },
    },
  };
}
