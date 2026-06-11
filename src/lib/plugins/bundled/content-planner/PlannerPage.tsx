'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, X, AlertCircle } from 'lucide-react';
import { registerGlobalPage } from '@/components/globalPages';
import { cn } from '@/lib/utils';
import type { PageComponentProps } from '../../types';

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
  id: number; // negative
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

const STATUS_COLUMNS: Array<{ id: IdeaStatus; label: string; accent: string }> = [
  { id: 'idea', label: 'Idea', accent: 'border-gray-400 dark:border-gray-600' },
  { id: 'researching', label: 'Researching', accent: 'border-blue-400 dark:border-blue-600' },
  { id: 'drafting', label: 'Drafting', accent: 'border-yellow-400 dark:border-yellow-600' },
  { id: 'ready', label: 'Ready', accent: 'border-purple-400 dark:border-purple-600' },
  { id: 'published', label: 'Published', accent: 'border-green-500 dark:border-green-600' },
];

// ─── Ideas board ─────────────────────────────────────────────────────────────

function IdeasBoard() {
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
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ideas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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

  if (loading) {
    return <div className="text-sm text-gray-500 dark:text-gray-400">Loading ideas…</div>;
  }
  if (error) {
    return <div className="text-sm text-red-600 dark:text-red-400">Error: {error}</div>;
  }

  return (
    <>
      {clusters.length > 0 && (
        <div className="mb-3 flex items-center gap-2 text-xs">
          <span className="text-gray-500 dark:text-gray-400">Cluster:</span>
          <button
            onClick={() => setClusterFilter('')}
            className={cn(
              'px-2 py-0.5 rounded-full border',
              clusterFilter === ''
                ? 'bg-brand-600 text-white border-brand-600'
                : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800',
            )}
          >
            All
          </button>
          {clusters.map((c) => (
            <button
              key={c}
              onClick={() => setClusterFilter(c)}
              className={cn(
                'px-2 py-0.5 rounded-full border',
                clusterFilter === c
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800',
              )}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {STATUS_COLUMNS.map((col) => {
          const items = filteredIdeas.filter((i) => i.status === col.id);
          return (
            <div
              key={col.id}
              className={cn(
                'flex flex-col rounded-lg bg-white dark:bg-gray-800 border-t-2',
                col.accent,
              )}
            >
              <div className="flex items-center justify-between px-3 pt-3 pb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">
                  {col.label}
                </h3>
                <span className="text-xs text-gray-400 dark:text-gray-500">{items.length}</span>
              </div>

              <ul className="flex-1 pb-1 min-h-[40px]">
                {items.map((idea) => (
                  <IdeaListItem
                    key={idea.id}
                    idea={idea}
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
  if (days < 0) return { label, cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' };
  if (days <= 14) return { label, cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' };
  if (days <= 30) return { label, cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' };
  return { label, cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' };
}

function hasPendingTermRefs(idea: Idea): boolean {
  if (idea.resource_type_term_id !== null && idea.resource_type_term_id < 0) return true;
  if (idea.topic_term_ids.some((n) => n < 0)) return true;
  if (idea.audience_term_ids.some((n) => n < 0)) return true;
  return false;
}

function IdeaListItem({ idea, onOpen, onDelete }: { idea: Idea; onOpen: () => void; onDelete: () => void }) {
  const badge = deadlineBadge(idea.deadline);
  const hasPending = hasPendingTermRefs(idea);
  return (
    <li
      onClick={onOpen}
      className="group flex items-center justify-between gap-2 px-3 py-1.5 text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-900/40 cursor-pointer border-b border-gray-100 dark:border-gray-700/50 last:border-b-0"
    >
      <span className="truncate flex-1">{idea.title}</span>
      <div className="flex items-center gap-1 flex-shrink-0">
        {idea.priority !== null && idea.priority >= 8 && (
          <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">P{idea.priority}</span>
        )}
        {hasPending && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-amber-500"
            title="References terms that don't exist on WordPress yet"
          />
        )}
        {badge && (
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', badge.cls)}>{badge.label}</span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity"
          aria-label="Delete idea"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </li>
  );
}

function AddIdeaForm({
  status,
  onAdd,
}: {
  status: IdeaStatus;
  onAdd: (title: string, status: IdeaStatus) => void;
}) {
  const [title, setTitle] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd(trimmed, status);
    setTitle('');
  };
  return (
    <form onSubmit={submit} className="px-2 pb-2 pt-1 border-t border-gray-100 dark:border-gray-700/50">
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="+ Add idea"
          className="flex-1 text-xs rounded border border-transparent hover:border-gray-200 dark:hover:border-gray-700 focus:border-brand-500 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100 px-1.5 py-1 placeholder-gray-400"
        />
        {title.trim() && (
          <button
            type="submit"
            className="text-brand-600 hover:text-brand-700"
            aria-label="Add idea"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
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

  // PLEXKITS taxonomies (audience / topic / resource-type) — loaded once,
  // shared by every drawer instance via state ref module-scope cache.
  const [termsByTax, setTermsByTax] = useState<Record<string, Term[]>>({});
  // Pending terms the user has added inside the planner that don't yet exist
  // on WP. Keyed by taxonomy; IDs are negative to coexist with synced (+) IDs.
  const [plannerTermsByTax, setPlannerTermsByTax] = useState<Record<string, PendingTerm[]>>({});

  // Research log state
  const [entries, setEntries] = useState<ResearchEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [entryType, setEntryType] = useState<ResearchType>('seo');
  const [entryContent, setEntryContent] = useState('');
  const [entrySource, setEntrySource] = useState('');

  // Reset local state when switching to a different idea.
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
  }, [idea]);

  // Load the synced PLEXKITS taxonomy terms once per drawer mount, plus the
  // planner-side pending terms (kept in a separate table so they don't
  // pollute the resource-edit UI's term lists).
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
      fetch('/api/terms').then((r) => r.json()).catch((err) => { console.warn('[planner] terms load failed:', err); return {}; }),
      fetch('/api/planner/terms').then((r) => r.json()).catch((err) => { console.warn('[planner] planner-terms load failed:', err); return { terms: {} }; }),
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

  // Load research entries when the open idea changes.
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
    if (!res.ok) {
      alert('Failed to add research entry');
      return;
    }
    const data = await res.json();
    setEntries((prev) => [...prev, data.entry]);
    setEntryContent('');
    setEntrySource('');
    // Auto-transition: adding research is the explicit "research started"
    // signal. Bumps idea->researching once.
    if (idea.status === 'idea' && status === 'idea') {
      setStatus('researching');
      await commit({ status: 'researching' });
    }
  };

  const removeResearchEntry = async (entryId: number) => {
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
    const res = await fetch(`/api/planner/research/${entryId}`, { method: 'DELETE' });
    if (!res.ok) {
      // Reload on failure.
      const r = await fetch(`/api/planner/ideas/${idea.id}/research`);
      const d = await r.json();
      setEntries(d.entries || []);
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

  // Readiness checklist for graduating to drafting/ready.
  const readiness = {
    hasDescription: description.trim().length > 30,
    hasResearchEntries: entries.length >= 3,
    hasSchemaTypes: schemaTypes.length > 0,
    hasDeadline: deadline.length > 0,
    hasCluster: cluster.trim().length > 0,
  };
  const readinessCount = Object.values(readiness).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/40" onClick={close} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative bg-white dark:bg-gray-800 w-full max-w-2xl shadow-xl h-full flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Idea</h2>
          <button
            onClick={close}
            className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label="Close drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Title */}
          <div>
            <Label>Title</Label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => { if (title.trim() && title !== idea.title) commit({ title: title.trim() }); }}
              className="w-full text-base font-medium text-gray-900 dark:text-gray-100 bg-transparent border-b border-gray-200 dark:border-gray-700 focus:border-brand-500 focus:outline-none py-1"
            />
          </div>

          {/* Quick fields row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Status</Label>
              <select
                value={status}
                onChange={(e) => {
                  const next = e.target.value as IdeaStatus;
                  setStatus(next);
                  commit({ status: next });
                }}
                className="w-full text-sm rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1"
              >
                {STATUS_COLUMNS.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Cluster</Label>
              <input
                type="text"
                value={cluster}
                onChange={(e) => setCluster(e.target.value)}
                onBlur={() => { if (cluster !== (idea.cluster ?? '')) commit({ cluster: cluster || null }); }}
                placeholder="e.g. office-pools"
                className="w-full text-sm rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1 placeholder-gray-400"
              />
            </div>
            <div>
              <Label>Priority (1-10)</Label>
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
                className="w-full text-sm rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Deadline</Label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                onBlur={() => { if (deadline !== (idea.deadline ?? '')) commit({ deadline: deadline || null }); }}
                className="w-full text-sm rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1"
              />
            </div>
            <div>
              <Label>Frequency</Label>
              <select
                value={frequency ?? ''}
                onChange={(e) => {
                  const v = (e.target.value || null) as Frequency;
                  setFrequency(v);
                  commit({ frequency: v } as Partial<Idea>);
                }}
                className="w-full text-sm rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1"
              >
                {FREQUENCY_OPTIONS.map((c) => (
                  <option key={c.id ?? 'none'} value={c.id ?? ''}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Effort (hours)</Label>
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
                className="w-full text-sm rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1"
              />
            </div>
          </div>

          {frequency && (
            <div>
              <Label>Next refresh due</Label>
              <input
                type="date"
                value={refreshNextDue}
                onChange={(e) => setRefreshNextDue(e.target.value)}
                onBlur={() => { if (refreshNextDue !== (idea.refresh_next_due ?? '')) commit({ refresh_next_due: refreshNextDue || null }); }}
                className="w-full sm:w-1/3 text-sm rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1"
              />
            </div>
          )}

          {/* PLEXKITS taxonomy bindings */}
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
            label="Tags (topic)"
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

          {/* Description */}
          <div>
            <Label>Description</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => { if (description !== (idea.description ?? '')) commit({ description }); }}
              placeholder="What is this template? Why is it worth building best-in-class?"
              rows={3}
              className="w-full text-sm rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1.5 placeholder-gray-400"
            />
          </div>

          {/* Tag-chip fields */}
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

          {/* Research log */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label noMargin>Research log</Label>
              <span className="text-xs text-gray-400 dark:text-gray-500">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span>
            </div>
            {entriesLoading ? (
              <div className="text-xs text-gray-500 dark:text-gray-400 py-3">Loading…</div>
            ) : (
              <ResearchTimeline entries={entries} onDelete={removeResearchEntry} />
            )}
            <div className="mt-2 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <select
                  value={entryType}
                  onChange={(e) => setEntryType(e.target.value as ResearchType)}
                  className="text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-1.5 py-1"
                >
                  {RESEARCH_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={entrySource}
                  onChange={(e) => setEntrySource(e.target.value)}
                  placeholder="Source URL (optional)"
                  className="flex-1 text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-1.5 py-1 placeholder-gray-400"
                />
              </div>
              <textarea
                value={entryContent}
                onChange={(e) => setEntryContent(e.target.value)}
                placeholder={`Concrete finding for ${RESEARCH_TYPES.find((t) => t.id === entryType)?.label || entryType}…`}
                rows={2}
                className="w-full text-sm rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1.5 placeholder-gray-400"
              />
              <div className="flex justify-end">
                <button
                  onClick={addResearchEntry}
                  disabled={!entryContent.trim()}
                  className="text-xs px-2.5 py-1 rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add entry
                </button>
              </div>
            </div>
          </div>

          {/* Notes (free scratch) */}
          <div>
            <Label>Notes (free scratch)</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => { if (notes !== (idea.notes ?? '')) commit({ notes }); }}
              placeholder="Anything that doesn't fit a typed research entry."
              rows={3}
              className="w-full text-sm rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1.5 placeholder-gray-400"
            />
          </div>

          {/* Readiness checklist */}
          <div className="rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">Readiness</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{readinessCount}/5</span>
            </div>
            <ul className="text-xs space-y-0.5">
              <ReadinessRow ok={readiness.hasDescription} label="Description ≥30 chars" />
              <ReadinessRow ok={readiness.hasResearchEntries} label="≥3 research entries" />
              <ReadinessRow ok={readiness.hasSchemaTypes} label="At least one schema type" />
              <ReadinessRow ok={readiness.hasDeadline} label="Deadline set" />
              <ReadinessRow ok={readiness.hasCluster} label="Cluster tagged" />
            </ul>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <button
            onClick={() => onDelete(idea.id)}
            className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
          >
            Delete idea
          </button>
          <button
            onClick={close}
            className="px-3 py-1 text-xs font-medium rounded-md bg-brand-600 text-white hover:bg-brand-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function Label({ children, noMargin }: { children: React.ReactNode; noMargin?: boolean }) {
  return (
    <label className={cn('block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider', noMargin ? '' : 'mb-1')}>
      {children}
    </label>
  );
}

function ReadinessRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={cn('inline-block w-3 text-center', ok ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500')}>{ok ? '✓' : '·'}</span>
      <span className={cn(ok ? 'text-gray-700 dark:text-gray-300' : 'text-gray-500 dark:text-gray-500')}>{label}</span>
    </li>
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
      <Label>{label}</Label>
      <div className="flex items-center gap-1.5 flex-wrap rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 min-h-[34px]">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-brand-100 text-brand-800 dark:bg-brand-900/30 dark:text-brand-300"
          >
            {v}
            <button onClick={() => remove(v)} className="hover:text-red-600" aria-label={`Remove ${v}`}>
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
          className="flex-1 min-w-[120px] text-sm bg-transparent text-gray-900 dark:text-gray-100 focus:outline-none placeholder-gray-400"
        />
      </div>
    </div>
  );
}

interface MergedTerm {
  id: number;
  name: string;
  isPending: boolean;
}

function mergeTerms(
  synced: Term[],
  pending: PendingTerm[],
): MergedTerm[] {
  const out: MergedTerm[] = synced.map((t) => ({ id: t.id, name: t.name, isPending: false }));
  for (const p of pending) {
    // Hide pending term if a synced term with the same name was added since
    // (e.g. user pulled the WP sync after creating the pending row).
    if (!out.some((s) => s.name.toLowerCase() === p.name.toLowerCase() && !s.isPending)) {
      out.push({ id: p.id, name: p.name, isPending: true });
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function PendingBadge() {
  return (
    <span className="ml-1 inline-flex items-center px-1 py-0 rounded text-[9px] font-medium uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" title="Not on WordPress yet — will be created on promote">
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
    <div className="mt-1.5 flex items-center gap-1">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
        placeholder={`+ Add new ${taxonomy} term…`}
        disabled={busy}
        className="flex-1 text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1 placeholder-gray-400 disabled:opacity-50"
      />
      {name.trim() && (
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="text-xs px-2 py-0.5 rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? '…' : 'Add'}
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
      <Label>{label}</Label>
      {!isReady && merged.length === 0 ? (
        <div className="text-xs text-gray-400 dark:text-gray-500 italic py-1">Loading taxonomy…</div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <select
              value={value ?? ''}
              onChange={(e) => {
                const v = e.target.value === '' ? null : Number(e.target.value);
                onChange(Number.isFinite(v as number) ? (v as number) : null);
              }}
              className="flex-1 text-sm rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1"
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
      <Label>{label}</Label>
      {!isReady && merged.length === 0 ? (
        <div className="text-xs text-gray-400 dark:text-gray-500 italic py-1">Loading taxonomy…</div>
      ) : (
        <>
          {selectedMerged.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
              {selectedMerged.map((t) => (
                <span
                  key={t.id}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs',
                    t.isPending
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                      : 'bg-brand-100 text-brand-800 dark:bg-brand-900/30 dark:text-brand-300',
                  )}
                >
                  {t.name}{t.isPending && <PendingBadge />}
                  <button onClick={() => toggle(t.id)} className="hover:text-red-600" aria-label={`Remove ${t.name}`}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {merged.length > 0 && (
            <div className="rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 max-h-32 overflow-y-auto p-1">
              {merged.map((t) => (
                <label
                  key={t.id}
                  className="flex items-center gap-2 px-1.5 py-0.5 rounded text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900/40 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(t.id)}
                    onChange={() => toggle(t.id)}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span>{t.name}</span>
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

const RESEARCH_TYPE_COLORS: Record<ResearchType, string> = {
  seo: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  structure: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  audience: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  competitor: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  internal_linking: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  monetization: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  schema_markup: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  serp_features: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  publishing: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  templates: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  legal_compliance: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  tech_notes: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

function ResearchTimeline({ entries, onDelete }: { entries: ResearchEntry[]; onDelete: (id: number) => void }) {
  if (entries.length === 0) {
    return (
      <div className="text-xs text-gray-500 dark:text-gray-400 italic py-2 px-3 rounded border border-dashed border-gray-300 dark:border-gray-700">
        No research yet. Add typed findings below: SEO angles, competitor checks, schema decisions, audience notes…
      </div>
    );
  }
  return (
    <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
      {entries.map((e) => {
        const typeLabel = RESEARCH_TYPES.find((t) => t.id === e.type)?.label || e.type;
        return (
          <li key={e.id} className="group rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2">
            <div className="flex items-start justify-between gap-2">
              <span className={cn('inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium', RESEARCH_TYPE_COLORS[e.type])}>
                {typeLabel}
              </span>
              <button
                onClick={() => onDelete(e.id)}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity"
                aria-label="Delete entry"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            <p className="mt-1 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{e.content}</p>
            {e.source_url && (
              <a
                href={e.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-[11px] text-brand-600 dark:text-brand-400 hover:underline truncate max-w-full"
              >
                {e.source_url}
              </a>
            )}
          </li>
        );
      })}
    </ul>
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

  useEffect(() => {
    refresh();
  }, [refresh]);

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

  if (loading) {
    return <div className="text-sm text-gray-500 dark:text-gray-400">Loading keywords…</div>;
  }
  if (error) {
    return <div className="text-sm text-red-600 dark:text-red-400">Error: {error}</div>;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
          <tr>
            <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Term</th>
            <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">Volume</th>
            <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">Target post ID</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Notes</th>
            <th className="w-12"></th>
          </tr>
        </thead>
        <tbody>
          {keywords.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-gray-500 dark:text-gray-400">
                No keywords yet. Add one below.
              </td>
            </tr>
          )}
          {keywords.map((kw) => (
            <KeywordRow key={kw.id} keyword={kw} onPatch={patchKeyword} onDelete={removeKeyword} />
          ))}
          <tr className="border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
            <td className="px-4 py-2">
              <input
                type="text"
                value={newTerm}
                onChange={(e) => setNewTerm(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addKeyword(); }}
                placeholder="+ Add keyword"
                className="w-full text-sm bg-transparent text-gray-900 dark:text-gray-100 px-0 py-1 focus:outline-none placeholder-gray-400"
              />
            </td>
            <td className="px-4 py-2 text-right">
              <input
                type="number"
                value={newVolume}
                onChange={(e) => setNewVolume(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addKeyword(); }}
                placeholder="—"
                className="w-24 text-sm text-right bg-transparent text-gray-900 dark:text-gray-100 px-0 py-1 focus:outline-none placeholder-gray-400"
              />
            </td>
            <td colSpan={2}></td>
            <td className="px-4 py-2 text-center">
              {newTerm.trim() && (
                <button
                  type="button"
                  onClick={() => addKeyword()}
                  className="text-brand-600 hover:text-brand-700"
                  aria-label="Add keyword"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function KeywordRow({
  keyword,
  onPatch,
  onDelete,
}: {
  keyword: Keyword;
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
    <tr className="group border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-900/30">
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onBlur={commitTerm}
            className="flex-1 bg-transparent text-gray-900 dark:text-gray-100 focus:outline-none focus:bg-white dark:focus:bg-gray-800 rounded px-1"
          />
          {isGap && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
              gap
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-2 text-right">
        <input
          type="number"
          value={volume}
          onChange={(e) => setVolume(e.target.value)}
          onBlur={commitVolume}
          placeholder="—"
          className="w-24 text-right bg-transparent text-gray-900 dark:text-gray-100 focus:outline-none focus:bg-white dark:focus:bg-gray-800 rounded px-1 placeholder-gray-400"
        />
      </td>
      <td className="px-4 py-2 text-right">
        <input
          type="number"
          value={targetPostId}
          onChange={(e) => setTargetPostId(e.target.value)}
          onBlur={commitTargetPostId}
          placeholder="—"
          className="w-24 text-right bg-transparent text-gray-900 dark:text-gray-100 focus:outline-none focus:bg-white dark:focus:bg-gray-800 rounded px-1 placeholder-gray-400"
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={commitNotes}
          placeholder="—"
          className="w-full bg-transparent text-gray-600 dark:text-gray-400 focus:outline-none focus:bg-white dark:focus:bg-gray-800 rounded px-1 placeholder-gray-400"
        />
      </td>
      <td className="px-4 py-2 text-center">
        <button
          onClick={() => onDelete(keyword.id)}
          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity"
          aria-label="Delete keyword"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}

// ─── Page shell ──────────────────────────────────────────────────────────────

type Tab = 'ideas' | 'keywords';

export function PlannerPage(_props: PageComponentProps) {
  const [tab, setTab] = useState<Tab>('ideas');

  return (
    <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            Content Planner
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Plan ideas and keywords before they become posts.
          </p>
        </div>

        <div className="mb-4 border-b border-gray-200 dark:border-gray-700">
          <nav className="flex gap-4 -mb-px">
            {(['ideas', 'keywords'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'py-2 px-1 text-sm font-medium border-b-2 capitalize transition-colors',
                  tab === t
                    ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
                )}
              >
                {t}
              </button>
            ))}
          </nav>
        </div>

        {tab === 'ideas' ? <IdeasBoard /> : <KeywordsTable />}
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
