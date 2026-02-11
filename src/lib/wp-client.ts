/**
 * WordPress REST API Client
 *
 * Handles all communication with WordPress REST API.
 * Configuration (taxonomies, post types) comes from the active profile.
 */

import { getActiveBaseUrl, getCredentials } from './site-config';
import { getProfileManager, ensureProfileLoaded } from './profiles';

// ─── Configuration ───────────────────────────────────────────────────────────

/**
 * Returns the active WordPress site base URL from the current site config.
 * @returns The base URL (e.g. 'https://your-site.com')
 */
export function getWpBaseUrl(): string {
  return getActiveBaseUrl();
}

/**
 * Returns WordPress API credentials from the appropriate source based on runtime context.
 * Priority: Electron env vars > site-config.json > .env.local fallback.
 * @returns Object with `username` and `appPassword` fields
 */
export function getWpCredentials(): { username: string; appPassword: string } {
  // In Electron production mode, credentials come from secure storage via env vars
  if (process.env.JUGGERNAUT_ELECTRON === '1') {
    if (process.env.WP_USERNAME && process.env.WP_APP_PASSWORD) {
      return {
        username: process.env.WP_USERNAME,
        appPassword: process.env.WP_APP_PASSWORD,
      };
    }
  }

  // In dev/browser mode, prefer config file (set by the UI) over .env.local
  // This allows credentials saved through the app settings to take effect immediately
  const configCreds = getCredentials();
  if (configCreds) {
    return configCreds;
  }

  // Final fallback to env vars (from .env.local during development)
  if (process.env.WP_USERNAME && process.env.WP_APP_PASSWORD) {
    return {
      username: process.env.WP_USERNAME,
      appPassword: process.env.WP_APP_PASSWORD,
    };
  }

  return { username: '', appPassword: '' };
}

// Legacy exports for backwards compatibility (now read dynamically)
export const WP_BASE_URL = process.env.WP_BASE_URL || 'https://plexkits.com';
export const WP_USERNAME = process.env.WP_USERNAME || '';
export const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD || '';

/**
 * Returns taxonomy slugs from the active profile configuration.
 * Falls back to a default set if the profile is not loaded.
 * @returns Array of taxonomy slug strings (e.g. ['category', 'post_tag'])
 */
export function getTaxonomies(): string[] {
  try {
    ensureProfileLoaded();
    return getProfileManager().getTaxonomySlugs();
  } catch {
    // Fallback to empty if no profile loaded
    console.warn('[wp-client] No profile loaded, returning empty taxonomies');
    return [];
  }
}

/**
 * Get taxonomy labels from the active profile
 */
export function getTaxonomyLabels(): Record<string, string> {
  try {
    ensureProfileLoaded();
    return getProfileManager().getTaxonomyLabels();
  } catch {
    return {};
  }
}

/**
 * Returns the REST base path for the primary post type from the active profile.
 * Falls back to 'resource' if the profile is not loaded.
 * @returns REST base string (e.g. 'posts', 'resource')
 */
