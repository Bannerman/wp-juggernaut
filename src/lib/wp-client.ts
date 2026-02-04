export const WP_BASE_URL = process.env.WP_BASE_URL || 'https://plexkits.com';
export const WP_USERNAME = process.env.WP_USERNAME || '';
export const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD || '';

export const TAXONOMIES = [
  'resource-type',
  'topic',
  'intent',
  'audience',
  'leagues',
  'competition_format',
  'bracket-size',
  'file_format',
] as const;

export type TaxonomySlug = typeof TAXONOMIES[number];

// Mapping from taxonomy REST slug to the Meta Box field ID used for updates.
// Some taxonomies (like file_format) don't have a Meta Box field and only
// work via the top-level REST field.
export const TAXONOMY_META_FIELD: Partial<Record<TaxonomySlug, string>> = {
  'resource-type': 'tax_resource_type',
  'topic': 'tax_topic',
  'intent': 'tax_intent',
  'audience': 'tax_audience',
  'leagues': 'tax_league',
  'bracket-size': 'tax_bracket_size',
  'competition_format': 'taax_competition_format', // typo is in the WP Meta Box config
  // file_format has no Meta Box field - only works via top-level REST field
};

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
  const { page = 1, perPage = 100, status = 'any', modifiedAfter } = options;

  // Use auth if we have credentials and need non-public statuses
  const hasAuth = Boolean(WP_USERNAME && WP_APP_PASSWORD);
  const needsAuth = hasAuth && status !== 'publish';

  console.log(`[wp-client] fetchResources - status: ${status}, hasAuth: ${hasAuth}, needsAuth: ${needsAuth}`);

  let endpoint = `/resource?per_page=${perPage}&page=${page}&status=${status}`;
  if (modifiedAfter) {
    endpoint += `&modified_after=${encodeURIComponent(modifiedAfter)}`;
  }

  console.log(`[wp-client] Fetching: ${endpoint}`);

  const { data, headers } = await wpFetch<WPResource[]>(endpoint, {}, needsAuth);
  
  console.log(`[wp-client] Received ${data.length} resources from WordPress:`);
  data.forEach(r => console.log(`  - ID: ${r.id}, Title: ${r.title.rendered}, Status: ${r.status}`));
  
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
  // Fetch all resources with auth to include drafts
  const hasAuth = Boolean(WP_USERNAME && WP_APP_PASSWORD);
  const { data } = await wpFetch<{ id: number }[]>(
    '/resource?per_page=100&_fields=id&status=any',
    {},
    hasAuth
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
  featured_media?: number;
  'resource-type'?: number[];
  topic?: number[];
  intent?: number[];
  audience?: number[];
  leagues?: number[];
  competition_format?: number[];
  'bracket-size'?: number[];
  file_format?: number[];
  meta_box?: Record<string, unknown>;
}

export async function updateResource(
  id: number,
  payload: UpdateResourcePayload
): Promise<WPResource> {
  console.log(`[wp-client] Updating resource ${id}, payload keys:`, Object.keys(payload));
  console.log(`[wp-client] Full payload:`, JSON.stringify(payload, null, 2));

  const { data } = await wpFetch<WPResource>(`/resource/${id}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  // Log what WordPress returned
  console.log(`[wp-client] Response from WP: id=${data.id}, title="${data.title.rendered}", status=${data.status}, modified_gmt=${data.modified_gmt}`);

  // Verify title was updated
  if (payload.title !== undefined && data.title.rendered !== payload.title) {
    console.warn(`[wp-client] TITLE MISMATCH for resource ${id}: sent="${payload.title}", received="${data.title.rendered}"`);
    console.warn(`[wp-client] WordPress may not be accepting title updates. Check if the title field is protected by a plugin or theme.`);
  } else if (payload.title !== undefined) {
    console.log(`[wp-client] Title verified: "${data.title.rendered}"`);
  }

  // Verify taxonomy data in response
  for (const taxonomy of TAXONOMIES) {
    const sent = (payload as Record<string, unknown>)[taxonomy] as number[] | undefined;
    const received = data[taxonomy as keyof WPResource] as number[] | undefined;
    if (sent && sent.length > 0) {
      const sentSorted = [...sent].sort();
      const receivedSorted = received ? [...received].sort() : [];
      const match = JSON.stringify(sentSorted) === JSON.stringify(receivedSorted);
      if (!match) {
        console.warn(`[wp-client] TAXONOMY MISMATCH for ${taxonomy} on resource ${id}: sent=${JSON.stringify(sent)}, received=${JSON.stringify(received)}`);
      }
    }
  }

  return data;
}

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

export async function batchUpdate(requests: BatchRequest[]): Promise<BatchResponse> {
  const url = `${WP_BASE_URL}/wp-json/batch/v1`;

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

  // WordPress batch API may return responses as an object keyed by path, not an array
  // Normalize to array format
  if (result.responses && !Array.isArray(result.responses)) {
    console.log(`[wp-client] Batch response is object-keyed, converting to array`);
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
        console.warn(`[wp-client] No batch response for path: ${key}`);
        responseArray.push({ status: 500, body: { error: 'No response for path' } });
      }
    }
    result.responses = responseArray;
  }

  console.log(`[wp-client] Batch response: ${result.responses?.length ?? 0} responses`);
  if (Array.isArray(result.responses)) {
    result.responses.forEach((r: { status: number; body: unknown }, i: number) => {
      const body = r.body as Record<string, unknown>;
      console.log(`[wp-client]   [${i}] status=${r.status}, id=${body?.id}, title=${(body?.title as Record<string, string>)?.rendered ?? 'N/A'}`);
    });
  }

  return result;
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
