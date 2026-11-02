/**
 * Content planner classification slots.
 *
 * A planner idea stores up to three classification slots (columns on
 * `planner_ideas`): one single-select "primary" term
 * (`resource_type_term_id`), a multi-select "tags" list (`topic_term_ids`)
 * and a multi-select "audience" list (`audience_term_ids`). Which taxonomy
 * each slot maps to is configured per profile:
 *
 * ```json
 * "plugin_settings": {
 *   "content-planner": {
 *     "classification": {
 *       "primary":  { "taxonomy": "category", "label": "Category" },
 *       "tags":     { "taxonomy": "post_tag", "label": "Tags" },
 *       "audience": { "taxonomy": "audience", "label": "Audience" }
 *     }
 *   }
 * }
 * ```
 *
 * A slot that is omitted (or set to null) is hidden. Without any config the
 * generic WordPress defaults below apply. Pure module: safe for client code.
 */

export type PlannerSlotId = 'primary' | 'tags' | 'audience';

export interface PlannerSlot {
  taxonomy: string;
  label: string;
}

export type PlannerClassification = Record<PlannerSlotId, PlannerSlot | null>;

export const DEFAULT_PLANNER_CLASSIFICATION: PlannerClassification = {
  primary: { taxonomy: 'category', label: 'Category' },
  tags: { taxonomy: 'post_tag', label: 'Tags' },
  audience: null,
};

function parseSlot(raw: unknown, fallbackLabel: string): PlannerSlot | null {
  if (raw === null) return null;
  if (typeof raw === 'string' && raw.trim()) return { taxonomy: raw.trim(), label: fallbackLabel };
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.taxonomy === 'string' && obj.taxonomy.trim()) {
      return {
        taxonomy: obj.taxonomy.trim(),
        label: typeof obj.label === 'string' && obj.label.trim() ? obj.label.trim() : fallbackLabel,
      };
    }
  }
  return null;
}

/**
 * Resolve the classification slots from the content-planner plugin settings
 * of the active profile. `taxonomyLabels` (slug -> name) supplies default
 * labels for slots configured with a bare slug.
 */
export function resolvePlannerClassification(
  pluginSettings: Record<string, unknown> | undefined,
  taxonomyLabels: Record<string, string> = {},
): PlannerClassification {
  const raw = pluginSettings?.classification;
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PLANNER_CLASSIFICATION };
  const cfg = raw as Record<string, unknown>;
  const label = (slot: unknown, fallback: string): string => {
    if (typeof slot === 'string') return taxonomyLabels[slot] || fallback;
    if (slot && typeof slot === 'object') {
      const tax = (slot as Record<string, unknown>).taxonomy;
      if (typeof tax === 'string') return taxonomyLabels[tax] || fallback;
    }
    return fallback;
  };
  return {
    primary: parseSlot(cfg.primary, label(cfg.primary, 'Primary')),
    tags: parseSlot(cfg.tags, label(cfg.tags, 'Tags')),
    audience: parseSlot(cfg.audience, label(cfg.audience, 'Audience')),
  };
}
