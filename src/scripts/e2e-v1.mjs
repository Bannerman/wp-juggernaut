#!/usr/bin/env node
// End-to-end v1.0 readiness test.
// Drives a running Next dev server through the full credentials → sync → edit → push round trip
// against a real WordPress target, then reverts the mutation so the run is non-destructive.
//
// Usage: ensure `npm run dev` is running, then `node scripts/e2e-v1.mjs`.

import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.E2E_BASE || 'http://localhost:3000';
const WP_TIMEOUT_MS = 60_000;
const SYNC_TIMEOUT_MS = 5 * 60_000;

const envPath = path.join(process.cwd(), '.env.local');
const envText = fs.readFileSync(envPath, 'utf-8');
const env = Object.fromEntries(
  envText
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const WP_URL = env.WP_BASE_URL;
const WP_USER = env.WP_USERNAME;
const WP_PASS = env.WP_APP_PASSWORD;
if (!WP_URL || !WP_USER || !WP_PASS) {
  fail('Missing WP_BASE_URL / WP_USERNAME / WP_APP_PASSWORD in .env.local');
}
const wpAuth = 'Basic ' + Buffer.from(`${WP_USER}:${WP_PASS}`).toString('base64');

let stepNum = 0;
const results = [];

function step(name) {
  stepNum += 1;
  const id = `${stepNum}. ${name}`;
  process.stdout.write(`\n→ ${id}\n`);
  return id;
}
function pass(id, detail = '') {
  results.push({ id, ok: true, detail });
  console.log(`  ✓ ${detail || 'ok'}`);
}
function failStep(id, detail) {
  results.push({ id, ok: false, detail });
  console.error(`  ✗ ${detail}`);
}
function fail(msg) {
  console.error(`\nFATAL: ${msg}`);
  process.exit(2);
}

async function http(method, url, body, init = {}) {
  const opts = { method, headers: { 'Content-Type': 'application/json', ...init.headers } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeout || WP_TIMEOUT_MS);
  opts.signal = ctrl.signal;
  try {
    const res = await fetch(url, opts);
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json };
  } finally {
    clearTimeout(t);
  }
}

async function waitForServer() {
  const id = step('Wait for dev server');
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/stats`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return pass(id, `dev server ready at ${BASE}`);
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  failStep(id, `dev server not reachable at ${BASE}`);
  process.exit(2);
}

async function checkConnection() {
  const id = step('Verify WP connection (/api/test-connection)');
  const r = await http('GET', `${BASE}/api/test-connection`);
  if (r.status === 200 && (r.body.success || r.body.ok || r.body.connected)) {
    return pass(id, `connected to ${WP_URL}`);
  }
  failStep(id, `status=${r.status} body=${JSON.stringify(r.body).slice(0, 200)}`);
  process.exit(2);
}

async function runSync() {
  const id = step('Run full sync (/api/sync)');
  const start = Date.now();
  const r = await http('POST', `${BASE}/api/sync`, { incremental: false }, { timeout: SYNC_TIMEOUT_MS });
  const took = ((Date.now() - start) / 1000).toFixed(1);
  if (r.status === 200 || r.status === 207) {
    const counts = r.body && typeof r.body === 'object'
      ? `posts=${r.body.synced ?? r.body.count ?? '?'} errors=${(r.body.errors || []).length}`
      : '';
    return pass(id, `${took}s ${counts}`);
  }
  failStep(id, `status=${r.status} body=${JSON.stringify(r.body).slice(0, 300)}`);
  process.exit(2);
}

async function pickPost() {
  const id = step('Pick a synced post');
  const r = await http('GET', `${BASE}/api/resources?postType=resource`);
  if (r.status !== 200 || !Array.isArray(r.body) || r.body.length === 0) {
    // Fall back to any post type
    const r2 = await http('GET', `${BASE}/api/resources`);
    if (r2.status === 200 && Array.isArray(r2.body) && r2.body.length > 0) {
      const p = r2.body[0];
      pass(id, `id=${p.id} type=${p.post_type} "${p.title}"`);
      return p;
    }
    failStep(id, `no posts found after sync`);
    process.exit(2);
  }
  const p = r.body[0];
  pass(id, `id=${p.id} "${p.title}"`);
  return p;
}

async function editPostLocally(post, marker) {
  const id = step(`Edit post #${post.id} locally (append marker)`);
  const newTitle = `${post.title} ${marker}`;
  const r = await http('PATCH', `${BASE}/api/resources/${post.id}`, { title: newTitle });
  if (r.status !== 200) {
    failStep(id, `PATCH status=${r.status}`);
    process.exit(2);
  }
  // Verify is_dirty flipped (accept truthy 1 or true)
  const get = await http('GET', `${BASE}/api/resources/${post.id}`);
  if (!get.body.is_dirty || get.body.title !== newTitle) {
    failStep(id, `is_dirty=${get.body.is_dirty} title="${get.body.title}"`);
    process.exit(2);
  }
  pass(id, `is_dirty=1, local title updated`);
  return newTitle;
}

