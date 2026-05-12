/**
 * Agent Guide Generator
 *
 * Builds a single markdown file (`~/.juggernaut/agent-guide.md`) that any AI agent
 * on this machine can read to understand how to interact with Juggernaut and the
 * active profile's classification rules.
 *
 * Site-specific classification rules are not part of the app. They are read
 * from a markdown file next to the profile in the user profiles dir:
 * `~/.juggernaut/profiles/<profile_id>.rules.md`. Without one, generic
 * universal rules are used.
 *
 * Written automatically on app startup. Refreshed on profile change.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { getProfileManager, profileFileStem } from './profiles';
import { getActiveTarget, getActiveBaseUrl } from './site-config';
import { getUserConfigDir, getUserProfilesDir } from './user-config-dir';

function guideDir(): string {
  return getUserConfigDir();
}

function guidePath(): string {
  return path.join(guideDir(), 'agent-guide.md');
}

/**
 * Path of the user-provided classification rules for a profile.
 */
export function getProfileRulesPath(profileId: string): string {
  return path.join(getUserProfilesDir(), `${profileFileStem(profileId)}.rules.md`);
}

const GENERIC_RULES = `### Universal rules

- Pick the FEWEST terms that accurately classify a post. Quality over quantity.
- LEAVE A TAXONOMY EMPTY if no listed term is a clearly correct fit. Empty is a valid answer.
- Use ONLY exact term names from the available list. No inventing, no synonyms.
- Do NOT pick a term just because its name appears in the title or content.

_No site-specific rules are installed for this profile. To add them, create the rules file named above; its contents replace this section._`;

/**
 * Load the classification rules section for a profile: the user's rules file
 * when present, otherwise the generic universal rules.
 */
function loadClassificationRules(profileId: string): { body: string; rulesPath: string; custom: boolean } {
  const rulesPath = getProfileRulesPath(profileId);
  try {
    const custom = fs.readFileSync(rulesPath, 'utf-8').trim();
    if (custom) return { body: custom, rulesPath, custom: true };
  } catch {
    // No rules file: fall through to generic rules
  }
  return { body: GENERIC_RULES, rulesPath, custom: false };
}

/**
 * Build the agent guide markdown from current state.
 * Pure function — call when state changes (profile load, site switch).
 */
