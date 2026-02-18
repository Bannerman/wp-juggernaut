/**
 * WooCommerce Plugin for Juggernaut
 *
 * Adds WooCommerce product support by injecting the `product` post type
 * and WooCommerce taxonomies (product_cat, product_tag) into the active
 * profile on activation.
 *
 * Uses the standard wp/v2 REST endpoint (requires `show_in_rest` for
 * the product post type). A future version will add native wc/v3 support.
 */

import type {
  JuggernautPlugin,
  PluginManifest,
  CoreAPI,
  SiteProfile,
  PostTypeConfig,
  TaxonomyConfig,
} from '../../types';
import manifest from './manifest.json';

/** Post type config injected by this plugin */
const PRODUCT_POST_TYPE: PostTypeConfig = {
  slug: 'product',
  name: 'Products',
  rest_base: 'product',
  icon: 'ShoppingBag',
};

/** Taxonomy configs injected by this plugin */
const PRODUCT_TAXONOMIES: TaxonomyConfig[] = [
  {
    slug: 'product_cat',
    name: 'Product Categories',
    rest_base: 'product_cat',
    post_types: ['product'],
    hierarchical: true,
    show_in_filter: true,
    editable: true,
  },
  {
    slug: 'product_tag',
    name: 'Product Tags',
    rest_base: 'product_tag',
    post_types: ['product'],
    hierarchical: false,
    editable: true,
  },
];

/**
 * WooCommerce Plugin implementation
 */
class WooCommercePlugin implements JuggernautPlugin {
  id = manifest.id;
  name = manifest.name;
  version = manifest.version;
  manifest = manifest as PluginManifest;

  private coreAPI: CoreAPI | null = null;
  private settings: Record<string, unknown> = {};

  /**
   * Initialize the plugin
   */
  async initialize(core: CoreAPI): Promise<void> {
    this.coreAPI = core;
    core.log(`[WooCommerce] Plugin initializing v${this.version}`, 'info');
    core.log('[WooCommerce] Plugin initialized', 'info');
  }

  /**
   * Activate plugin for a profile.
   * Injects the product post type and WooCommerce taxonomies into the
   * in-memory profile if they don't already exist.
   */
  async activate(profile: SiteProfile, settings: Record<string, unknown>): Promise<void> {
    this.settings = settings;
    const restBase = (settings.rest_base as string) || 'product';

    // Inject product post type if not already present
    const hasProduct = profile.post_types.some((pt) => pt.slug === 'product');
    if (!hasProduct) {
      profile.post_types.push({ ...PRODUCT_POST_TYPE, rest_base: restBase });
      this.coreAPI?.log('[WooCommerce] Injected product post type', 'info');
    }

    // Inject WooCommerce taxonomies if not already present
    for (const taxConfig of PRODUCT_TAXONOMIES) {
      const exists = profile.taxonomies.some((t) => t.slug === taxConfig.slug);
      if (!exists) {
        profile.taxonomies.push({ ...taxConfig });
        this.coreAPI?.log(`[WooCommerce] Injected taxonomy: ${taxConfig.slug}`, 'info');
      }
    }

    this.coreAPI?.log(`[WooCommerce] Activated for profile: ${profile.profile_id}`, 'info');
  }

  /**
   * Deactivate the plugin.
   * Removes the injected product post type and taxonomies from the
   * in-memory profile.
   */
  async deactivate(): Promise<void> {
    const profile = this.coreAPI?.getProfile();
    if (profile) {
      // Remove product post type
      profile.post_types = profile.post_types.filter((pt) => pt.slug !== 'product');

      // Remove WooCommerce taxonomies
      const wooTaxSlugs = PRODUCT_TAXONOMIES.map((t) => t.slug);
      profile.taxonomies = profile.taxonomies.filter((t) => !wooTaxSlugs.includes(t.slug));

      this.coreAPI?.log('[WooCommerce] Removed injected post type and taxonomies', 'info');
    }

    this.coreAPI?.log('[WooCommerce] Plugin deactivated', 'info');
  }

  /**
   * Detect if WooCommerce is installed on the target WordPress site
   */
  async detectWordPressPlugin(baseUrl: string, authHeader: string): Promise<boolean> {
    try {
      const response = await fetch(`${baseUrl}/wp-json/wc/v3/`, {
        headers: { Authorization: authHeader },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export const woocommercePlugin = new WooCommercePlugin();
export default woocommercePlugin;