export function getPrimaryPostTypeRestBase(): string {
  try {
    ensureProfileLoaded();
    const postType = getProfileManager().getPrimaryPostType();
    return postType?.rest_base || 'posts';
  } catch {
    return 'posts';
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WPTerm {
  id: number;
  name: string;
  slug: string;
  taxonomy: string;
  parent: number;
  count: number;
}

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
  // Taxonomy fields are dynamic based on profile
  [key: string]: unknown;
}

export interface UpdateResourcePayload {
  title?: string;
  slug?: string;
  status?: string;
  content?: string;
  featured_media?: number;
  meta_box?: Record<string, unknown>;
  // Taxonomy fields are dynamic
  [key: string]: unknown;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

function getAuthHeader(): string {
  const creds = getWpCredentials();
  const credentials = Buffer.from(`${creds.username}:${creds.appPassword}`).toString('base64');
  return `Basic ${credentials}`;
}

function hasValidCredentials(): boolean {
  const creds = getWpCredentials();
  return Boolean(creds.username && creds.appPassword);
}

// ─── Core Fetch ──────────────────────────────────────────────────────────────

async function wpFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  requiresAuth: boolean = true
): Promise<{ data: T; headers: Headers }> {
  const url = `${getWpBaseUrl()}/wp-json/wp/v2${endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  // Only add auth if credentials are configured and auth is required
  if (requiresAuth && hasValidCredentials()) {
    headers.Authorization = getAuthHeader();
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WP API Error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return { data, headers: response.headers };
}

// ─── Taxonomy Functions ──────────────────────────────────────────────────────

/**
 * Fetches all terms for a specific taxonomy from the WordPress REST API.
 * Handles pagination automatically to retrieve all terms.
 * @param taxonomy - The taxonomy slug (e.g. 'category')
 * @param restBase - Optional REST base override (defaults to taxonomy slug)
 * @returns Array of WPTerm objects
 */
export async function fetchTaxonomyTerms(
  taxonomy: string,
  restBase?: string
): Promise<WPTerm[]> {
  // Use the REST base if provided, otherwise use taxonomy slug
  const endpoint = restBase || taxonomy;
  const { data } = await wpFetch<WPTerm[]>(`/${endpoint}?per_page=100`, {}, false);
  return data.map((term) => ({ ...term, taxonomy }));
}

/**
 * Fetches terms for all taxonomies defined in the active profile.
 * Runs taxonomy fetches in parallel for performance.
 * @returns Record mapping taxonomy slugs to arrays of WPTerm objects
 */
export async function fetchAllTaxonomies(): Promise<Record<string, WPTerm[]>> {
  const profile = getProfileManager().getCurrentProfile();
  const taxonomyConfigs = profile?.taxonomies || [];

  if (taxonomyConfigs.length === 0) {
    console.warn('[wp-client] No taxonomies configured in profile');
    return {};
  }

  const results = await Promise.all(
    taxonomyConfigs.map(async (taxConfig) => {
      try {
        const terms = await fetchTaxonomyTerms(taxConfig.slug, taxConfig.rest_base);
        return { taxonomy: taxConfig.slug, terms };
      } catch (error) {
        console.error(`Error fetching ${taxConfig.slug}:`, error);
        return { taxonomy: taxConfig.slug, terms: [] };
      }
    })
  );

  return results.reduce(
    (acc, { taxonomy, terms }) => {
      acc[taxonomy] = terms;
      return acc;
    },
    {} as Record<string, WPTerm[]>
  );
}

// ─── Resource Functions ──────────────────────────────────────────────────────

export interface FetchResourcesOptions {
  page?: number;
  perPage?: number;
  status?: string;
  modifiedAfter?: string;
  postType?: string;
}

export interface FetchResourcesResult {
  resources: WPResource[];
  total: number;
  totalPages: number;
}

export async function fetchResources(
  options: FetchResourcesOptions = {}
): Promise<FetchResourcesResult> {
  const {
    page = 1,
    perPage = 100,
    status = 'any',
    modifiedAfter,
    postType,
  } = options;

  // Get post type from options or profile
  const restBase = postType || getPrimaryPostTypeRestBase();

  // Use auth if we have credentials and need non-public statuses
  const hasAuth = hasValidCredentials();
  const needsAuth = hasAuth && status !== 'publish';

  console.log(`[wp-client] fetchResources - postType: ${restBase}, status: ${status}, hasAuth: ${hasAuth}`);

  let endpoint = `/${restBase}?per_page=${perPage}&page=${page}&status=${status}`;
  if (modifiedAfter) {
    endpoint += `&modified_after=${encodeURIComponent(modifiedAfter)}`;
  }

  console.log(`[wp-client] Fetching: ${endpoint}`);

  const { data, headers } = await wpFetch<WPResource[]>(endpoint, {}, needsAuth);

  console.log(`[wp-client] Received ${data.length} resources from WordPress`);

  return {
    resources: data,
    total: parseInt(headers.get('X-WP-Total') || '0', 10),
    totalPages: parseInt(headers.get('X-WP-TotalPages') || '0', 10),
  };
}

/**
 * Fetches all resources from WordPress, handling pagination automatically.
 * @param modifiedAfter - Optional ISO timestamp; only fetch resources modified after this time
 * @param postType - Optional post type REST base override
 * @returns Array of all WPResource objects
 */
export async function fetchAllResources(
  modifiedAfter?: string,
  postType?: string,
  onProgress?: (fetched: number, total: number) => void
): Promise<WPResource[]> {
  const allResources: WPResource[] = [];
  let page = 1;
  let totalPages = 1;
  let total = 0;

  while (page <= totalPages) {
    const result = await fetchResources({ page, modifiedAfter, postType });
    allResources.push(...result.resources);
    totalPages = result.totalPages;
    total = result.total;
    if (onProgress) onProgress(allResources.length, total);
    page++;
  }

  return allResources;
}

export async function fetchResourceById(
  id: number,
  postType?: string
): Promise<WPResource> {
  const restBase = postType || getPrimaryPostTypeRestBase();
  const { data } = await wpFetch<WPResource>(`/${restBase}/${id}`);
  return data;
}

/**
 * Fetches only the IDs of all resources from WordPress. Used for deletion detection
 * during full sync (compare server IDs vs local IDs).
 * @param postType - Optional post type REST base override
 * @returns Array of resource ID numbers
 */
export async function fetchResourceIds(postType?: string): Promise<number[]> {
  const restBase = postType || getPrimaryPostTypeRestBase();
  const hasAuth = hasValidCredentials();
  const { data } = await wpFetch<{ id: number }[]>(
    `/${restBase}?per_page=100&_fields=id&status=any`,
    {},
    hasAuth
  );
  return data.map((r) => r.id);
}

export async function createResource(
  payload: UpdateResourcePayload,
  postType?: string
): Promise<WPResource> {
  const restBase = postType || getPrimaryPostTypeRestBase();
  const { data } = await wpFetch<WPResource>(
    `/${restBase}`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    true
  );
  return data;
}

export async function updateResource(
  id: number,
  payload: UpdateResourcePayload,
  postType?: string
): Promise<WPResource> {
  const restBase = postType || getPrimaryPostTypeRestBase();

  console.log(`[wp-client] Updating ${restBase} ${id}, payload keys:`, Object.keys(payload));

  const { data } = await wpFetch<WPResource>(`/${restBase}/${id}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  console.log(`[wp-client] Response from WP: id=${data.id}, title="${data.title.rendered}", status=${data.status}`);

  // Verify title was updated
  if (payload.title !== undefined && data.title.rendered !== payload.title) {
    console.warn(`[wp-client] TITLE MISMATCH for resource ${id}: sent="${payload.title}", received="${data.title.rendered}"`);
  }

  // Verify taxonomy data (dynamic based on profile)
  const taxonomySlugs = getTaxonomies();
  for (const taxonomy of taxonomySlugs) {
    const sent = payload[taxonomy] as number[] | undefined;
    const received = data[taxonomy] as number[] | undefined;
    if (sent && sent.length > 0) {
      const sentSorted = [...sent].sort();
      const receivedSorted = received ? [...received].sort() : [];
      const match = JSON.stringify(sentSorted) === JSON.stringify(receivedSorted);
      if (!match) {
        console.warn(`[wp-client] TAXONOMY MISMATCH for ${taxonomy}: sent=${JSON.stringify(sent)}, received=${JSON.stringify(received)}`);
      }
    }
  }

  return data;
}

// ─── Batch Operations ────────────────────────────────────────────────────────

export interface BatchRequest {
  method: 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: Record<string, unknown>;
}

export interface BatchResponse {
  responses: Array<{
    status: number;
    body: unknown;
  }>;
}

/**
 * Sends a batch of update requests to the WordPress REST API batch endpoint.
 * WordPress limits batches to 25 requests max.
 * @param requests - Array of BatchRequest objects (method, path, body)
 * @returns BatchResponse with results keyed by request path
 */
export async function batchUpdate(requests: BatchRequest[]): Promise<BatchResponse> {
  const url = `${getWpBaseUrl()}/wp-json/batch/v1`;

  console.log(`[wp-client] Batch update: ${requests.length} requests`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify({ requests }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Batch API Error: ${response.status} - ${error}`);
  }

  const result = await response.json();

  // WordPress batch API may return responses as an object keyed by path
  // Normalize to array format
  if (result.responses && !Array.isArray(result.responses)) {
    const responseArray: Array<{ status: number; body: unknown }> = [];
    for (const req of requests) {
      const key = req.path;
      const resp = result.responses[key];
      if (resp) {
        responseArray.push({
          status: resp.status ?? 200,
          body: resp.body ?? resp,
        });
      } else {
        responseArray.push({ status: 500, body: { error: 'No response for path' } });
      }
    }
    result.responses = responseArray;
  }

  return result;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

/**
 * Tests the WordPress REST API connection using current credentials.
 * Verifies both API accessibility and authentication.
 * @returns Object with `success` boolean and `message` describing the result
 */
export async function testConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(`${getWpBaseUrl()}/wp-json/wp/v2/`, {
      headers: {
        Authorization: getAuthHeader(),
      },
    });

    if (response.ok) {
      const profile = getProfileManager().getCurrentProfile();
      const siteName = profile?.profile_name || 'WordPress';
      return { success: true, message: `Connected to ${siteName}` };
    }
    return { success: false, message: `HTTP ${response.status}` };
  } catch (error) {
    return { success: false, message: String(error) };
  }
}
