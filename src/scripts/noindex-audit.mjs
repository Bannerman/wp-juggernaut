#!/usr/bin/env node
// Read-only audit of SEOPress robots flags across all posts on a target WP site.
// Reports any post with `value === 'yes'` on _seopress_robots_index/follow/snippet/imageindex.
// No mutations.
//
// Usage:
//   AUDIT_BASE=https://plexkits.com AUDIT_USER=... AUDIT_PASS='...' \
//     node scripts/noindex-audit.mjs

import fs from 'node:fs';
import path from 'node:path';

const BASE = (process.env.AUDIT_BASE || '').replace(/\/$/, '');
let USER = process.env.AUDIT_USER;
let PASS = process.env.AUDIT_PASS;

// Fall back to ~/.juggernaut/site-config.json for the active target's creds
if ((!BASE || !USER || !PASS)) {
  const cfgPath = path.join(process.env.HOME || '', '.juggernaut', 'site-config.json');
  if (fs.existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      const c = cfg.siteCredentials?.production;
      if (c) { USER = USER || c.username; PASS = PASS || c.appPassword; }
    } catch {}
  }
}

if (!BASE || !USER || !PASS) {
  console.error('Set AUDIT_BASE, AUDIT_USER, AUDIT_PASS env vars.');
  process.exit(2);
}

const auth = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const POST_TYPES = process.env.AUDIT_TYPES?.split(',') || ['post', 'resource', 'product'];

async function api(pathStr, params = {}) {
  const url = new URL(BASE + pathStr);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { Authorization: auth } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} :: ${url}`);
  return { json: await res.json(), totalPages: parseInt(res.headers.get('x-wp-totalpages') || '1', 10) };
}

async function listAllPostsOfType(type) {
  // Resolve REST base for the post type
  const types = await api('/wp-json/wp/v2/types').then(r => r.json).catch(() => null);
  const restBase = types?.[type]?.rest_base || (type === 'post' ? 'posts' : type === 'page' ? 'pages' : type);
  const out = [];
  for (let page = 1; ; page++) {
    let r;
    try {
      r = await api(`/wp-json/wp/v2/${restBase}`, { per_page: 100, page, _fields: 'id,title,status,link' });
    } catch (err) {
      if (String(err).includes('400') || String(err).includes('404')) break;
      throw err;
    }
    if (!Array.isArray(r.json) || r.json.length === 0) break;
    out.push(...r.json.map(p => ({ ...p, post_type: type })));
    if (page >= r.totalPages) break;
  }
  return out;
}

async function fetchRobots(postId, postType) {
  // Read raw post meta directly. SEOPress's /meta-robot-settings wrapper
  // returns a UI-helper `value` field whose semantics don't match the stored
  // meta — using it gave false positives on every post that had been touched.
  // Source of truth: meta key `_seopress_robots_index` etc.
  //   ''     → no override (use site default)
  //   'yes'  → explicitly noindex
  //   'no'   → explicitly index normally
  const restBase = postType === 'post' ? 'posts' : postType === 'page' ? 'pages' : postType;
  const url = `${BASE}/wp-json/wp/v2/${restBase}/${postId}?context=edit&_fields=meta`;
  const res = await fetch(url, { headers: { Authorization: auth } });
  if (!res.ok) return null;
  const data = await res.json();
  const meta = data?.meta || {};
  const flags = {};
  for (const k of ['_seopress_robots_index', '_seopress_robots_follow', '_seopress_robots_snippet', '_seopress_robots_imageindex']) {
    flags[k] = meta[k];
  }
  return flags;
}

async function main() {
  console.log(`Audit target: ${BASE}`);
  console.log(`Post types: ${POST_TYPES.join(', ')}\n`);

  const allPosts = [];
  for (const t of POST_TYPES) {
    process.stdout.write(`Listing ${t}... `);
    const posts = await listAllPostsOfType(t);
    console.log(`${posts.length}`);
    allPosts.push(...posts);
  }
  console.log(`Total: ${allPosts.length} posts. Probing SEOPress robots flags...\n`);

  const flagged = [];
  let i = 0;
  for (const p of allPosts) {
    i++;
    if (i % 25 === 0) process.stdout.write(`  …${i}/${allPosts.length}\r`);
    let flags;
    try { flags = await fetchRobots(p.id, p.post_type); }
    catch { continue; }
    if (!flags) continue;
    const yesFlags = Object.entries(flags).filter(([, v]) => v === 'yes').map(([k]) => k.replace('_seopress_robots_', ''));
    if (yesFlags.length > 0) {
      flagged.push({ id: p.id, title: p.title?.rendered || '(no title)', post_type: p.post_type, status: p.status, link: p.link, flags: yesFlags });
    }
  }

  console.log(`\n\n${'='.repeat(70)}`);
  console.log(`AUDIT RESULTS — ${flagged.length} of ${allPosts.length} posts have one or more robots flags set to "yes"`);
  console.log('='.repeat(70));
  if (flagged.length === 0) {
    console.log('\n✓ No posts flagged. Nothing to clean up.');
    return;
  }
  // Group by combination of flags
  const groups = {};
  for (const f of flagged) {
    const key = f.flags.sort().join(',');
    (groups[key] ||= []).push(f);
  }
  for (const [combo, items] of Object.entries(groups).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n[${combo}]  ${items.length} post${items.length === 1 ? '' : 's'}`);
    for (const it of items.slice(0, 50)) {
      console.log(`  #${it.id}  ${it.post_type}/${it.status}  "${it.title.slice(0, 65)}"`);
      console.log(`         ${it.link}`);
    }
    if (items.length > 50) console.log(`  …and ${items.length - 50} more`);
  }

  // Write JSON for programmatic use
  const outPath = path.join(process.cwd(), 'noindex-audit-result.json');
  fs.writeFileSync(outPath, JSON.stringify({ base: BASE, total: allPosts.length, flaggedCount: flagged.length, flagged }, null, 2));
  console.log(`\nFull report written to ${outPath}`);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
