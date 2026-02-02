const WP_BASE_URL = process.env.WP_BASE_URL || 'https://plexkits.com';
const WP_USERNAME = process.env.WP_USERNAME || '';
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD || '';

export const TAXONOMIES = [
  'resource-type',
  'topic',
  'intent',
  'audience',
  'leagues',
  'access_level',
  'competition_format',
  'bracket-size',
  'file_format',
] as const;

export type TaxonomySlug = typeof TAXONOMIES[number];

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
  'resource-type': number[];
  topic: number[];
  intent: number[];
  audience: number[];
  leagues: number[];
  access_level: number[];
  competition_format: number[];
  'bracket-size': number[];
  file_format: number[];
  meta_box?: Record<string, unknown>;
}

function getAuthHeader(): string {
  const credentials = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString('base64');
  return `Basic ${credentials}`;
}

async function wpFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  requiresAuth: boolean = true
): Promise<{ data: T; headers: Headers }> {
  const url = `${WP_BASE_URL}/wp-json/wp/v2${endpoint}`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers as Record<string, string>,
  };

  // Only add auth if credentials are configured and auth is required
  if (requiresAuth && WP_USERNAME && WP_APP_PASSWORD) {
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

export async function fetchTaxonomyTerms(taxonomy: TaxonomySlug): Promise<WPTerm[]> {
  // Taxonomies don't require auth for public terms
  const { data } = await wpFetch<WPTerm[]>(`/${taxonomy}?per_page=100`, {}, false);
  return data.map((term) => ({ ...term, taxonomy }));
}

export async function fetchAllTaxonomies(): Promise<Record<TaxonomySlug, WPTerm[]>> {
  const results = await Promise.all(
    TAXONOMIES.map(async (taxonomy) => {
      try {
        const terms = await fetchTaxonomyTerms(taxonomy);
        return { taxonomy, terms };
      } catch (error) {
        console.error(`Error fetching ${taxonomy}:`, error);
        return { taxonomy, terms: [] };
      }
    })
  );

  return results.reduce(
    (acc, { taxonomy, terms }) => {
      acc[taxonomy] = terms;
      return acc;
    },
    {} as Record<TaxonomySlug, WPTerm[]>
  );
}

export interface FetchResourcesOptions {
  page?: number;
  perPage?: number;
  status?: string;
  modifiedAfter?: string;
}

export interface FetchResourcesResult {
  resources: WPResource[];
  total: number;
  totalPages: number;
}

export async function fetchResources(
  options: FetchResourcesOptions = {}
): Promise<FetchResourcesResult> {
  const { page = 1, perPage = 100, status = 'publish', modifiedAfter } = options;

  // Only use auth if we need non-public statuses
  const hasAuth = Boolean(WP_USERNAME && WP_APP_PASSWORD);
  const needsAuth = status !== 'publish' && hasAuth;
  const statusParam = needsAuth ? status : 'publish';

  let endpoint = `/resource?per_page=${perPage}&page=${page}&status=${statusParam}`;
  if (modifiedAfter) {
    endpoint += `&modified_after=${encodeURIComponent(modifiedAfter)}`;
  }

  const { data, headers } = await wpFetch<WPResource[]>(endpoint, {}, needsAuth);
  
  return {
    resources: data,
    total: parseInt(headers.get('X-WP-Total') || '0', 10),
    totalPages: parseInt(headers.get('X-WP-TotalPages') || '0', 10),
  };
}

export async function fetchAllResources(
  modifiedAfter?: string
): Promise<WPResource[]> {
  const allResources: WPResource[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const result = await fetchResources({ page, modifiedAfter });
    allResources.push(...result.resources);
    totalPages = result.totalPages;
    page++;
  }

  return allResources;
}

export async function fetchResourceById(id: number): Promise<WPResource> {
  const { data } = await wpFetch<WPResource>(`/resource/${id}`);
  return data;
}

export async function fetchResourceIds(): Promise<number[]> {
  // Fetch only published resources without auth
  const { data } = await wpFetch<{ id: number }[]>(
    '/resource?per_page=100&_fields=id&status=publish',
    {},
    false
  );
  return data.map((r) => r.id);
}

export async function createResource(
  payload: UpdateResourcePayload
): Promise<WPResource> {
  const { data } = await wpFetch<WPResource>('/resource', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, true);
  return data;
}

export interface UpdateResourcePayload {
  title?: string;
  status?: string;
  content?: string;
  'resource-type'?: number[];
  topic?: number[];
  intent?: number[];
  audience?: number[];
  leagues?: number[];
  access_level?: number[];
  competition_format?: number[];
  'bracket-size'?: number[];
  file_format?: number[];
  meta_box?: Record<string, unknown>;
}

export async function updateResource(
  id: number,
  payload: UpdateResourcePayload
): Promise<WPResource> {
  const { data } = await wpFetch<WPResource>(`/resource/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return data;
}

export interface BatchRequest {
  method: 'PUT' | 'POST' | 'DELETE';
  path: string;
  body?: Record<string, unknown>;
}

export interface BatchResponse {
  responses: Array<{
    status: number;
    body: unknown;
  }>;
}

export async function batchUpdate(requests: BatchRequest[]): Promise<BatchResponse> {
  const url = `${WP_BASE_URL}/wp-json/batch/v1`;
  
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

  return response.json();
}

export async function testConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(`${WP_BASE_URL}/wp-json/wp/v2/`, {
      headers: {
        Authorization: getAuthHeader(),
      },
    });
    
    if (response.ok) {
      return { success: true, message: 'Connected to WordPress REST API client for PLEXKITS' };
    }
    return { success: false, message: `HTTP ${response.status}` };
  } catch (error) {
    return { success: false, message: String(error) };
  }
}
