'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { registerGlobalPage } from '@/components/globalPages';
import { cn } from '@/lib/utils';
import type { PageComponentProps } from '../../types';

type IdeaStatus = 'idea' | 'researching' | 'drafting' | 'ready' | 'published';

interface Idea {
  id: number;
  title: string;
  status: IdeaStatus;
  description: string | null;
  notes: string | null;
  linked_keyword_ids: number[];
  promoted_post_id: number | null;
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

  const patchIdea = async (id: number, patch: Partial<Pick<Idea, 'title' | 'status' | 'description' | 'notes'>>) => {
    const res = await fetch(`/api/planner/ideas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) await refresh();
  };

  const removeIdea = async (id: number) => {
    if (!confirm('Delete this idea?')) return;
    setIdeas((prev) => prev.filter((i) => i.id !== id));
    if (openIdeaId === id) setOpenIdeaId(null);
    const res = await fetch(`/api/planner/ideas/${id}`, { method: 'DELETE' });
    if (!res.ok) await refresh();
  };

  const openIdea = openIdeaId !== null ? ideas.find((i) => i.id === openIdeaId) || null : null;

  if (loading) {
    return <div className="text-sm text-gray-500 dark:text-gray-400">Loading ideas…</div>;
  }
  if (error) {
    return <div className="text-sm text-red-600 dark:text-red-400">Error: {error}</div>;
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {STATUS_COLUMNS.map((col) => {
          const items = ideas.filter((i) => i.status === col.id);
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
                  <li
                    key={idea.id}
                    onClick={() => setOpenIdeaId(idea.id)}
                    className="group flex items-center justify-between gap-2 px-3 py-1.5 text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-900/40 cursor-pointer border-b border-gray-100 dark:border-gray-700/50 last:border-b-0"
                  >
                    <span className="truncate">{idea.title}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeIdea(idea.id); }}
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity flex-shrink-0"
                      aria-label="Delete idea"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
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
  onSave: (id: number, patch: Partial<Pick<Idea, 'title' | 'status' | 'description' | 'notes'>>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [title, setTitle] = useState(idea.title);
  const [status, setStatus] = useState<IdeaStatus>(idea.status);
  const [description, setDescription] = useState(idea.description ?? '');
  const [notes, setNotes] = useState(idea.notes ?? '');

  // Reset local form state when switching to a different idea.
  useEffect(() => {
    setTitle(idea.title);
    setStatus(idea.status);
    setDescription(idea.description ?? '');
    setNotes(idea.notes ?? '');
  }, [idea.id, idea.title, idea.status, idea.description, idea.notes]);

  // Auto-transition from "idea" to "researching" the moment any notes get
  // typed in. Captures the "the act of researching is starting" signal.
  useEffect(() => {
    if (idea.status === 'idea' && status === 'idea' && notes.trim().length > 0) {
      setStatus('researching');
    }
  }, [notes, idea.status, status]);

  const commit = async (patch: Partial<Pick<Idea, 'title' | 'status' | 'description' | 'notes'>>) => {
    await onSave(idea.id, patch);
  };

  const close = async () => {
    // Flush any unsaved local changes before closing.
    const patch: Partial<Pick<Idea, 'title' | 'status' | 'description' | 'notes'>> = {};
    if (title.trim() && title !== idea.title) patch.title = title.trim();
    if (status !== idea.status) patch.status = status;
    if (description !== (idea.description ?? '')) patch.description = description;
    if (notes !== (idea.notes ?? '')) patch.notes = notes;
    if (Object.keys(patch).length > 0) await commit(patch);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/40" onClick={close} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative bg-white dark:bg-gray-800 w-full max-w-md shadow-xl h-full flex flex-col overflow-hidden"
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

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => { if (title.trim() && title !== idea.title) commit({ title: title.trim() }); }}
              className="w-full text-base font-medium text-gray-900 dark:text-gray-100 bg-transparent border-b border-gray-200 dark:border-gray-700 focus:border-brand-500 focus:outline-none py-1"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Status
            </label>
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
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => { if (description !== (idea.description ?? '')) commit({ description }); }}
              placeholder="What is this template? Why is it worth building?"
              rows={4}
              className="w-full text-sm rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1.5 placeholder-gray-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => {
                const patch: Partial<Pick<Idea, 'status' | 'notes'>> = {};
                if (notes !== (idea.notes ?? '')) patch.notes = notes;
                if (status !== idea.status) patch.status = status;
                if (Object.keys(patch).length > 0) commit(patch);
              }}
              placeholder="Scratch space. Typing anything here moves the idea into Researching."
              rows={5}
              className="w-full text-sm rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1.5 placeholder-gray-400"
            />
            {idea.status === 'idea' && notes.trim().length > 0 && status === 'researching' && (
              <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                Status will move to Researching on save.
              </p>
            )}
          </div>

          <p className="text-xs text-gray-400 dark:text-gray-500">
            Research log (SEO angles, structure, audience, related templates) coming next.
          </p>
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
