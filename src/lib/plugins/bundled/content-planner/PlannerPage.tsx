'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { registerGlobalPage } from '@/components/globalPages';
import { cn } from '@/lib/utils';
import type { PageComponentProps } from '../../types';

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PLANNER — newsroom planning-desk aesthetic.
 *
 * Editorial typography (Newsreader serif + IBM Plex Sans + JetBrains Mono),
 * warm-paper/ink palette in light mode, deep brown-charcoal/cream in dark,
 * single oxblood/ember accent. Hairline rules instead of nested boxes,
 * numbered idea entries like a Table of Contents, status labels typeset in
 * uppercase tracking, research log presented as numbered footnotes.
 *
 * All state, effects, handlers, and API calls from rc.22 are preserved
 * verbatim — only the JSX presentation layer changes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

type IdeaStatus = 'idea' | 'researching' | 'drafting' | 'ready' | 'published';
type Frequency = 'annual' | 'seasonal' | 'quarterly' | 'once' | null;
type ResearchType =
  | 'seo'
  | 'structure'
  | 'audience'
  | 'competitor'
  | 'internal_linking'
  | 'monetization'
  | 'schema_markup'
  | 'serp_features'
  | 'publishing'
  | 'templates'
  | 'legal_compliance'
  | 'tech_notes';

const RESEARCH_TYPES: Array<{ id: ResearchType; label: string }> = [
  { id: 'seo', label: 'SEO' },
  { id: 'structure', label: 'Structure' },
  { id: 'audience', label: 'Audience' },
  { id: 'competitor', label: 'Competitor' },
  { id: 'internal_linking', label: 'Internal Linking' },
  { id: 'monetization', label: 'Monetization' },
  { id: 'schema_markup', label: 'Schema Markup' },
  { id: 'serp_features', label: 'SERP Features' },
  { id: 'publishing', label: 'Publishing' },
  { id: 'templates', label: 'Templates' },
  { id: 'legal_compliance', label: 'Legal & Compliance' },
  { id: 'tech_notes', label: 'Tech Notes' },
];

const FREQUENCY_OPTIONS: Array<{ id: Frequency; label: string }> = [
  { id: null, label: '—' },
  { id: 'annual', label: 'Annual' },
  { id: 'seasonal', label: 'Seasonal' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'once', label: 'Once' },
];

interface Term {
  id: number;
  taxonomy: string;
  name: string;
  slug: string;
  parent_id: number;
}

interface PendingTerm {
  id: number;
  taxonomy: string;
  name: string;
  slug: string | null;
  parent_id: number;
  status: 'pending' | 'created';
  wp_term_id: number | null;
}

interface Idea {
  id: number;
  title: string;
  status: IdeaStatus;
  description: string | null;
  notes: string | null;
  linked_keyword_ids: number[];
  promoted_post_id: number | null;
  deadline: string | null;
  frequency: Frequency;
  refresh_next_due: string | null;
  cluster: string | null;
  priority: number | null;
  estimated_effort_hours: number | null;
  schema_types: string[];
  monetization_angles: string[];
  serp_targets: string[];
  audience_personas: string[];
  resource_type_term_id: number | null;
  topic_term_ids: number[];
  audience_term_ids: number[];
  created_at: string;
  updated_at: string;
}

interface ResearchEntry {
  id: number;
  idea_id: number;
  type: ResearchType;
  content: string;
  source_url: string | null;
  created_at: string;
  updated_at: string;
}

interface Keyword {
  id: number;
  term: string;
  volume: number | null;
  target_post_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_COLUMNS: Array<{ id: IdeaStatus; label: string }> = [
  { id: 'idea', label: 'Idea' },
  { id: 'researching', label: 'Researching' },
  { id: 'drafting', label: 'Drafting' },
  { id: 'ready', label: 'Ready' },
  { id: 'published', label: 'Published' },
];

// ─── Design tokens (injected once, scoped to .planner-root) ──────────────────

const PLANNER_STYLE = `
.planner-root {
  /* Mapped to the rest of the Juggernaut palette: Tailwind gray + brand blue. */
  --paper: #f9fafb;        /* gray-50, page bg */
  --paper-2: #ffffff;      /* white, elevated surfaces (drawer, cards) */
  --paper-3: #f3f4f6;      /* gray-100, hover */
  --ink: #111827;          /* gray-900, body text */
  --ink-2: #4b5563;        /* gray-600, secondary text */
  --ink-3: #9ca3af;        /* gray-400, tertiary / placeholder */
  --rule: #e5e7eb;         /* gray-200, hairline */
  --rule-2: #d1d5db;       /* gray-300, stronger hairline */
  --accent: #2563eb;       /* brand-600 */
  --accent-2: #1d4ed8;     /* brand-700 */
  --warn: #d97706;         /* amber-600 */
  --good: #16a34a;         /* green-600 */
  --urgent: #dc2626;       /* red-600 — used for overdue/urgent deadlines */
  --violet: #7c3aed;       /* violet-600 — research-type tone */
  --teal: #0d9488;         /* teal-600 — research-type tone */
  --pink: #db2777;         /* pink-600 — research-type tone */
  --font-display: 'Newsreader', 'Iowan Old Style', Georgia, 'Times New Roman', serif;
  --font-ui: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
  --font-mono: 'JetBrains Mono', 'IBM Plex Mono', 'SF Mono', Menlo, Consolas, monospace;
  font-family: var(--font-ui);
  color: var(--ink);
  background-color: var(--paper);
}
.dark .planner-root {
  --paper: #111827;        /* gray-900, body bg */
  --paper-2: #1f2937;      /* gray-800, surfaces — matches the app header */
  --paper-3: #374151;      /* gray-700, hover */
  --ink: #f3f4f6;          /* gray-100 */
  --ink-2: #d1d5db;        /* gray-300 */
  --ink-3: #6b7280;        /* gray-500 */
  --rule: #374151;         /* gray-700 */
  --rule-2: #4b5563;       /* gray-600 */
  --accent: #60a5fa;       /* brand-400, brighter for dark mode */
  --accent-2: #93c5fd;     /* brand-300 */
  --warn: #fbbf24;         /* amber-400 */
  --good: #4ade80;         /* green-400 */
  --urgent: #f87171;       /* red-400 */
  --violet: #a78bfa;       /* violet-400 */
  --teal: #2dd4bf;         /* teal-400 */
  --pink: #f472b6;         /* pink-400 */
}
.planner-root .display { font-family: var(--font-display); font-feature-settings: 'ss01' on, 'cv11' on; }
.planner-root .mono { font-family: var(--font-mono); }
.planner-root .label-eyebrow {
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-3);
}
.planner-root .hairline { background: var(--rule); }
.planner-root .ink-input {
  background: transparent;
  color: var(--ink);
  border: none;
  border-bottom: 1px solid var(--rule);
  padding: 6px 0;
  width: 100%;
  font-family: var(--font-ui);
  outline: none;
  transition: border-color 140ms ease;
}
.planner-root .ink-input:focus { border-bottom-color: var(--accent); }
.planner-root .ink-input::placeholder { color: var(--ink-3); font-style: italic; }
.planner-root .ink-select {
  background: transparent;
  color: var(--ink);
  border: none;
  border-bottom: 1px solid var(--rule);
  padding: 6px 18px 6px 0;
  width: 100%;
  font-family: var(--font-ui);
  font-size: 13px;
  outline: none;
  appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, var(--ink-3) 50%), linear-gradient(135deg, var(--ink-3) 50%, transparent 50%);
  background-position: calc(100% - 8px) 50%, calc(100% - 4px) 50%;
  background-size: 4px 4px, 4px 4px;
  background-repeat: no-repeat;
  transition: border-color 140ms ease;
}
.planner-root .ink-select:focus { border-bottom-color: var(--accent); }
.planner-root .ink-textarea {
  background: transparent;
  color: var(--ink);
  border: 1px solid var(--rule);
  padding: 10px 12px;
  width: 100%;
  font-family: var(--font-display);
  font-size: 15px;
  line-height: 1.5;
  outline: none;
  resize: vertical;
  transition: border-color 140ms ease;
}
.planner-root .ink-textarea:focus { border-color: var(--accent); }
.planner-root .ink-textarea::placeholder { color: var(--ink-3); font-style: italic; }

.planner-root .pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border: 1px solid var(--rule-2);
  background: var(--paper);
  color: var(--ink-2);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.04em;
  line-height: 1;
}
.planner-root .pill.is-active {
  border-color: var(--ink);
  background: var(--ink);
  color: var(--paper);
}
.planner-root .pill.is-accent {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--paper);
}
.planner-root .pill.is-pending {
  border-color: var(--warn);
  background: transparent;
  color: var(--warn);
}
.planner-root .chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px 3px 9px;
  border: 1px solid var(--rule-2);
  background: var(--paper-2);
  color: var(--ink);
  font-size: 12px;
  line-height: 1.2;
}
.planner-root .chip.is-pending {
  border-color: var(--warn);
  color: var(--warn);
}
.planner-root .ordinal {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  color: var(--ink-3);
  width: 22px;
  text-align: right;
  flex-shrink: 0;
  letter-spacing: 0;
}
.planner-root .ordinal.is-strong { color: var(--ink); }
.planner-root .btn-primary {
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 8px 14px;
  background: var(--ink);
  color: var(--paper);
  border: 1px solid var(--ink);
  cursor: pointer;
  transition: all 140ms ease;
}
.planner-root .btn-primary:hover { background: var(--accent); border-color: var(--accent); }
.planner-root .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
.planner-root .btn-ghost {
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.08em;
  padding: 6px 10px;
  background: transparent;
  color: var(--ink-2);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 120ms ease;
}
.planner-root .btn-ghost:hover { color: var(--accent); }
.planner-root .col-rule + .col-rule { border-left: 1px solid var(--rule); }
.planner-root .focus-row:hover { background: var(--paper-2); }
.planner-root .focus-row { transition: background 90ms ease; }

@keyframes planner-fade-up {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.planner-root .fade-in { animation: planner-fade-up 320ms cubic-bezier(0.22, 0.61, 0.36, 1) both; }
.planner-root .stagger-1 { animation-delay: 40ms; }
.planner-root .stagger-2 { animation-delay: 100ms; }
.planner-root .stagger-3 { animation-delay: 160ms; }
.planner-root .stagger-4 { animation-delay: 220ms; }
.planner-root .stagger-5 { animation-delay: 280ms; }

@keyframes planner-modal-in {
  from { opacity: 0; transform: translateY(12px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.planner-root .modal-in { animation: planner-modal-in 220ms cubic-bezier(0.22, 0.61, 0.36, 1) both; }
@keyframes planner-overlay-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.planner-root .overlay-in { animation: planner-overlay-in 200ms ease both; }

.planner-root .footnote-marker {
  font-family: var(--font-display);
  font-style: italic;
  font-size: 13px;
  color: var(--accent);
  margin-right: 6px;
}

.planner-root details > summary { list-style: none; cursor: pointer; }
.planner-root details > summary::-webkit-details-marker { display: none; }
`;

function PlannerStyle() {
  return <style dangerouslySetInnerHTML={{ __html: PLANNER_STYLE }} />;
}

function useFontInjection() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.getElementById('planner-fonts')) return;
    const link = document.createElement('link');
    link.id = 'planner-fonts';
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap';
    document.head.appendChild(link);
  }, []);
}