async function pushDirty() {
  const id = step('Push dirty posts (/api/push)');
  const r = await http('POST', `${BASE}/api/push`, {});
  if (r.status === 200 || r.status === 207) {
    const succ = (r.body.results || []).filter(x => x.success).length;
    const failC = (r.body.results || []).filter(x => !x.success).length;
    const conflicts = (r.body.conflicts || []).length;
    if (failC > 0) {
      failStep(id, `failed=${failC} body=${JSON.stringify(r.body).slice(0, 300)}`);
      return false;
    }
    const note = conflicts > 0 ? ` (${conflicts} conflict warning${conflicts === 1 ? '' : 's'} — pushed anyway)` : '';
    pass(id, `pushed=${succ}${note}`);
    return true;
  }
  failStep(id, `status=${r.status} body=${JSON.stringify(r.body).slice(0, 300)}`);
  return false;
}

async function verifyOnWp(postId, expectedTitle, label) {
  const id = step(`Verify on WP REST: ${label}`);
  const r = await fetch(`${WP_URL}/wp-json/wp/v2/resource/${postId}?context=edit&_fields=id,title,modified_gmt`, {
    headers: { Authorization: wpAuth },
  });
  if (!r.ok) {
    // Try generic post endpoint discovery via the type's rest_base
    failStep(id, `WP REST status=${r.status}`);
    return false;
  }
  const data = await r.json();
  const raw = data.title?.raw ?? data.title?.rendered ?? '';
  if (raw === expectedTitle) {
    pass(id, `WP title matches ("${raw}")`);
    return true;
  }
  failStep(id, `WP title="${raw}" expected="${expectedTitle}"`);
  return false;
}

async function main() {
  console.log(`E2E v1.0 readiness test — target: ${WP_URL}`);
  console.log(`Dev server base: ${BASE}\n`);

  await waitForServer();
  await checkConnection();
  await runSync();

  const post = await pickPost();
  const original = post.title;
  const marker = `[E2E-${Date.now()}]`;

  const newTitle = await editPostLocally(post, marker);

  if (!(await pushDirty())) process.exit(1);
  if (!(await verifyOnWp(post.id, newTitle, 'marker present'))) process.exit(1);

  // Revert
  step(`Revert post #${post.id} to original title`);
  const revert = await http('PATCH', `${BASE}/api/resources/${post.id}`, { title: original });
  if (revert.status !== 200) fail(`revert PATCH status=${revert.status}`);
  pass(`step-revert`, `local revert ok`);

  if (!(await pushDirty())) process.exit(1);
  if (!(await verifyOnWp(post.id, original, 'reverted to original'))) process.exit(1);

  const failed = results.filter(r => !r.ok);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Steps: ${results.length}  Passed: ${results.length - failed.length}  Failed: ${failed.length}`);
  if (failed.length === 0) {
    console.log('RESULT: PASS — v1.0 round trip verified end-to-end.');
    process.exit(0);
  } else {
    console.log('RESULT: FAIL');
    failed.forEach(f => console.log(`  - ${f.id}: ${f.detail}`));
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(2);
});
