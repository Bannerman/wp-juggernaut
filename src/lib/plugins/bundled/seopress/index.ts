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
} from '../../types';
import manifest from './manifest.json';
import { HOOKS } from '../../hooks';

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
const SEOPRESS_ENDPOINTS = {
  posts: (postId: number) => `/wp-json/seopress/v1/posts/${postId}`,
  titleDescription: (postId: number) => `/wp-json/seopress/v1/posts/${postId}/title-description-metas`,
  targetKeywords: (postId: number) => `/wp-json/seopress/v1/posts/${postId}/target-keywords`,
  socialSettings: (postId: number) => `/wp-json/seopress/v1/posts/${postId}/social-settings`,
  metaRobots: (postId: number) => `/wp-json/seopress/v1/posts/${postId}/meta-robot-settings`,
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

    // Update title and description
    if (seoData.title !== undefined || seoData.description !== undefined) {
      const payload: Record<string, string> = {};
      if (seoData.title !== undefined) payload.title = seoData.title;
      if (seoData.description !== undefined) payload.description = seoData.description;

      try {
        const res = await fetch(`${baseUrl}${SEOPRESS_ENDPOINTS.titleDescription(resourceId)}`, {
          method: 'PUT',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          errors.push(`title-description: ${await res.text()}`);
        }
      } catch (err) {
        errors.push(`title-description: ${err}`);
      }
    }

    // Update target keywords
    if (seoData.targetKeywords !== undefined) {
      try {
        const res = await fetch(`${baseUrl}${SEOPRESS_ENDPOINTS.targetKeywords(resourceId)}`, {
          method: 'PUT',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            _seopress_analysis_target_kw: seoData.targetKeywords,
          }),
        });

        if (!res.ok) {
          errors.push(`target-keywords: ${await res.text()}`);
        }
      } catch (err) {
        errors.push(`target-keywords: ${err}`);
      }
    }

    // Update social settings
    if (seoData.og || seoData.twitter) {
      const socialPayload: Record<string, string> = {};

      if (seoData.og) {
        if (seoData.og.title !== undefined) socialPayload._seopress_social_fb_title = seoData.og.title;
        if (seoData.og.description !== undefined) socialPayload._seopress_social_fb_desc = seoData.og.description;
        if (seoData.og.image !== undefined) socialPayload._seopress_social_fb_img = seoData.og.image;
      }

      if (seoData.twitter) {
        if (seoData.twitter.title !== undefined) socialPayload._seopress_social_twitter_title = seoData.twitter.title;
        if (seoData.twitter.description !== undefined) socialPayload._seopress_social_twitter_desc = seoData.twitter.description;
        if (seoData.twitter.image !== undefined) socialPayload._seopress_social_twitter_img = seoData.twitter.image;
      }

      if (Object.keys(socialPayload).length > 0) {
        try {
          const res = await fetch(`${baseUrl}${SEOPRESS_ENDPOINTS.socialSettings(resourceId)}`, {
            method: 'PUT',
            headers: {
              Authorization: authHeader,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(socialPayload),
          });

          if (!res.ok) {
            errors.push(`social-settings: ${await res.text()}`);
          }
        } catch (err) {
          errors.push(`social-settings: ${err}`);
        }
      }
    }

    // Update robots settings
    if (seoData.robots || seoData.canonical !== undefined) {
      const robotsPayload: Record<string, string> = {};

      if (seoData.robots) {
        // SEOPress uses "yes" for enabling indexing, "no" for disabling
        if (seoData.robots.noindex !== undefined) {
          robotsPayload._seopress_robots_index = seoData.robots.noindex ? 'no' : 'yes';
        }
        if (seoData.robots.nofollow !== undefined) {
          robotsPayload._seopress_robots_follow = seoData.robots.nofollow ? 'no' : 'yes';
        }
        if (seoData.robots.nosnippet !== undefined) {
          robotsPayload._seopress_robots_snippet = seoData.robots.nosnippet ? 'no' : 'yes';
        }
        if (seoData.robots.noimageindex !== undefined) {
          robotsPayload._seopress_robots_imageindex = seoData.robots.noimageindex ? 'no' : 'yes';
        }
      }

      if (seoData.canonical !== undefined) {
        robotsPayload._seopress_robots_canonical = seoData.canonical;
      }

      if (Object.keys(robotsPayload).length > 0) {
        try {
          const res = await fetch(`${baseUrl}${SEOPRESS_ENDPOINTS.metaRobots(resourceId)}`, {
            method: 'PUT',
            headers: {
              Authorization: authHeader,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(robotsPayload),
          });

          if (!res.ok) {
            errors.push(`meta-robots: ${await res.text()}`);
          }
        } catch (err) {
          errors.push(`meta-robots: ${err}`);
        }
      }
    }

    return {
      success: errors.length === 0,
      errors,
    };
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
}

// Export singleton instance
export const seopressPlugin = new SEOPressPlugin();
export default seopressPlugin;
