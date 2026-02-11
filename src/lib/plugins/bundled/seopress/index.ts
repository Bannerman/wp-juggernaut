/**
 * SEOPress Plugin for Juggernaut
 *
 * Provides support for SEOPress SEO plugin in WordPress.
 * Handles fetching and updating SEO metadata via the SEOPress REST API.
 */

import type {
  JuggernautPlugin,
  PluginManifest,
  CoreAPI,
  SiteProfile,
  LocalResource,
  HookSystem,
  PushPayload,
} from '../../types';
import manifest from './manifest.json';
import { HOOKS } from '../../hooks';
import { getPluginData, savePluginData } from '../../../queries';

/**
 * SEO data structure
 */
export interface SEOData {
  title: string;
  description: string;
  canonical: string;
  targetKeywords: string;
  og: {
    title: string;
    description: string;
    image: string;
    attachment_id?: string;
    image_width?: string;
    image_height?: string;
  };
  twitter: {
    title: string;
    description: string;
    image: string;
    attachment_id?: string;
    image_width?: string;
    image_height?: string;
  };
  robots: {
    noindex: boolean;
    nofollow: boolean;
    nosnippet: boolean;
    noimageindex: boolean;
  };
}

/**
 * Default empty SEO data
 */
export const DEFAULT_SEO_DATA: SEOData = {
  title: '',
  description: '',
  canonical: '',
  targetKeywords: '',
  og: { title: '', description: '', image: '' },
  twitter: { title: '', description: '', image: '' },
  robots: { noindex: false, nofollow: false, nosnippet: false, noimageindex: false },
};

/**
 * SEOPress API endpoints
 */
/**
 * Redirect data structure for SEOPress redirections
 */
export interface RedirectData {
  /** Source URL path (e.g., "/old-slug/") */
  redirectFrom: string;
  /** Target URL path or full URL (e.g., "/new-slug/") */
  redirectTo: string;
  /** HTTP status code: 301 (permanent) or 302 (temporary) */
  statusCode: 301 | 302;
}

const SEOPRESS_ENDPOINTS = {
  posts: (postId: number) => `/wp-json/seopress/v1/posts/${postId}`,
  titleDescription: (postId: number) => `/wp-json/seopress/v1/posts/${postId}/title-description-metas`,
  targetKeywords: (postId: number) => `/wp-json/seopress/v1/posts/${postId}/target-keywords`,
  socialSettings: (postId: number) => `/wp-json/seopress/v1/posts/${postId}/social-settings`,
  metaRobots: (postId: number) => `/wp-json/seopress/v1/posts/${postId}/meta-robot-settings`,
  redirections: `/wp-json/seopress/v1/redirections`,
};

/**
 * SEOPress Plugin implementation
 */
class SEOPressPlugin implements JuggernautPlugin {
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

    core.log(`[SEOPress] Plugin initializing v${this.version}`, 'info');

    // Register hooks
    this.registerHooks();

