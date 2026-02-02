import { getDb } from './db';
import {
  updateResource,
  batchUpdate,
  fetchResourceById,
  type UpdateResourcePayload,
  type BatchRequest,
  TAXONOMIES,
  type TaxonomySlug,
} from './wp-client';
import { getResourceById, markResourceClean, getDirtyResources } from './queries';

export interface PushResult {
  success: boolean;
  resourceId: number;
  error?: string;
}

export interface ConflictInfo {
  resourceId: number;
  title: string;
  localModified: string;
  serverModified: string;
}

export async function checkForConflicts(resourceIds: number[]): Promise<ConflictInfo[]> {
  const db = getDb();
  const conflicts: ConflictInfo[] = [];

  for (const id of resourceIds) {
    const localResource = db
      .prepare('SELECT id, title, modified_gmt FROM resources WHERE id = ?')
      .get(id) as { id: number; title: string; modified_gmt: string } | undefined;

    if (!localResource) continue;

    try {
      const serverResource = await fetchResourceById(id);
      
      if (serverResource.modified_gmt !== localResource.modified_gmt) {
        conflicts.push({
          resourceId: id,
          title: localResource.title,
          localModified: localResource.modified_gmt,
          serverModified: serverResource.modified_gmt,
        });
      }
    } catch (error) {
      console.error(`Error checking conflict for resource ${id}:`, error);
    }
  }

  return conflicts;
}

function buildUpdatePayload(resourceId: number): UpdateResourcePayload {
  const resource = getResourceById(resourceId);
  if (!resource) throw new Error(`Resource ${resourceId} not found`);

  const payload: UpdateResourcePayload = {
    title: resource.title,
    status: resource.status,
  };

  // Add taxonomy assignments
  for (const taxonomy of TAXONOMIES) {
    const termIds = resource.taxonomies[taxonomy];
    if (termIds && termIds.length > 0) {
      (payload as Record<string, unknown>)[taxonomy] = termIds;
    }
  }

  // Add meta_box fields
  if (Object.keys(resource.meta_box).length > 0) {
    payload.meta_box = resource.meta_box;
  }

  return payload;
}

export async function pushResource(
  resourceId: number,
  skipConflictCheck: boolean = false
): Promise<PushResult> {
  try {
    // Check for conflicts
    if (!skipConflictCheck) {
      const conflicts = await checkForConflicts([resourceId]);
      if (conflicts.length > 0) {
        return {
          success: false,
          resourceId,
          error: `Conflict detected: server was modified at ${conflicts[0].serverModified}`,
        };
      }
    }

    const payload = buildUpdatePayload(resourceId);
    const updated = await updateResource(resourceId, payload);

    // Update local modified_gmt and mark as clean
    const db = getDb();
    db.prepare('UPDATE resources SET modified_gmt = ?, is_dirty = 0 WHERE id = ?').run(
      updated.modified_gmt,
      resourceId
    );

    return { success: true, resourceId };
  } catch (error) {
    return {
      success: false,
      resourceId,
      error: String(error),
    };
  }
}

export async function pushAllDirty(
  skipConflictCheck: boolean = false
): Promise<{
  results: PushResult[];
  conflicts: ConflictInfo[];
}> {
  const dirtyResources = getDirtyResources();
  const resourceIds = dirtyResources.map((r) => r.id);

  if (resourceIds.length === 0) {
    return { results: [], conflicts: [] };
  }

  // Check for conflicts first
  let conflicts: ConflictInfo[] = [];
  if (!skipConflictCheck) {
    conflicts = await checkForConflicts(resourceIds);
    if (conflicts.length > 0) {
      // Filter out conflicting resources
      const conflictIds = new Set(conflicts.map((c) => c.resourceId));
      const safeIds = resourceIds.filter((id) => !conflictIds.has(id));
      
      if (safeIds.length === 0) {
        return { results: [], conflicts };
      }
    }
  }

  // Use batch updates for efficiency (max 25 per batch)
  const results: PushResult[] = [];
  const BATCH_SIZE = 25;

  for (let i = 0; i < resourceIds.length; i += BATCH_SIZE) {
    const batch = resourceIds.slice(i, i + BATCH_SIZE);
    const batchResults = await pushBatch(batch, conflicts);
    results.push(...batchResults);

    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < resourceIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  return { results, conflicts };
}

async function pushBatch(
  resourceIds: number[],
  conflicts: ConflictInfo[]
): Promise<PushResult[]> {
  const conflictIds = new Set(conflicts.map((c) => c.resourceId));
  const results: PushResult[] = [];

  // Skip conflicting resources
  const safeIds = resourceIds.filter((id) => !conflictIds.has(id));
  
  if (safeIds.length === 0) {
    return resourceIds.map((id) => ({
      success: false,
      resourceId: id,
      error: 'Conflict detected',
    }));
  }

  try {
    const requests: BatchRequest[] = safeIds.map((id) => {
      const payload = buildUpdatePayload(id);
      return {
        method: 'PUT' as const,
        path: `/wp/v2/resource/${id}`,
        body: payload as unknown as Record<string, unknown>,
      };
    });

    const batchResponse = await batchUpdate(requests);
    const db = getDb();

    for (let i = 0; i < safeIds.length; i++) {
      const response = batchResponse.responses[i];
      const resourceId = safeIds[i];

      if (response.status >= 200 && response.status < 300) {
        const body = response.body as { modified_gmt?: string };
        if (body.modified_gmt) {
          db.prepare('UPDATE resources SET modified_gmt = ?, is_dirty = 0 WHERE id = ?').run(
            body.modified_gmt,
            resourceId
          );
        }
        results.push({ success: true, resourceId });
      } else {
        results.push({
          success: false,
          resourceId,
          error: `HTTP ${response.status}`,
        });
      }
    }
  } catch (error) {
    // If batch fails, try individual updates
    for (const id of safeIds) {
      const result = await pushResource(id, true);
      results.push(result);
    }
  }

  // Add results for conflicting resources
  for (const id of resourceIds) {
    if (conflictIds.has(id)) {
      results.push({
        success: false,
        resourceId: id,
        error: 'Conflict detected',
      });
    }
  }

  return results;
}