// ─── Top-level page shell ────────────────────────────────────────────────────

type Tab = 'ideas' | 'keywords';

export function PlannerPage(_props: PageComponentProps) {
  useFontInjection();
  const [tab, setTab] = useState<Tab>('ideas');
  const [totals, setTotals] = useState<{ ideas: Idea[]; keywords: Keyword[] }>({ ideas: [], keywords: [] });

  // Top-level counts feed the masthead strip; data is also fetched inside each
  // tab component, but pulling here keeps the strip live without prop-drilling.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [iRes, kRes] = await Promise.all([
          fetch('/api/planner/ideas').then((r) => r.json()),
          fetch('/api/planner/keywords').then((r) => r.json()),
        ]);
        if (cancelled) return;
        setTotals({ ideas: iRes.ideas || [], keywords: kRes.keywords || [] });
      } catch { /* surfaced in the per-tab components */ }
    };
    load();
    const id = window.setInterval(load, 15000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  // useCallback so the IdeasBoard's `refresh` useCallback (which depends on
  // onChange) keeps a stable identity. Without this, every polling tick of
  // the masthead recreated the lambda, regenerated `refresh`, fired the
  // IdeasBoard's useEffect([refresh]), and refetched the ideas list — which
  // handed the drawer a fresh `idea` reference mid-keystroke and clobbered
  // every controlled input.
  const handleIdeasChange = useCallback((ideas: Idea[]) => {
    setTotals((t) => ({ ...t, ideas }));
  }, []);

  return (
    <div className="planner-root" style={{ minHeight: 'calc(100vh - 48px)', width: '100%', overflowX: 'clip' }}>
      <PlannerStyle />
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '40px 48px' }}>
        <Masthead totals={totals} />
        <TabBar tab={tab} setTab={setTab} totals={totals} />
        {tab === 'ideas' ? <IdeasBoard onChange={handleIdeasChange} /> : <KeywordsTable />}
      </div>
    </div>
  );
}

function Masthead({ totals }: { totals: { ideas: Idea[]; keywords: Keyword[] } }) {
  const byStatus = useMemo(() => {
    const out: Record<IdeaStatus, number> = { idea: 0, researching: 0, drafting: 0, ready: 0, published: 0 };
    for (const i of totals.ideas) out[i.status] = (out[i.status] || 0) + 1;
    return out;
  }, [totals.ideas]);
  const pendingTerms = useMemo(
    () => totals.ideas.filter((i) =>
      (i.resource_type_term_id !== null && i.resource_type_term_id < 0) ||
      i.topic_term_ids.some((n) => n < 0) ||
      i.audience_term_ids.some((n) => n < 0),
    ).length,
    [totals.ideas],
  );
  const dueSoon = useMemo(() => {
    const now = Date.now();
    return totals.ideas.filter((i) => {
      if (!i.deadline) return false;
      const d = new Date(i.deadline).getTime();
      if (Number.isNaN(d)) return false;
      const days = (d - now) / (1000 * 60 * 60 * 24);
      return days >= 0 && days <= 14;
    }).length;
  }, [totals.ideas]);

  return (
    <header className="fade-in">
      <div className="flex items-end justify-between gap-6 pb-3">
        <div>
          <div className="label-eyebrow mb-2">Content Planner · vol. xxii</div>
          <h1 className="display text-[56px] leading-none tracking-[-0.02em] font-medium" style={{ color: 'var(--ink)' }}>
            The Planner
          </h1>
          <p className="display italic text-[15px] mt-3 max-w-xl" style={{ color: 'var(--ink-2)' }}>
            A standing desk for the work before the post — ideas, the research that makes them best-in-class, and the keywords they answer to.
          </p>
        </div>
        <div className="text-right">
          <div className="label-eyebrow">Edition</div>
          <div className="mono text-sm mt-1" style={{ color: 'var(--ink-2)' }}>
            {new Date().toISOString().slice(0, 10)}
          </div>
        </div>
      </div>
      <div
        className="py-4 my-1"
        style={{
          borderTop: '1px solid var(--rule-2)',
          borderBottom: '1px solid var(--rule-2)',
          display: 'grid',
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          gap: 24,
        }}
      >
        <Stat label="Total" value={totals.ideas.length} accent />
        {STATUS_COLUMNS.map((c) => (
          <Stat key={c.id} label={c.label} value={byStatus[c.id]} />
        ))}
        <Stat label="Pending refs" value={pendingTerms} warn={pendingTerms > 0} />
      </div>
      <div
        className="py-3"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          gap: 24,
        }}
      >
        <Stat label="Keywords" value={totals.keywords.length} />
        <Stat label="Gaps" value={totals.keywords.filter((k) => !k.target_post_id).length} warn />
        <Stat label="Due ≤14d" value={dueSoon} warn={dueSoon > 0} />
        <div style={{ gridColumn: 'span 4', alignSelf: 'end' }}>
          <div className="label-eyebrow" style={{ color: 'var(--ink-3)', textAlign: 'right' }}>
            ⁂ &nbsp;Plan thoroughly, ship the one piece on the internet that should exist&nbsp; ⁂
          </div>
        </div>
      </div>
    </header>
  );
}

