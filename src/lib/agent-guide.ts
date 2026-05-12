/**
 * Agent Guide Generator
 *
 * Builds a single markdown file (`~/.juggernaut/agent-guide.md`) that any AI agent
 * on this machine can read to understand how to interact with Juggernaut and the
 * PLEXKITS classification rules.
 *
 * Written automatically on app startup. Refreshed on profile change.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { getProfileManager } from './profiles';
import { getActiveTarget, getActiveBaseUrl } from './site-config';

const GUIDE_DIR = path.join(os.homedir(), '.juggernaut');
const GUIDE_PATH = path.join(GUIDE_DIR, 'agent-guide.md');

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

Once connected, your client will list the tool surface automatically — \`list_posts\`, \`get_post\`, \`update_post\`, \`update_seo\`, \`update_post_terms\`, \`list_terms\`, \`get_site_index\`, \`get_stats\`, \`get_post_history\`. Use those rather than calling the WP REST API directly.

## How to draft a post

The recipe for creating new content via Juggernaut:

1. \`get_site_index\` first if you don't yet know what taxonomies / post types are available.
2. \`list_terms\` for any taxonomy you plan to assign, so you have term IDs.
3. Decide classification using the rules in the next section. **Do not over-tag.**
4. Use \`update_post\` (with \`create: true\` or by creating via the REST proxy if available) to save the post.
5. \`update_post_terms\` to assign taxonomy terms.
6. \`update_seo\` to set SEO title / description / robots flags.

## Classification rules — read carefully

These rules originate from the PLEXKITS Taxonomy Selection Guide. Follow them when picking taxonomy terms for posts.

### Universal rules

- Pick the FEWEST terms that accurately classify a post. Quality over quantity.
- LEAVE A TAXONOMY EMPTY if no listed term is a clearly correct fit. Empty is a valid answer.
- Use ONLY exact term names from the available list — no inventing, no synonyms.
- Do NOT pick a term just because its name appears in the title or content.

### \`resource-type\` (pick exactly 1)

What kind of artifact this is — its primary form factor, not the file format.

- **Bracket** = a tournament/competition structure
- **Tracker** = ongoing data entry over time (workout log, expense tracker, draft tracker)
- **Calculator** = formula-driven output (mortgage calc, calorie calc)
- **Checklist** = a task list with checkboxes
- **Spreadsheet** = one-time data organization or reference (NOT ongoing tracking)
- **Slide Deck** = a presentation file
- **Poster** = a printable reference or wall display
- **Document** = a fillable form, contract, or long-form text
- **Worksheet** = a single-use activity sheet (especially for students)
- **Lesson Plan** = a teaching resource with activities

### \`topic\` (pick 1–3, primary first)

Broad subject area. The first term you list is the primary (used in URL/breadcrumb). For sports, the primary should be the sport itself (Football, Basketball) — add Sports as secondary only if useful.

### \`leagues\` (pick 0–2, sports-only)

Use only if the post is tied to a specific pro league. Empty for generic brackets, multi-sport events (Olympics), or non-sports.

### \`intent\` (pick 1–3)

The primary action the user takes WITH this resource:

- **Plan** = prepare, schedule, or organize future activities
- **Track** = record and monitor ongoing data
- **Compete** = run or participate in competitions
- **Manage** = oversee operations, teams, or projects
- **Analyze** = review data, calculate, or evaluate
- **Learn** = understand concepts or acquire skills

### \`audience\` (pick 0–2, DEFAULT EMPTY)

Pick a term ONLY if the resource is explicitly built for that role's professional workflow. Most resources are general-consumer; for those, output empty.

- A Lesson Plan for **teachers** ✓
- A Tournament Director Run-of-Show for **tournament-directors** ✓
- An NFL Draft Tracker is general consumer (sports fans) — audience: empty ✗

### \`bracket-size\` (pick exactly 1 if the post IS a bracket, else empty)

Number of teams in the bracket. Empty if not a bracket post.

### \`competition_format\` (pick exactly 1 if the post organizes a tournament, else empty)

The tournament structure (Single Elimination, Round Robin, Pool Play, etc.). Empty if no competition is organized.

## Best practices

- **Sync first** if you're not sure the local DB has the latest server state. Use \`get_post\` against a known ID and compare.
- **Push deliberately** — Juggernaut tracks dirty state per-post. Edits accumulate locally, push sends them to WP. If you want a change live immediately, do the push step.
- **Leave audience empty** unless you have a specific reason. The default model picks audiences that are wrong.
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
    if (!fs.existsSync(GUIDE_DIR)) {
      fs.mkdirSync(GUIDE_DIR, { recursive: true });
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

export const AGENT_GUIDE_PATH = GUIDE_PATH;