    core.log('[SEOPress] Plugin initialized', 'info');
  }

  /**
   * Activate plugin for a profile
   */
  async activate(profile: SiteProfile, settings: Record<string, unknown>): Promise<void> {
    this.settings = settings;
    this.coreAPI?.log(`[SEOPress] Activated for profile: ${profile.profile_id}`, 'info');
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

    this.coreAPI?.log('[SEOPress] Plugin deactivated', 'info');
  }

  /**
   * Register hook subscriptions
   */
  private registerHooks(): void {
    if (!this.hooks) return;

    // After resource is synced, we could optionally fetch SEO data
    // For now, SEO data is fetched on-demand when the SEO tab is opened
    const unsubAfterSync = this.hooks.on<LocalResource>(
      HOOKS.RESOURCE_AFTER_SYNC,
      async (resource, context) => {
        // Could pre-fetch SEO data here if auto_sync_seo is enabled
        // For now, we keep SEO fetching lazy (on-demand)
        return resource;
      },
      10
    );
    this.unsubscribers.push(unsubAfterSync);
  }

  /**
   * Detect if SEOPress plugin is installed on WordPress
   */
  async detectWordPressPlugin(baseUrl: string, authHeader: string): Promise<boolean> {
    try {
      const response = await fetch(`${baseUrl}/wp-json/seopress/v1/`, {
        headers: { Authorization: authHeader },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Fetch SEO data for a resource
   */
  async fetchSEOData(resourceId: number, baseUrl: string, authHeader: string): Promise<SEOData> {
    try {
      const response = await fetch(`${baseUrl}${SEOPRESS_ENDPOINTS.posts(resourceId)}`, {
        method: 'GET',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return { ...DEFAULT_SEO_DATA };
        }
        throw new Error(`SEOPress API error: ${response.status}`);
      }

      const data = await response.json();

      // Transform SEOPress response to our format
      return {
        title: data.title || '',
        description: data.description || '',
        canonical: data.canonical || '',
        targetKeywords: data.target_kw || '',
        og: {
          title: data.og?.title || '',
          description: data.og?.description || '',
          image: data.og?.image || '',
          attachment_id: data.og?.attachment_id || '',
          image_width: data.og?.image_width || '',
          image_height: data.og?.image_height || '',
        },
        twitter: {
          title: data.twitter?.title || '',
          description: data.twitter?.description || '',
          image: data.twitter?.image || '',
          attachment_id: data.twitter?.attachment_id || '',
          image_width: data.twitter?.image_width || '',
          image_height: data.twitter?.image_height || '',
        },
        robots: {
          noindex: data.robots?.noindex || false,
          nofollow: data.robots?.nofollow || false,
          nosnippet: data.robots?.nosnippet || false,
          noimageindex: data.robots?.noimageindex || false,
        },
      };
    } catch (error) {
      this.coreAPI?.log(`[SEOPress] Error fetching SEO data: ${error}`, 'error');
      return { ...DEFAULT_SEO_DATA };
    }
  }

  /**
   * Update SEO data for a resource
   */
  async updateSEOData(
    resourceId: number,
    seoData: Partial<SEOData>,
    baseUrl: string,
    authHeader: string
  ): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];

    const addError = (err: string | null) => {
      if (err) errors.push(err);
    };

    addError(await this.updateTitleDescription(resourceId, seoData, baseUrl, authHeader));
    addError(await this.updateTargetKeywords(resourceId, seoData, baseUrl, authHeader));
    addError(await this.updateSocialSettings(resourceId, seoData, baseUrl, authHeader));
    addError(await this.updateRobotsSettings(resourceId, seoData, baseUrl, authHeader));

    return {
      success: errors.length === 0,
      errors,
    };
  }

  /**
   * Helper to send update request
   */
  private async sendUpdate(
    url: string,
    payload: Record<string, unknown>,
    authHeader: string,
    errorPrefix: string
  ): Promise<string | null> {
    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        return `${errorPrefix}: ${await res.text()}`;
      }
      return null;
    } catch (err) {
      return `${errorPrefix}: ${err}`;
    }
  }

  /**
   * Update title and description
   */
  private async updateTitleDescription(
    resourceId: number,
    seoData: Partial<SEOData>,
    baseUrl: string,
    authHeader: string
  ): Promise<string | null> {
    if (seoData.title === undefined && seoData.description === undefined) {
      return null;
    }

    const payload: Record<string, string> = {};
    if (seoData.title !== undefined) payload.title = seoData.title;
    if (seoData.description !== undefined) payload.description = seoData.description;

    return this.sendUpdate(
      `${baseUrl}${SEOPRESS_ENDPOINTS.titleDescription(resourceId)}`,
      payload,
      authHeader,
      'title-description'
    );
  }

  /**
   * Update target keywords
   */
  private async updateTargetKeywords(
    resourceId: number,
    seoData: Partial<SEOData>,
    baseUrl: string,
    authHeader: string
  ): Promise<string | null> {
    if (seoData.targetKeywords === undefined) {
      return null;
    }

    return this.sendUpdate(
      `${baseUrl}${SEOPRESS_ENDPOINTS.targetKeywords(resourceId)}`,
      { _seopress_analysis_target_kw: seoData.targetKeywords },
      authHeader,
      'target-keywords'
    );
  }

  /**
   * Update social settings (OG and Twitter)
   */
  private async updateSocialSettings(
    resourceId: number,
    seoData: Partial<SEOData>,
    baseUrl: string,
    authHeader: string
  ): Promise<string | null> {
    if (!seoData.og && !seoData.twitter) {
      return null;
    }

    const payload: Record<string, string> = {};

    if (seoData.og) {
      if (seoData.og.title !== undefined) payload._seopress_social_fb_title = seoData.og.title;
      if (seoData.og.description !== undefined) payload._seopress_social_fb_desc = seoData.og.description;
      if (seoData.og.image !== undefined) payload._seopress_social_fb_img = seoData.og.image;
    }

    if (seoData.twitter) {
      if (seoData.twitter.title !== undefined) payload._seopress_social_twitter_title = seoData.twitter.title;
      if (seoData.twitter.description !== undefined) payload._seopress_social_twitter_desc = seoData.twitter.description;
      if (seoData.twitter.image !== undefined) payload._seopress_social_twitter_img = seoData.twitter.image;
    }

    if (Object.keys(payload).length === 0) {
      return null;
    }

    return this.sendUpdate(
      `${baseUrl}${SEOPRESS_ENDPOINTS.socialSettings(resourceId)}`,
      payload,
      authHeader,
      'social-settings'
    );
  }

  /**
   * Update robots and canonical URL
   */
  private async updateRobotsSettings(
    resourceId: number,
    seoData: Partial<SEOData>,
    baseUrl: string,
    authHeader: string
  ): Promise<string | null> {
    if (!seoData.robots && seoData.canonical === undefined) {
      return null;
    }

    const payload: Record<string, string> = {};

    if (seoData.robots) {
      if (seoData.robots.noindex !== undefined) {
        payload._seopress_robots_index = seoData.robots.noindex ? 'no' : 'yes';
      }
      if (seoData.robots.nofollow !== undefined) {
        payload._seopress_robots_follow = seoData.robots.nofollow ? 'no' : 'yes';
      }
      if (seoData.robots.nosnippet !== undefined) {
        payload._seopress_robots_snippet = seoData.robots.nosnippet ? 'no' : 'yes';
      }
      if (seoData.robots.noimageindex !== undefined) {
        payload._seopress_robots_imageindex = seoData.robots.noimageindex ? 'no' : 'yes';
      }
    }

    if (seoData.canonical !== undefined) {
      payload._seopress_robots_canonical = seoData.canonical;
    }

    if (Object.keys(payload).length === 0) {
      return null;
    }

    return this.sendUpdate(
      `${baseUrl}${SEOPRESS_ENDPOINTS.metaRobots(resourceId)}`,
      payload,
      authHeader,
      'meta-robots'
    );
  }

  /**
   * Fetch additional SEO data for a resource after sync
   */
  async fetchAdditionalData(
    resourceId: number,
    baseUrl: string
  ): Promise<Record<string, unknown>> {
    // SEO data is fetched on-demand, not during sync
    // This method is available if we want to pre-fetch SEO data
    return {};
  }

  // ─── Redirect Methods ───────────────────────────────────────────────────────

  /**
   * Create a 301/302 redirect via the SEOPress redirections API.
   *
   * SEOPress stores redirects as a custom post type (seopress_404).
   * The REST endpoint creates the redirect rule on the WordPress site.
   */
  async createRedirect(
    redirect: RedirectData,
    baseUrl: string,
    authHeader: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${baseUrl}${SEOPRESS_ENDPOINTS.redirections}`, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          _seopress_redirections_value: redirect.redirectFrom,
          _seopress_redirections_param: 'exact_match',
          _seopress_redirections_type: String(redirect.statusCode),
          _seopress_redirections_enabled: 'yes',
          _seopress_redirections_logged_status: 'both',
          // The target URL for the redirect
          _seopress_redirections_url_redirect: redirect.redirectTo,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        return { success: false, error: `SEOPress redirect API error ${response.status}: ${text}` };
      }

      this.coreAPI?.log(
        `[SEOPress] Created ${redirect.statusCode} redirect: ${redirect.redirectFrom} → ${redirect.redirectTo}`,
        'info'
      );
      return { success: true };
    } catch (error) {
      const msg = `Failed to create redirect: ${error}`;
      this.coreAPI?.log(`[SEOPress] ${msg}`, 'error');
      return { success: false, error: msg };
    }
  }

  // ─── Local Storage Methods ────────────────────────────────────────────────────

  /**
   * Get SEO data from local database
   */
  getLocalSEOData(postId: number): SEOData | null {
    const data = getPluginData<SEOData>(postId, 'seopress', 'seo');
    if (!data) return null;

    // Merge with defaults to ensure all fields exist
    return {
      ...DEFAULT_SEO_DATA,
      ...data,
      og: { ...DEFAULT_SEO_DATA.og, ...data.og },
      twitter: { ...DEFAULT_SEO_DATA.twitter, ...data.twitter },
      robots: { ...DEFAULT_SEO_DATA.robots, ...data.robots },
    };
  }

  /**
   * Save SEO data to local database
   */
  saveLocalSEOData(postId: number, seoData: SEOData, markDirty = true): void {
    savePluginData(postId, 'seopress', 'seo', seoData, markDirty);
  }

  /**
   * Fetch SEO from WordPress and save to local database
   */
  async syncSEOData(
    postId: number,
    baseUrl: string,
    authHeader: string
  ): Promise<SEOData> {
    const seoData = await this.fetchSEOData(postId, baseUrl, authHeader);
    this.saveLocalSEOData(postId, seoData, false); // Don't mark dirty since we just synced
    return seoData;
  }

  /**
   * Push local SEO data to WordPress
   */
  async pushSEOData(
    postId: number,
    baseUrl: string,
    authHeader: string
  ): Promise<{ success: boolean; errors: string[] }> {
    const localSEO = this.getLocalSEOData(postId);
    if (!localSEO) {
      return { success: true, errors: [] }; // Nothing to push
    }

    return this.updateSEOData(postId, localSEO, baseUrl, authHeader);
  }
}

// Export singleton instance
export const seopressPlugin = new SEOPressPlugin();
export default seopressPlugin;