function Stat({ label, value, accent, warn }: { label: string; value: number; accent?: boolean; warn?: boolean }) {
  return (
    <div>
      <div className="label-eyebrow">{label}</div>
      <div
        className={cn('mono text-2xl mt-1 font-medium')}
        style={{
          color: warn && value > 0 ? 'var(--warn)' : accent ? 'var(--accent)' : 'var(--ink)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function TabBar({ tab, setTab, totals }: { tab: Tab; setTab: (t: Tab) => void; totals: { ideas: Idea[]; keywords: Keyword[] } }) {
  return (
    <nav className="flex items-end gap-8 mt-6 border-b" style={{ borderColor: 'var(--rule-2)' }}>
      {(['ideas', 'keywords'] as Tab[]).map((t) => {
        const isActive = t === tab;
        const count = t === 'ideas' ? totals.ideas.length : totals.keywords.length;
        return (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="relative pb-3 -mb-px flex items-baseline gap-2 transition-colors"
            style={{ color: isActive ? 'var(--ink)' : 'var(--ink-3)' }}
          >
            <span className="display text-2xl font-medium tracking-tight">{t.charAt(0).toUpperCase() + t.slice(1)}</span>
            <span className="mono text-xs" style={{ color: isActive ? 'var(--accent)' : 'var(--ink-3)' }}>
              {count}
            </span>
            {isActive && (
              <span
                className="absolute left-0 right-0 -bottom-px h-[2px]"
                style={{ background: 'var(--accent)' }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}

// ─── Ideas board ─────────────────────────────────────────────────────────────

function IdeasBoard({ onChange }: { onChange?: (ideas: Idea[]) => void }) {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openIdeaId, setOpenIdeaId] = useState<number | null>(null);
  const [clusterFilter, setClusterFilter] = useState<string>('');

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/planner/ideas');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setIdeas(data.ideas);
      onChange?.(data.ideas);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ideas');
    } finally {
      setLoading(false);
    }
  }, [onChange]);

  useEffect(() => { refresh(); }, [refresh]);

  const addIdea = async (title: string, status: IdeaStatus) => {
    const res = await fetch('/api/planner/ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, status }),
    });
    if (res.ok) await refresh();
  };

  const patchIdea = async (id: number, patch: Partial<Idea>) => {
    const res = await fetch(`/api/planner/ideas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) await refresh();
  };

  const removeIdea = async (id: number) => {
    if (!confirm('Delete this idea and all its research entries?')) return;
    setIdeas((prev) => prev.filter((i) => i.id !== id));
    if (openIdeaId === id) setOpenIdeaId(null);
    const res = await fetch(`/api/planner/ideas/${id}`, { method: 'DELETE' });
    if (!res.ok) await refresh();
  };

  const clusters = useMemo(() => {
    const set = new Set<string>();
    ideas.forEach((i) => { if (i.cluster) set.add(i.cluster); });
    return Array.from(set).sort();
  }, [ideas]);

  const filteredIdeas = useMemo(() => {
    if (!clusterFilter) return ideas;
    return ideas.filter((i) => i.cluster === clusterFilter);
  }, [ideas, clusterFilter]);

  const openIdea = openIdeaId !== null ? ideas.find((i) => i.id === openIdeaId) || null : null;

  if (loading) return <div className="display italic text-sm mt-6" style={{ color: 'var(--ink-3)' }}>Loading the desk…</div>;
  if (error) return <div className="mt-6 text-sm" style={{ color: 'var(--accent)' }}>Error: {error}</div>;

  return (
    <>
      {clusters.length > 0 && (
        <div className="mt-5 flex items-center gap-2 fade-in">
          <span className="label-eyebrow">Filed under</span>
          <button
            onClick={() => setClusterFilter('')}
            className={cn('pill', clusterFilter === '' && 'is-active')}
          >
            All
          </button>
          {clusters.map((c) => (
            <button
              key={c}
              onClick={() => setClusterFilter(c)}
              className={cn('pill', clusterFilter === c && 'is-active')}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div
        className="mt-6"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
          gap: 0,
        }}
      >
        {STATUS_COLUMNS.map((col, idx) => {
          const items = filteredIdeas.filter((i) => i.status === col.id);
          return (
            <div
              key={col.id}
              className={cn('col-rule flex flex-col fade-in', `stagger-${idx + 1}`)}
              style={{ padding: '0 16px 8px', minWidth: 0 }}
            >
              <div className="flex items-baseline justify-between pb-2 mb-1 border-b" style={{ borderColor: 'var(--rule)' }}>
                <h3 className="display text-base font-medium tracking-tight" style={{ color: 'var(--ink)' }}>
                  {col.label}
                </h3>
                <span className="mono text-[11px]" style={{ color: 'var(--ink-3)' }}>{String(items.length).padStart(2, '0')}</span>
              </div>

              <ul className="flex-1 min-h-[60px]">
                {items.length === 0 && (
                  <li className="display italic text-[13px] py-3" style={{ color: 'var(--ink-3)' }}>
                    nothing here yet
                  </li>
                )}
                {items.map((idea, i) => (
                  <IdeaListItem
                    key={idea.id}
                    idea={idea}
                    index={i + 1}
                    onOpen={() => setOpenIdeaId(idea.id)}
                    onDelete={() => removeIdea(idea.id)}
                  />
                ))}
              </ul>

              <AddIdeaForm status={col.id} onAdd={addIdea} />
            </div>
          );
        })}
      </div>

      {openIdea && (
        <IdeaDrawer
          idea={openIdea}
          onClose={() => setOpenIdeaId(null)}
          onSave={patchIdea}
          onDelete={removeIdea}
        />
      )}
    </>
  );
}

function deadlineBadge(deadline: string | null): { label: string; cls: string } | null {
  if (!deadline) return null;
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const days = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const label = days < 0 ? `${-days}d ago` : days === 0 ? 'today' : `${days}d`;
  if (days < 0 || days <= 14) return { label, cls: 'urgent' };
  if (days <= 30) return { label, cls: 'soon' };
  return { label, cls: 'later' };
}

function hasPendingTermRefs(idea: Idea): boolean {
  if (idea.resource_type_term_id !== null && idea.resource_type_term_id < 0) return true;
  if (idea.topic_term_ids.some((n) => n < 0)) return true;
  if (idea.audience_term_ids.some((n) => n < 0)) return true;
  return false;
}

function IdeaListItem({ idea, index, onOpen, onDelete }: { idea: Idea; index: number; onOpen: () => void; onDelete: () => void }) {
  const badge = deadlineBadge(idea.deadline);
  const hasPending = hasPendingTermRefs(idea);
  const badgeColor =
    badge?.cls === 'urgent' ? 'var(--urgent)'
    : badge?.cls === 'soon' ? 'var(--warn)'
    : 'var(--ink-3)';
  return (
    <li
      onClick={onOpen}
      className="focus-row group flex items-baseline gap-2 py-1.5 cursor-pointer"
    >
      <span className="ordinal">{String(index).padStart(2, '0')}</span>
      <span
        className="display flex-1 truncate text-[14px] leading-snug"
        style={{ color: 'var(--ink)' }}
      >
        {idea.title}
      </span>
      <div className="flex items-center gap-2 flex-shrink-0 text-[10px]">
        {idea.priority !== null && idea.priority >= 8 && (
          <span className="mono" style={{ color: 'var(--urgent)' }}>P{idea.priority}</span>
        )}
        {hasPending && (
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: 'var(--warn)' }}
            title="References terms not on WordPress yet"
          />
        )}
        {badge && (
          <span className="mono" style={{ color: badgeColor }}>{badge.label}</span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: 'var(--ink-3)' }}
          aria-label="Delete idea"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </li>
  );
}

function AddIdeaForm({ status, onAdd }: { status: IdeaStatus; onAdd: (title: string, status: IdeaStatus) => void }) {
  const [title, setTitle] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd(trimmed, status);
    setTitle('');
  };
  return (
    <form onSubmit={submit} className="mt-2 pt-2 border-t" style={{ borderColor: 'var(--rule)' }}>
      <div className="flex items-baseline gap-2">
        <span
          className="display italic text-sm"
          style={{ color: title.trim() ? 'var(--accent)' : 'var(--ink-3)' }}
        >
          +
        </span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="add idea"
          className="ink-input display text-[13px] italic"
          style={{ borderBottom: 'none', padding: '2px 0' }}
        />
      </div>
    </form>
  );
}

// ─── Idea drawer ─────────────────────────────────────────────────────────────

function IdeaDrawer({
  idea,
  onClose,
  onSave,
  onDelete,
}: {
  idea: Idea;
  onClose: () => void;
  onSave: (id: number, patch: Partial<Idea>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [title, setTitle] = useState(idea.title);
  const [status, setStatus] = useState<IdeaStatus>(idea.status);
  const [description, setDescription] = useState(idea.description ?? '');
  const [notes, setNotes] = useState(idea.notes ?? '');
  const [deadline, setDeadline] = useState(idea.deadline ?? '');
  const [cluster, setCluster] = useState(idea.cluster ?? '');
  const [priority, setPriority] = useState<string>(idea.priority?.toString() ?? '');
  const [effort, setEffort] = useState<string>(idea.estimated_effort_hours?.toString() ?? '');
  const [frequency, setFrequency] = useState<Frequency>(idea.frequency);
  const [refreshNextDue, setRefreshNextDue] = useState(idea.refresh_next_due ?? '');
  const [schemaTypes, setSchemaTypes] = useState<string[]>(idea.schema_types);
  const [monetization, setMonetization] = useState<string[]>(idea.monetization_angles);
  const [serpTargets, setSerpTargets] = useState<string[]>(idea.serp_targets);
  const [resourceTypeId, setResourceTypeId] = useState<number | null>(idea.resource_type_term_id);
  const [topicIds, setTopicIds] = useState<number[]>(idea.topic_term_ids);
  const [audienceIds, setAudienceIds] = useState<number[]>(idea.audience_term_ids);

  const [termsByTax, setTermsByTax] = useState<Record<string, Term[]>>({});
  const [plannerTermsByTax, setPlannerTermsByTax] = useState<Record<string, PendingTerm[]>>({});

  const [entries, setEntries] = useState<ResearchEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [entryType, setEntryType] = useState<ResearchType>('seo');
  const [entryContent, setEntryContent] = useState('');
  const [entrySource, setEntrySource] = useState('');
  const [isPromoting, setIsPromoting] = useState(false);

  // Only reseed local state when the drawer SWITCHES to a different idea.
  // Keying on `[idea]` (the full object) was clobbering every keystroke
  // because the parent hands back a new object reference after each refetch
  // even when the underlying record hasn't changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setTitle(idea.title);
    setStatus(idea.status);
    setDescription(idea.description ?? '');
    setNotes(idea.notes ?? '');
    setDeadline(idea.deadline ?? '');
    setCluster(idea.cluster ?? '');
    setPriority(idea.priority?.toString() ?? '');
    setEffort(idea.estimated_effort_hours?.toString() ?? '');
    setFrequency(idea.frequency);
    setRefreshNextDue(idea.refresh_next_due ?? '');
    setSchemaTypes(idea.schema_types);
    setMonetization(idea.monetization_angles);
    setSerpTargets(idea.serp_targets);
    setResourceTypeId(idea.resource_type_term_id);
    setTopicIds(idea.topic_term_ids);
    setAudienceIds(idea.audience_term_ids);
  }, [idea.id]);

  const refreshPlannerTerms = useCallback(async () => {
    try {
      const r = await fetch('/api/planner/terms');
      const d = await r.json();
      if (d && typeof d.terms === 'object') setPlannerTermsByTax(d.terms);
    } catch (err) {
      console.warn('[planner] planner-terms load failed:', err);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/terms').then((r) => r.json()).catch(() => ({})),
      fetch('/api/planner/terms').then((r) => r.json()).catch(() => ({ terms: {} })),
    ]).then(([synced, planner]) => {
      if (cancelled) return;
      if (synced && typeof synced === 'object') setTermsByTax(synced);
      if (planner && typeof planner.terms === 'object') setPlannerTermsByTax(planner.terms);
    });
    return () => { cancelled = true; };
  }, []);

  const addPendingTerm = useCallback(async (taxonomy: string, name: string): Promise<PendingTerm | null> => {
    const res = await fetch('/api/planner/terms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taxonomy, name }),
    });
    if (res.status === 409) {
      const existing = (plannerTermsByTax[taxonomy] || []).find((t) => t.name === name.trim());
      if (existing) return existing;
      alert(`A pending "${name}" already exists for ${taxonomy}.`);
      return null;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(`Failed to add term: ${body.error || res.status}`);
      return null;
    }
    const data = await res.json();
    await refreshPlannerTerms();
    return data.term as PendingTerm;
  }, [plannerTermsByTax, refreshPlannerTerms]);

  useEffect(() => {
    let cancelled = false;
    setEntriesLoading(true);
    fetch(`/api/planner/ideas/${idea.id}/research`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setEntries(d.entries || []); })
      .catch((err) => console.warn('[planner] research load failed:', err))
      .finally(() => { if (!cancelled) setEntriesLoading(false); });
    return () => { cancelled = true; };
  }, [idea.id]);

  const commit = async (patch: Partial<Idea>) => {
    await onSave(idea.id, patch);
  };

  const addResearchEntry = async () => {
    const content = entryContent.trim();
    if (!content) return;
    const res = await fetch(`/api/planner/ideas/${idea.id}/research`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: entryType,
        content,
        source_url: entrySource.trim() || undefined,
      }),
    });
    if (!res.ok) { alert('Failed to add research entry'); return; }
    const data = await res.json();
    setEntries((prev) => [...prev, data.entry]);
    setEntryContent('');
    setEntrySource('');
    if (idea.status === 'idea' && status === 'idea') {
      setStatus('researching');
      await commit({ status: 'researching' });
    }
  };

  const removeResearchEntry = async (entryId: number) => {
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
    const res = await fetch(`/api/planner/research/${entryId}`, { method: 'DELETE' });
    if (!res.ok) {
      const r = await fetch(`/api/planner/ideas/${idea.id}/research`);
      const d = await r.json();
      setEntries(d.entries || []);
    }
  };

  const promote = async () => {
    if (idea.promoted_post_id !== null || isPromoting) return;
    setIsPromoting(true);
    try {
      // Flush any in-progress edits first so the resource stub picks them up.
      const patch: Partial<Idea> = {};
      if (title.trim() && title !== idea.title) patch.title = title.trim();
      if (status !== idea.status) patch.status = status;
      if (description !== (idea.description ?? '')) patch.description = description;
      if (notes !== (idea.notes ?? '')) patch.notes = notes;
      if (Object.keys(patch).length > 0) await commit(patch);

      const res = await fetch(`/api/planner/ideas/${idea.id}/promote`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(`Promote failed: ${body.error || `HTTP ${res.status}`}`);
        return;
      }
      const data = await res.json();
      let msg = `Promoted to a local resource stub (post #${Math.abs(data.local_post_id)}, draft).`;
      if (data.pending_terms_count > 0) {
        msg += `\n\n${data.pending_terms_count} pending taxonomy term${data.pending_terms_count > 1 ? 's were' : ' was'} skipped because they don't exist on WordPress yet. Push them through the WP admin first, then re-sync, then attach to the post.`;
      }
      msg += `\n\nFind the draft in the Posts view and click Push to send it to WordPress.`;
      alert(msg);
      onClose();
    } finally {
      setIsPromoting(false);
    }
  };

  const close = async () => {
    const patch: Partial<Idea> = {};
    if (title.trim() && title !== idea.title) patch.title = title.trim();
    if (status !== idea.status) patch.status = status;
    if (description !== (idea.description ?? '')) patch.description = description;
    if (notes !== (idea.notes ?? '')) patch.notes = notes;
    if (deadline !== (idea.deadline ?? '')) patch.deadline = deadline || null;
    if (cluster !== (idea.cluster ?? '')) patch.cluster = cluster || null;
    if (priority !== (idea.priority?.toString() ?? '')) {
      const n = parseInt(priority, 10);
      patch.priority = Number.isFinite(n) ? n : null;
    }
    if (effort !== (idea.estimated_effort_hours?.toString() ?? '')) {
      const n = parseFloat(effort);
      patch.estimated_effort_hours = Number.isFinite(n) ? n : null;
    }
    if (frequency !== idea.frequency) patch.frequency = frequency;
    if (refreshNextDue !== (idea.refresh_next_due ?? '')) patch.refresh_next_due = refreshNextDue || null;
    if (JSON.stringify(schemaTypes) !== JSON.stringify(idea.schema_types)) patch.schema_types = schemaTypes;
    if (JSON.stringify(monetization) !== JSON.stringify(idea.monetization_angles)) patch.monetization_angles = monetization;
    if (JSON.stringify(serpTargets) !== JSON.stringify(idea.serp_targets)) patch.serp_targets = serpTargets;
    if (resourceTypeId !== idea.resource_type_term_id) patch.resource_type_term_id = resourceTypeId;
    if (JSON.stringify(topicIds) !== JSON.stringify(idea.topic_term_ids)) patch.topic_term_ids = topicIds;
    if (JSON.stringify(audienceIds) !== JSON.stringify(idea.audience_term_ids)) patch.audience_term_ids = audienceIds;
    if (Object.keys(patch).length > 0) await commit(patch);
    onClose();
  };

  const readiness = {
    hasDescription: description.trim().length > 30,
    hasResearchEntries: entries.length >= 3,
    hasSchemaTypes: schemaTypes.length > 0,
    hasDeadline: deadline.length > 0,
    hasCluster: cluster.trim().length > 0,
  };
  const readinessCount = Object.values(readiness).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto planner-root">
      <PlannerStyle />
      <div
        className="overlay-in fixed inset-0"
        style={{ background: 'rgba(17, 24, 39, 0.5)', backdropFilter: 'blur(2px)' }}
        onClick={close}
      />
      <div className="relative min-h-full flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          className="modal-in relative flex flex-col overflow-hidden shadow-2xl rounded-xl"
          style={{
            background: 'var(--paper-2)',
            border: '1px solid var(--rule)',
            width: 'min(960px, 95vw)',
            height: 'min(85vh, 900px)',
          }}
        >
        {/* Header */}
        <div className="px-8 pt-6 pb-4 flex items-start justify-between" style={{ borderBottom: '1px solid var(--rule)' }}>
          <div>
            <div className="label-eyebrow">An entry from the desk</div>
            <h2 className="display text-3xl font-medium tracking-tight mt-1" style={{ color: 'var(--ink)' }}>
              Idea — №{String(idea.id).padStart(3, '0')}
            </h2>
          </div>
          <button
            onClick={close}
            className="btn-ghost"
            aria-label="Close drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-7">
          {/* Title */}
          <Section title="Headline">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => { if (title.trim() && title !== idea.title) commit({ title: title.trim() }); }}
              className="display text-2xl font-medium tracking-tight w-full bg-transparent outline-none border-b py-2"
              style={{ color: 'var(--ink)', borderColor: 'var(--rule)' }}
            />
          </Section>

          {/* Standing row */}
          <Section title="Standing">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                columnGap: 24,
                rowGap: 16,
              }}
            >
              <Field label="Status">
                <select
                  value={status}
                  onChange={(e) => {
                    const next = e.target.value as IdeaStatus;
                    setStatus(next);
                    commit({ status: next });
                  }}
                  className="ink-select display text-base"
                >
                  {STATUS_COLUMNS.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Cluster">
                <input
                  type="text"
                  value={cluster}
                  onChange={(e) => setCluster(e.target.value)}
                  onBlur={() => { if (cluster !== (idea.cluster ?? '')) commit({ cluster: cluster || null }); }}
                  placeholder="office-pools"
                  className="ink-input display text-base"
                />
              </Field>
              <Field label="Priority (1—10)">
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  onBlur={() => {
                    const n = parseInt(priority, 10);
                    const next = Number.isFinite(n) ? n : null;
                    if (next !== idea.priority) commit({ priority: next });
                  }}
                  className="ink-input mono text-base"
                />
              </Field>
              <Field label="Deadline">
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  onBlur={() => { if (deadline !== (idea.deadline ?? '')) commit({ deadline: deadline || null }); }}
                  className="ink-input mono text-sm"
                />
              </Field>
              <Field label="Frequency">
                <select
                  value={frequency ?? ''}
                  onChange={(e) => {
                    const v = (e.target.value || null) as Frequency;
                    setFrequency(v);
                    commit({ frequency: v } as Partial<Idea>);
                  }}
                  className="ink-select display text-base"
                >
                  {FREQUENCY_OPTIONS.map((c) => (
                    <option key={c.id ?? 'none'} value={c.id ?? ''}>{c.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Effort (h)">
                <input
                  type="number"
                  step={0.5}
                  min={0}
                  value={effort}
                  onChange={(e) => setEffort(e.target.value)}
                  onBlur={() => {
                    const n = parseFloat(effort);
                    const next = Number.isFinite(n) ? n : null;
                    if (next !== idea.estimated_effort_hours) commit({ estimated_effort_hours: next });
                  }}
                  className="ink-input mono text-base"
                />
              </Field>
              {frequency && (
                <Field label="Next refresh">
                  <input
                    type="date"
                    value={refreshNextDue}
                    onChange={(e) => setRefreshNextDue(e.target.value)}
                    onBlur={() => { if (refreshNextDue !== (idea.refresh_next_due ?? '')) commit({ refresh_next_due: refreshNextDue || null }); }}
                    className="ink-input mono text-sm"
                  />
                </Field>
              )}
            </div>
          </Section>

          {/* Description */}
          <Section title="Lede">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => { if (description !== (idea.description ?? '')) commit({ description }); }}
              placeholder="What is this template? Why is it worth building best-in-class?"
              rows={4}
              className="ink-textarea"
            />
          </Section>

          {/* Classification */}
          <Section title="Classification — PLEXKITS taxonomies">
            <div className="space-y-5">
              <TaxonomySingleField
                label="Resource type"
                taxonomy="resource-type"
                termsByTax={termsByTax}
                pendingByTax={plannerTermsByTax}
                value={resourceTypeId}
                onChange={(next) => { setResourceTypeId(next); commit({ resource_type_term_id: next }); }}
                onAddNew={addPendingTerm}
              />
              <TaxonomyMultiField
                label="Tags — topic"
                taxonomy="topic"
                termsByTax={termsByTax}
                pendingByTax={plannerTermsByTax}
                values={topicIds}
                onChange={(next) => { setTopicIds(next); commit({ topic_term_ids: next }); }}
                onAddNew={addPendingTerm}
              />
              <TaxonomyMultiField
                label="Audience"
                taxonomy="audience"
                termsByTax={termsByTax}
                pendingByTax={plannerTermsByTax}
                values={audienceIds}
                onChange={(next) => { setAudienceIds(next); commit({ audience_term_ids: next }); }}
                onAddNew={addPendingTerm}
              />
            </div>
          </Section>

          {/* SEO angles */}
          <Section title="SEO & monetization angles">
            <div className="space-y-4">
              <TagChipField
                label="Schema markup types"
                placeholder="HowTo, FAQPage, Dataset…"
                values={schemaTypes}
                onChange={(next) => { setSchemaTypes(next); commit({ schema_types: next }); }}
              />
              <TagChipField
                label="Monetization angles"
                placeholder="ads, affiliate, email_capture…"
                values={monetization}
                onChange={(next) => { setMonetization(next); commit({ monetization_angles: next }); }}
              />
              <TagChipField
                label="SERP feature targets"
                placeholder="featured_snippet, paa, image_pack…"
                values={serpTargets}
                onChange={(next) => { setSerpTargets(next); commit({ serp_targets: next }); }}
              />
            </div>
          </Section>

          {/* Research log */}
          <Section
            title="Research log"
            rightSlot={<span className="mono text-[11px]" style={{ color: 'var(--ink-3) ' }}>{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span>}
          >
            {entriesLoading ? (
              <div className="display italic text-sm py-2" style={{ color: 'var(--ink-3)' }}>setting type…</div>
            ) : (
              <ResearchTimeline entries={entries} onDelete={removeResearchEntry} />
            )}
            <div className="mt-4 p-3 border" style={{ borderColor: 'var(--rule-2)', background: 'var(--paper-2)' }}>
              <div className="flex items-center gap-2 mb-2">
                <select
                  value={entryType}
                  onChange={(e) => setEntryType(e.target.value as ResearchType)}
                  className="ink-select text-xs"
                  style={{ width: 'auto', minWidth: 140 }}
                >
                  {RESEARCH_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={entrySource}
                  onChange={(e) => setEntrySource(e.target.value)}
                  placeholder="source URL (optional)"
                  className="ink-input text-xs"
                  style={{ flex: 1 }}
                />
              </div>
              <textarea
                value={entryContent}
                onChange={(e) => setEntryContent(e.target.value)}
                placeholder={`Concrete finding for ${RESEARCH_TYPES.find((t) => t.id === entryType)?.label || entryType}…`}
                rows={2}
                className="ink-textarea text-sm"
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={addResearchEntry}
                  disabled={!entryContent.trim()}
                  className="btn-primary"
                  style={{ padding: '6px 12px', fontSize: 10 }}
                >
                  File entry
                </button>
              </div>
            </div>
          </Section>

          {/* Notes */}
          <Section title="Marginalia">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => { if (notes !== (idea.notes ?? '')) commit({ notes }); }}
              placeholder="Anything that doesn't fit a typed research entry."
              rows={3}
              className="ink-textarea"
            />
          </Section>

          {/* Readiness */}
          <Section
            title="Readiness"
            rightSlot={
              <span className="mono text-[11px]" style={{ color: readinessCount === 5 ? 'var(--good)' : 'var(--ink-3)' }}>
                {readinessCount}/5
              </span>
            }
          >
            <div
              className="text-sm"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                columnGap: 24,
                rowGap: 4,
              }}
            >
              <ReadinessRow ok={readiness.hasDescription} label="Lede ≥ 30 chars" />
              <ReadinessRow ok={readiness.hasResearchEntries} label="≥ 3 research entries" />
              <ReadinessRow ok={readiness.hasSchemaTypes} label="At least one schema type" />
              <ReadinessRow ok={readiness.hasDeadline} label="Deadline set" />
              <ReadinessRow ok={readiness.hasCluster} label="Cluster tagged" />
            </div>
            <div className="mt-3 flex items-center gap-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="block h-1 flex-1"
                  style={{
                    background: i < readinessCount ? 'var(--accent)' : 'var(--rule-2)',
                    opacity: i < readinessCount ? 1 : 0.4,
                  }}
                />
              ))}
            </div>
          </Section>
        </div>

        <div className="px-8 py-4 flex items-center justify-between gap-4" style={{ borderTop: '1px solid var(--rule)' }}>
          <button
            onClick={() => onDelete(idea.id)}
            className="btn-ghost"
            style={{ color: 'var(--urgent)' }}
          >
            Delete idea
          </button>
          <div className="flex items-center gap-3">
            {idea.promoted_post_id !== null ? (
              <a
                href="#"
                onClick={(e) => { e.preventDefault(); close(); }}
                className="mono text-xs"
                style={{ color: 'var(--good)' }}
                title="Already promoted to a WP draft. Find it in the Posts view to push to WordPress."
              >
                ↗ Promoted to post {idea.promoted_post_id < 0 ? `(stub #${Math.abs(idea.promoted_post_id)})` : `#${idea.promoted_post_id}`}
              </a>
            ) : (
              <button onClick={promote} disabled={isPromoting} className="btn-ghost">
                {isPromoting ? 'Promoting…' : 'Promote to draft'}
              </button>
            )}
            <button onClick={close} className="btn-primary">
              Done — to press
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

function Section({
  title,
  rightSlot,
  children,
}: {
  title: string;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between pb-2 mb-3" style={{ borderBottom: '1px solid var(--rule)' }}>
        <h3 className="label-eyebrow">{title}</h3>
        {rightSlot}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label-eyebrow mb-1" style={{ color: 'var(--ink-3)' }}>{label}</div>
      {children}
    </div>
  );
}

function ReadinessRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block w-3 text-center mono text-xs"
        style={{ color: ok ? 'var(--good)' : 'var(--ink-3)' }}
      >
        {ok ? '✓' : '·'}
      </span>
      <span style={{ color: ok ? 'var(--ink)' : 'var(--ink-3)' }}>{label}</span>
    </div>
  );
}

function TagChipField({
  label,
  placeholder,
  values,
  onChange,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (values.includes(v)) { setDraft(''); return; }
    onChange([...values, v]);
    setDraft('');
  };
  const remove = (v: string) => onChange(values.filter((x) => x !== v));
  return (
    <div>
      <div className="label-eyebrow mb-1.5">{label}</div>
      <div
        className="flex items-center gap-1.5 flex-wrap px-2 py-1.5 min-h-[34px]"
        style={{ border: '1px solid var(--rule)', background: 'var(--paper)' }}
      >
        {values.map((v) => (
          <span key={v} className="chip">
            {v}
            <button onClick={() => remove(v)} style={{ color: 'var(--ink-3)' }} aria-label={`Remove ${v}`}>
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            } else if (e.key === 'Backspace' && !draft && values.length > 0) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={add}
          placeholder={values.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] text-sm bg-transparent outline-none"
          style={{ color: 'var(--ink)' }}
        />
      </div>
    </div>
  );
}

// ─── Taxonomy pickers ────────────────────────────────────────────────────────

interface MergedTerm {
  id: number;
  name: string;
  isPending: boolean;
}

function mergeTerms(synced: Term[], pending: PendingTerm[]): MergedTerm[] {
  const out: MergedTerm[] = synced.map((t) => ({ id: t.id, name: t.name, isPending: false }));
  for (const p of pending) {
    if (!out.some((s) => s.name.toLowerCase() === p.name.toLowerCase() && !s.isPending)) {
      out.push({ id: p.id, name: p.name, isPending: true });
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function PendingBadge() {
  return (
    <span
      className="mono text-[9px] font-medium uppercase tracking-wider"
      style={{ color: 'var(--warn)' }}
      title="Not on WordPress yet — will be created on promote"
    >
      new
    </span>
  );
}

function NewTermInlineForm({
  taxonomy,
  onAdd,
}: {
  taxonomy: string;
  onAdd: (taxonomy: string, name: string) => Promise<PendingTerm | null>;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const term = await onAdd(taxonomy, trimmed);
    setBusy(false);
    if (term) setName('');
  };
  return (
    <div className="mt-2 flex items-baseline gap-2">
      <span className="display italic text-sm" style={{ color: 'var(--accent)' }}>+</span>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
        placeholder={`add new ${taxonomy} term`}
        disabled={busy}
        className="ink-input display text-sm italic flex-1"
        style={{ borderBottom: 'none' }}
      />
      {name.trim() && (
        <button onClick={submit} disabled={busy} className="btn-primary" style={{ padding: '4px 10px', fontSize: 9 }}>
          {busy ? '…' : 'add'}
        </button>
      )}
    </div>
  );
}

function TaxonomySingleField({
  label,
  taxonomy,
  termsByTax,
  pendingByTax,
  value,
  onChange,
  onAddNew,
}: {
  label: string;
  taxonomy: string;
  termsByTax: Record<string, Term[]>;
  pendingByTax: Record<string, PendingTerm[]>;
  value: number | null;
  onChange: (next: number | null) => void;
  onAddNew: (taxonomy: string, name: string) => Promise<PendingTerm | null>;
}) {
  const isReady = Object.prototype.hasOwnProperty.call(termsByTax, taxonomy);
  const merged = useMemo(
    () => mergeTerms(termsByTax[taxonomy] || [], pendingByTax[taxonomy] || []),
    [termsByTax, pendingByTax, taxonomy],
  );
  const selectedTerm = merged.find((t) => t.id === value);
  const handleAdd = async (tax: string, name: string) => {
    const term = await onAddNew(tax, name);
    if (term) onChange(term.id);
    return term;
  };
  return (
    <div>
      <div className="label-eyebrow mb-1.5">{label}</div>
      {!isReady && merged.length === 0 ? (
        <div className="display italic text-sm" style={{ color: 'var(--ink-3)' }}>loading…</div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <select
              value={value ?? ''}
              onChange={(e) => {
                const v = e.target.value === '' ? null : Number(e.target.value);
                onChange(Number.isFinite(v as number) ? (v as number) : null);
              }}
              className="ink-select display text-base flex-1"
            >
              <option value="">—</option>
              {merged.map((t) => (
                <option key={t.id} value={t.id}>{t.isPending ? `${t.name}  (new)` : t.name}</option>
              ))}
            </select>
            {selectedTerm?.isPending && <PendingBadge />}
          </div>
          <NewTermInlineForm taxonomy={taxonomy} onAdd={handleAdd} />
        </>
      )}
    </div>
  );
}

function TaxonomyMultiField({
  label,
  taxonomy,
  termsByTax,
  pendingByTax,
  values,
  onChange,
  onAddNew,
}: {
  label: string;
  taxonomy: string;
  termsByTax: Record<string, Term[]>;
  pendingByTax: Record<string, PendingTerm[]>;
  values: number[];
  onChange: (next: number[]) => void;
  onAddNew: (taxonomy: string, name: string) => Promise<PendingTerm | null>;
}) {
  const isReady = Object.prototype.hasOwnProperty.call(termsByTax, taxonomy);
  const merged = useMemo(
    () => mergeTerms(termsByTax[taxonomy] || [], pendingByTax[taxonomy] || []),
    [termsByTax, pendingByTax, taxonomy],
  );
  const selected = useMemo(() => new Set(values), [values]);
  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(Array.from(next));
  };
  const handleAdd = async (tax: string, name: string) => {
    const term = await onAddNew(tax, name);
    if (term) onChange([...values, term.id]);
    return term;
  };
  const selectedMerged = merged.filter((t) => selected.has(t.id));
  return (
    <div>
      <div className="label-eyebrow mb-1.5">{label}</div>
      {!isReady && merged.length === 0 ? (
        <div className="display italic text-sm" style={{ color: 'var(--ink-3)' }}>loading…</div>
      ) : (
        <>
          {selectedMerged.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              {selectedMerged.map((t) => (
                <span key={t.id} className={cn('chip', t.isPending && 'is-pending')}>
                  {t.name}{t.isPending && <PendingBadge />}
                  <button onClick={() => toggle(t.id)} aria-label={`Remove ${t.name}`}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {merged.length > 0 && (
            <div
              className="max-h-32 overflow-y-auto px-2 py-1"
              style={{ border: '1px solid var(--rule)', background: 'var(--paper)' }}
            >
              {merged.map((t) => (
                <label
                  key={t.id}
                  className="flex items-center gap-2 px-1 py-0.5 text-sm cursor-pointer focus-row"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(t.id)}
                    onChange={() => toggle(t.id)}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  <span style={{ color: 'var(--ink)' }}>{t.name}</span>
                  {t.isPending && <PendingBadge />}
                </label>
              ))}
            </div>
          )}
          <NewTermInlineForm taxonomy={taxonomy} onAdd={handleAdd} />
        </>
      )}
    </div>
  );
}

// ─── Research timeline ───────────────────────────────────────────────────────

const RESEARCH_TYPE_TONE: Record<ResearchType, string> = {
  seo: 'var(--accent)',
  structure: 'var(--ink-2)',
  audience: 'var(--violet)',
  competitor: 'var(--warn)',
  internal_linking: 'var(--teal)',
  monetization: 'var(--good)',
  schema_markup: 'var(--pink)',
  serp_features: 'var(--warn)',
  publishing: 'var(--ink-2)',
  templates: 'var(--teal)',
  legal_compliance: 'var(--urgent)',
  tech_notes: 'var(--ink-3)',
};

function ResearchTimeline({ entries, onDelete }: { entries: ResearchEntry[]; onDelete: (id: number) => void }) {
  if (entries.length === 0) {
    return (
      <div
        className="display italic text-sm py-3 px-3"
        style={{ color: 'var(--ink-3)', border: '1px dashed var(--rule-2)' }}
      >
        Nothing filed yet. Add typed findings below — SEO angles, competitor checks, schema decisions, audience notes…
      </div>
    );
  }
  return (
    <ol className="space-y-3 max-h-80 overflow-y-auto pr-1">
      {entries.map((e, i) => {
        const typeLabel = RESEARCH_TYPES.find((t) => t.id === e.type)?.label || e.type;
        const tone = RESEARCH_TYPE_TONE[e.type];
        return (
          <li key={e.id} className="group flex gap-3 pb-3" style={{ borderBottom: '1px solid var(--rule)' }}>
            <span className="footnote-marker">§{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span
                  className="label-eyebrow"
                  style={{ color: tone }}
                >
                  {typeLabel}
                </span>
                <button
                  onClick={() => onDelete(e.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--ink-3)' }}
                  aria-label="Delete entry"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              <p className="display text-[14px] leading-[1.55] whitespace-pre-wrap" style={{ color: 'var(--ink)' }}>
                {e.content}
              </p>
              {e.source_url && (
                <a
                  href={e.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block mono text-[11px] hover:underline truncate max-w-full"
                  style={{ color: 'var(--accent)' }}
                >
                  ↗ {e.source_url}
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ─── Keywords table ──────────────────────────────────────────────────────────

function KeywordsTable() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTerm, setNewTerm] = useState('');
  const [newVolume, setNewVolume] = useState('');

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/planner/keywords');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setKeywords(data.keywords);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load keywords');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const addKeyword = async () => {
    const trimmed = newTerm.trim();
    if (!trimmed) return;
    const body: Record<string, unknown> = { term: trimmed };
    const volNum = parseInt(newVolume, 10);
    if (Number.isFinite(volNum)) body.volume = volNum;
    const res = await fetch('/api/planner/keywords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setNewTerm('');
      setNewVolume('');
      await refresh();
    } else if (res.status === 409) {
      alert(`"${trimmed}" is already in the list.`);
    }
  };

  const patchKeyword = async (id: number, patch: Partial<Keyword>) => {
    const res = await fetch(`/api/planner/keywords/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) await refresh();
  };

  const removeKeyword = async (id: number) => {
    if (!confirm('Delete this keyword?')) return;
    setKeywords((prev) => prev.filter((k) => k.id !== id));
    const res = await fetch(`/api/planner/keywords/${id}`, { method: 'DELETE' });
    if (!res.ok) await refresh();
  };

  if (loading) return <div className="display italic text-sm mt-6" style={{ color: 'var(--ink-3)' }}>typesetting the index…</div>;
  if (error) return <div className="mt-6 text-sm" style={{ color: 'var(--accent)' }}>Error: {error}</div>;

  return (
    <div className="mt-6 fade-in">
      <div className="grid gap-2 mb-2 label-eyebrow" style={{ gridTemplateColumns: '4fr 1fr 1fr 3fr 32px' }}>
        <span>Term</span>
        <span className="text-right">Volume</span>
        <span className="text-right">Target post</span>
        <span>Notes</span>
        <span></span>
      </div>
      <div style={{ borderTop: '1px solid var(--rule-2)' }}>
        {keywords.length === 0 && (
          <div className="display italic text-sm py-6 text-center" style={{ color: 'var(--ink-3)' }}>
            No keywords yet. Add one below.
          </div>
        )}
        {keywords.map((kw, i) => (
          <KeywordRow key={kw.id} keyword={kw} index={i + 1} onPatch={patchKeyword} onDelete={removeKeyword} />
        ))}
        <div
          className="grid gap-2 py-2 items-center"
          style={{ gridTemplateColumns: '4fr 1fr 1fr 3fr 32px', borderTop: '1px solid var(--rule)' }}
        >
          <div className="flex items-baseline gap-2 pl-1">
            <span
              className="display italic text-sm"
              style={{ color: newTerm.trim() ? 'var(--accent)' : 'var(--ink-3)' }}
            >
              +
            </span>
            <input
              type="text"
              value={newTerm}
              onChange={(e) => setNewTerm(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addKeyword(); }}
              placeholder="add keyword"
              className="ink-input display text-sm italic"
              style={{ borderBottom: 'none', padding: 0 }}
            />
          </div>
          <input
            type="number"
            value={newVolume}
            onChange={(e) => setNewVolume(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addKeyword(); }}
            placeholder="—"
            className="ink-input mono text-sm text-right"
            style={{ borderBottom: 'none', padding: 0 }}
          />
          <div></div>
          <div></div>
          <div className="text-center">
            {newTerm.trim() && (
              <button onClick={addKeyword} className="btn-ghost" aria-label="Add keyword" style={{ padding: '2px 4px' }}>
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function KeywordRow({
  keyword,
  index,
  onPatch,
  onDelete,
}: {
  keyword: Keyword;
  index: number;
  onPatch: (id: number, patch: Partial<Keyword>) => void;
  onDelete: (id: number) => void;
}) {
  const [term, setTerm] = useState(keyword.term);
  const [volume, setVolume] = useState(keyword.volume?.toString() ?? '');
  const [targetPostId, setTargetPostId] = useState(keyword.target_post_id?.toString() ?? '');
  const [notes, setNotes] = useState(keyword.notes ?? '');

  const commitTerm = () => {
    const t = term.trim();
    if (t && t !== keyword.term) onPatch(keyword.id, { term: t });
    else if (!t) setTerm(keyword.term);
  };
  const commitVolume = () => {
    const v = volume.trim();
    if (v === '' && keyword.volume !== null) onPatch(keyword.id, { volume: null });
    else if (v !== '') {
      const n = parseInt(v, 10);
      if (Number.isFinite(n) && n !== keyword.volume) onPatch(keyword.id, { volume: n });
    }
  };
  const commitTargetPostId = () => {
    const v = targetPostId.trim();
    if (v === '' && keyword.target_post_id !== null) onPatch(keyword.id, { target_post_id: null });
    else if (v !== '') {
      const n = parseInt(v, 10);
      if (Number.isFinite(n) && n !== keyword.target_post_id) onPatch(keyword.id, { target_post_id: n });
    }
  };
  const commitNotes = () => {
    if (notes !== (keyword.notes ?? '')) onPatch(keyword.id, { notes });
  };

  const isGap = !keyword.target_post_id;

  return (
    <div
      className="grid gap-2 py-2 items-center focus-row group"
      style={{ gridTemplateColumns: '4fr 1fr 1fr 3fr 32px', borderTop: '1px solid var(--rule)' }}
    >
      <div className="flex items-baseline gap-2 pl-1">
        <span className="ordinal">{String(index).padStart(2, '0')}</span>
        <input
          type="text"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onBlur={commitTerm}
          className="display text-[14px] flex-1 bg-transparent outline-none"
          style={{ color: 'var(--ink)' }}
        />
        {isGap && (
          <span className="pill is-pending mono" style={{ fontSize: 9, padding: '1px 5px' }}>gap</span>
        )}
      </div>
      <input
        type="number"
        value={volume}
        onChange={(e) => setVolume(e.target.value)}
        onBlur={commitVolume}
        placeholder="—"
        className="mono text-sm text-right bg-transparent outline-none"
        style={{ color: 'var(--ink)' }}
      />
      <input
        type="number"
        value={targetPostId}
        onChange={(e) => setTargetPostId(e.target.value)}
        onBlur={commitTargetPostId}
        placeholder="—"
        className="mono text-sm text-right bg-transparent outline-none"
        style={{ color: 'var(--ink)' }}
      />
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={commitNotes}
        placeholder="—"
        className="display text-sm bg-transparent outline-none"
        style={{ color: 'var(--ink-2)' }}
      />
      <div className="text-center">
        <button
          onClick={() => onDelete(keyword.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: 'var(--ink-3)' }}
          aria-label="Delete keyword"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

export default PlannerPage;

registerGlobalPage({
  id: 'planner',
  label: 'Planner',
  icon: 'ClipboardList',
  position: 50,
  pluginId: 'content-planner',
  component: PlannerPage,
});