export function buildAgentGuide(): string {
  const manager = getProfileManager();
  const profile = manager.getCurrentProfile();
  const target = getActiveTarget();
  const baseUrl = getActiveBaseUrl();

  if (!profile) {
    return '# Juggernaut Agent Guide\n\n_No profile loaded yet. Re-export after the app finishes initializing._\n';
  }

  const taxonomies = profile.taxonomies || [];
  const editableTaxonomies = taxonomies.filter(
    t => t.editable !== false || !!t.conditional?.show_when
  );
  const postTypes = profile.post_types || [];

  const generatedAt = new Date().toISOString();
  const rules = loadClassificationRules(profile.profile_id);

  const taxonomyBlock = editableTaxonomies
    .map(t => {
      const note = t.conditional?.show_when
        ? ` _(only when \`${t.conditional.show_when.taxonomy}\` includes term ${t.conditional.show_when.has_term_id})_`
        : '';
      return `- **${t.name}** (\`${t.slug}\`)${note}`;
    })
    .join('\n');

  const postTypeBlock = postTypes
    .map(pt => `- **${pt.name}** (slug: \`${pt.slug}\`, REST base: \`${pt.rest_base}\`)`)
    .join('\n');

  return `# Juggernaut Agent Guide

_Auto-generated ${generatedAt}. Regenerated on every Juggernaut launch and profile change. Do not hand-edit — your changes will be overwritten._

## What this is

Juggernaut is a desktop content management tool for WordPress, currently running on this machine. It exposes an MCP (Model Context Protocol) server so agents like you can read and edit posts, taxonomies, and SEO data on the active WordPress site.

## Active context (right now, this install)

- **Workspace / profile:** ${profile.profile_name} (\`${profile.profile_id}\`)
- **Active site:** ${target.name} — ${baseUrl}
- **Environment:** ${target.environment || 'unspecified'}
- **Post types you can edit:**
${postTypeBlock || '  _none_'}
- **Editable taxonomies:**
${taxonomyBlock || '  _none_'}

## How to connect (for clients that aren't auto-discovering)

The Juggernaut MCP server is bundled with this app. If your client (Claude Desktop, Cursor, etc.) needs an explicit config entry, point it at the MCP server path:

\`\`\`json
{
  "mcpServers": {
    "juggernaut": {
      "command": "node",
      "args": ["${path.join(os.homedir(), 'Documents/GitHub/wp-juggernaut/src/mcp-server/dist/index.js')}"]
    }
  }
}
\`\`\`

(That path is the dev location — the packaged install path may differ. Check the [Juggernaut docs](https://github.com/Bannerman/wp-juggernaut) for the canonical config.)

Once connected, your client will list the tool surface automatically — \`list_posts\`, \`get_post\`, \`create_post\`, \`update_post\`, \`update_seo\`, \`update_post_terms\`, \`list_terms\`, \`get_site_index\`, \`get_stats\`, \`get_post_history\`. Use those rather than calling the WP REST API directly.

## How to author a new post

\`create_post\` writes a local stub to the Juggernaut SQLite DB with a synthetic *negative* ID (e.g., \`-1\`, \`-2\`). The post is marked dirty and pending push. It does **NOT** exist on WordPress yet — Juggernaut only contacts WP when the user clicks Push from the app, at which point the stub is created on WP and the local row is renumbered to the real positive WP ID.

Flow:

1. \`get_site_index\` (if you don't yet know what post types and taxonomies are available).
2. \`list_terms\` for any taxonomy you plan to assign (so you have term IDs).
3. \`create_post({ post_type, title, ...optional fields })\` — returns \`{ local_id, ... }\`. The \`local_id\` is negative and only valid in this Juggernaut install until push.
4. \`update_post(local_id, ...)\` to add more content/meta. \`update_post_terms\` and \`update_seo\` work the same way using the negative \`local_id\`.
5. Tell the user the draft is ready for review in the Juggernaut app. They review, then push when ready.

After the push, the post has a real positive WP ID. If you need to find it again, query by title or slug via \`list_posts\`.

## How to edit an existing post

1. \`get_site_index\` first if you don't yet know what taxonomies / post types are available.
2. \`list_posts\` to find the target post (filter by post type, status, or search).
3. \`get_post\` to load its current title, content, meta, and terms before changing anything.
4. \`list_terms\` for any taxonomy you plan to change, so you have term IDs.
5. Decide classification using the rules in the next section. **Do not over-tag.**
6. \`update_post\` to change title, content, slug, status, or meta fields. This marks the post dirty locally; it does **not** push to WordPress automatically.
7. \`update_post_terms\` to change taxonomy assignments.
8. \`update_seo\` to set SEO title / description / robots flags.

## Classification rules — read carefully

${rules.custom ? `_Loaded from \`${rules.rulesPath}\`._` : `_Rules file: \`${rules.rulesPath}\` (not present)._`}

${rules.body}

## Best practices

- **Sync first** if you're not sure the local DB has the latest server state. Use \`get_post\` against a known ID and compare.
- **Push deliberately** — Juggernaut tracks dirty state per-post. Edits accumulate locally, push sends them to WP. If you want a change live immediately, do the push step.
- **Don't overwrite working SEO** without checking first — \`get_post\` returns the current SEO state.

## When in doubt

If a post genuinely doesn't fit any term in a taxonomy, output empty for that taxonomy. The system supports empty answers and pushes them correctly. Inventing a near-fit term wastes downstream attention.
`;
}

/**
 * Write the guide to ~/.juggernaut/agent-guide.md.
 * Safe to call repeatedly; idempotent (no-op if content unchanged).
 */
export function writeAgentGuide(): void {
  try {
    const GUIDE_PATH = guidePath();
    if (!fs.existsSync(guideDir())) {
      fs.mkdirSync(guideDir(), { recursive: true });
    }
    const next = buildAgentGuide();
    let prev = '';
    try { prev = fs.readFileSync(GUIDE_PATH, 'utf-8'); } catch { /* no prior */ }
    // Strip the auto-generated timestamp line before comparing so timestamp
    // alone doesn't trigger a write.
    const stripTs = (s: string) => s.replace(/_Auto-generated [^\n]+_/g, '');
    if (stripTs(prev) === stripTs(next)) return;
    fs.writeFileSync(GUIDE_PATH, next, 'utf-8');
    console.log(`[agent-guide] Wrote ${GUIDE_PATH}`);
  } catch (err) {
    console.error('[agent-guide] Failed to write agent guide:', err);
  }
}

export function getAgentGuidePath(): string {
  return guidePath();
}
