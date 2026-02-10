'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Plus, X, Lock, Pencil, Check,
  ChevronUp, ChevronDown, Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ─────────────────────────────────────────────────────────────────

interface TabConfig {
  id: string;
  label: string;
  source: string;
  icon?: string;
  position?: number;
  dynamic?: boolean;
  post_types?: string[];
}

interface FieldDefinition {
  key: string;
  type: 'text' | 'textarea' | 'number' | 'checkbox' | 'date' | 'datetime' | 'color' | 'select' | 'url' | 'repeater' | 'textarea-list';
  label: string;
  width?: 'full' | 'half' | 'quarter';
  placeholder?: string;
  rows?: number;
  taxonomy_source?: string;
  [key: string]: unknown;
}

interface MappableField {
  key: string;
  label: string;
  category: 'core' | 'meta' | 'taxonomy';
  type?: string;
}

interface TabLayoutEditorProps {
  tabs: TabConfig[];
  fieldLayout: Record<string, FieldDefinition[]>;
  availableFields: MappableField[];
  postType: string;
  onChange: (tabs: TabConfig[], fieldLayout: Record<string, FieldDefinition[]>) => void;
}

// Tabs with hardcoded rendering — shown with lock icon, non-editable in the layout editor
const HARDCODED_TAB_IDS = new Set(['basic', 'seo', 'classification', 'ai']);

// Read-only field summaries for core/hardcoded tabs so users can see what's in them
const CORE_TAB_FIELDS: Record<string, Array<{ label: string; type: string; note?: string }>> = {
  basic: [
    { label: 'Title', type: 'text' },
    { label: 'URL Slug', type: 'text' },
    { label: 'Featured Image', type: 'url + upload', note: 'Image preview with upload support' },
  ],
  seo: [
    { label: 'SEO Title', type: 'text', note: '60 character limit' },
    { label: 'Meta Description', type: 'textarea', note: '160 character limit' },
    { label: 'Target Keywords', type: 'text', note: 'Comma-separated' },
    { label: 'Canonical URL', type: 'url' },
    { label: 'OG Title', type: 'text', note: 'Facebook / Open Graph' },
    { label: 'OG Description', type: 'text' },
    { label: 'OG Image URL', type: 'url' },
    { label: 'Twitter Title', type: 'text', note: 'Twitter / X' },
    { label: 'Twitter Description', type: 'text' },
    { label: 'Twitter Image URL', type: 'url' },
    { label: 'No Index', type: 'checkbox', note: 'Robots' },
    { label: 'No Follow', type: 'checkbox' },
    { label: 'No Snippet', type: 'checkbox' },
    { label: 'No Image Index', type: 'checkbox' },
  ],
  classification: [
    { label: 'Taxonomies', type: 'multi-select', note: 'All configured taxonomies with filter support' },
  ],
  ai: [
    { label: 'Copy AI Fill Prompt', type: 'action', note: 'Generates prompt for all content fields' },
    { label: 'Copy Image Prompt', type: 'action', note: 'Generates prompt for featured image ideas' },
    { label: 'Paste AI Response', type: 'textarea', note: 'Paste and parse AI-generated content' },
    { label: 'Apply to Fields', type: 'action', note: 'Auto-fills title, content, SEO, taxonomies, etc.' },
  ],
};

const FIELD_TYPE_OPTIONS: FieldDefinition['type'][] = [
  'text', 'textarea', 'number', 'checkbox', 'date', 'datetime',
  'color', 'select', 'url', 'repeater', 'textarea-list',
];

const WIDTH_OPTIONS: Array<{ value: FieldDefinition['width']; label: string }> = [
  { value: 'full', label: 'Full' },
  { value: 'half', label: 'Half' },
  { value: 'quarter', label: 'Quarter' },
];

function generateTabId(label: string): string {
  return label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export function TabLayoutEditor({
  tabs: initialTabs,
  fieldLayout: initialFieldLayout,
  availableFields,
  postType,
  onChange,
}: TabLayoutEditorProps): React.ReactElement {
  const [tabs, setTabs] = useState<TabConfig[]>(initialTabs);
  const [fieldLayout, setFieldLayout] = useState<Record<string, FieldDefinition[]>>(initialFieldLayout);
  const [selectedTabId, setSelectedTabId] = useState<string | null>(
    initialTabs.find((t) => !HARDCODED_TAB_IDS.has(t.id))?.id ?? initialTabs[0]?.id ?? null
  );
  const [addingTab, setAddingTab] = useState(false);
  const [newTabName, setNewTabName] = useState('');
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showFieldSearch, setShowFieldSearch] = useState(false);
  const [fieldSearchQuery, setFieldSearchQuery] = useState('');

  const emit = useCallback(
    (nextTabs: TabConfig[], nextLayout: Record<string, FieldDefinition[]>) => {
      setTabs(nextTabs);
      setFieldLayout(nextLayout);
      onChange(nextTabs, nextLayout);
    },
    [onChange]
  );

  // ─── Tab actions ───────────────────────────────────────────────────────

  const handleAddTab = (): void => {
    const name = newTabName.trim();
    if (!name) return;
    const id = generateTabId(name);
    if (tabs.some((t) => t.id === id)) return;

    const maxPos = Math.max(...tabs.map((t) => t.position ?? 0), 0);
    const newTab: TabConfig = {
      id,
      label: name,
      source: 'metabox',
      position: maxPos + 1,
      dynamic: true,
      post_types: [postType],
    };

    const nextTabs = [...tabs, newTab];
    const nextLayout = { ...fieldLayout, [id]: [] };
    emit(nextTabs, nextLayout);
    setSelectedTabId(id);
    setAddingTab(false);
    setNewTabName('');
  };

  const handleDeleteTab = (tabId: string): void => {
    if (HARDCODED_TAB_IDS.has(tabId)) return;
    const nextTabs = tabs.filter((t) => t.id !== tabId);
    const nextLayout = { ...fieldLayout };
    delete nextLayout[tabId];
    emit(nextTabs, nextLayout);
    if (selectedTabId === tabId) {
      setSelectedTabId(nextTabs.find((t) => !HARDCODED_TAB_IDS.has(t.id))?.id ?? nextTabs[0]?.id ?? null);
    }
  };

  const handleRenameTab = (tabId: string): void => {
    const name = renameValue.trim();
    if (!name) { setRenamingTabId(null); return; }
    const nextTabs = tabs.map((t) =>
      t.id === tabId ? { ...t, label: name } : t
    );
    emit(nextTabs, fieldLayout);
    setRenamingTabId(null);
  };

  const handleMoveTab = (tabId: string, direction: 'up' | 'down'): void => {
    const sorted = [...tabs].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const idx = sorted.findIndex((t) => t.id === tabId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    // Swap positions
    const posA = sorted[idx].position ?? idx;
    const posB = sorted[swapIdx].position ?? swapIdx;
    const nextTabs = tabs.map((t) => {
      if (t.id === sorted[idx].id) return { ...t, position: posB };
      if (t.id === sorted[swapIdx].id) return { ...t, position: posA };
      return t;
    });
    emit(nextTabs, fieldLayout);
  };

  // ─── Field actions ─────────────────────────────────────────────────────

  const selectedFields = useMemo(
    () => (selectedTabId ? fieldLayout[selectedTabId] ?? [] : []),
    [selectedTabId, fieldLayout]
  );

  const usedFieldKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const fields of Object.values(fieldLayout)) {
      for (const f of fields) keys.add(f.key);
    }
    return keys;
  }, [fieldLayout]);

  const filteredAvailableFields = useMemo(() => {
    const q = fieldSearchQuery.toLowerCase();
    return availableFields.filter(
      (f) => !usedFieldKeys.has(f.key) &&
        (f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q))
    );
  }, [availableFields, usedFieldKeys, fieldSearchQuery]);

  const updateFields = useCallback(
    (tabId: string, fields: FieldDefinition[]) => {
      const nextLayout = { ...fieldLayout, [tabId]: fields };
      emit(tabs, nextLayout);
    },
    [tabs, fieldLayout, emit]
  );

  const handleAddField = (field: MappableField): void => {
    if (!selectedTabId || HARDCODED_TAB_IDS.has(selectedTabId)) return;
    const newField: FieldDefinition = {
      key: field.key,
      label: field.label,
      type: 'text',
      width: 'full',
    };
    updateFields(selectedTabId, [...selectedFields, newField]);
    setShowFieldSearch(false);
    setFieldSearchQuery('');
  };

  const handleRemoveField = (idx: number): void => {
    if (!selectedTabId) return;
    const next = selectedFields.filter((_, i) => i !== idx);
    updateFields(selectedTabId, next);
  };

  const handleMoveField = (idx: number, direction: 'up' | 'down'): void => {
    if (!selectedTabId) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= selectedFields.length) return;
    const next = [...selectedFields];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    updateFields(selectedTabId, next);
  };

  const handleUpdateField = (idx: number, patch: Partial<FieldDefinition>): void => {
    if (!selectedTabId) return;
    const next = selectedFields.map((f, i) => (i === idx ? { ...f, ...patch } : f));
    updateFields(selectedTabId, next);
  };

  // ─── Render ────────────────────────────────────────────────────────────

  const sortedTabs = useMemo(
    () => [...tabs].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [tabs]
  );

  const isCoreTabs = selectedTabId ? HARDCODED_TAB_IDS.has(selectedTabId) : false;

  return (
    <div className="flex gap-6 min-h-[500px]">
      {/* Left Panel — Tab list */}
      <div className="w-64 flex-shrink-0">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Tabs</p>
        <div className="space-y-1">
          {sortedTabs.map((tab, idx) => {
            const isCore = HARDCODED_TAB_IDS.has(tab.id);
            const isSelected = selectedTabId === tab.id;
            const isRenaming = renamingTabId === tab.id;

            return (
              <div
                key={tab.id}
                className={cn(
                  'group flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors',
                  isSelected
                    ? 'bg-brand-50 border-brand-300 text-brand-900'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                )}
                onClick={() => setSelectedTabId(tab.id)}
              >
                {isCore && <Lock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}

                {isRenaming ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameTab(tab.id);
                      if (e.key === 'Escape') setRenamingTabId(null);
                    }}
                    onBlur={() => handleRenameTab(tab.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 text-sm bg-transparent border-b border-brand-400 outline-none px-0 py-0"
                  />
                ) : (
                  <span className="flex-1 text-sm font-medium truncate">{tab.label}</span>
                )}

                {!isCore && !isRenaming && (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingTabId(tab.id);
                        setRenameValue(tab.label);
                      }}
                      className="p-0.5 rounded hover:bg-brand-100"
                      title="Rename"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleMoveTab(tab.id, 'up'); }}
                      disabled={idx === 0}
                      className="p-0.5 rounded hover:bg-brand-100 disabled:opacity-30"
                      title="Move up"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleMoveTab(tab.id, 'down'); }}
                      disabled={idx === sortedTabs.length - 1}
                      className="p-0.5 rounded hover:bg-brand-100 disabled:opacity-30"
                      title="Move down"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteTab(tab.id); }}
                      className="p-0.5 rounded hover:bg-red-100 text-gray-400 hover:text-red-600"
                      title="Delete tab"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add Tab */}
        {addingTab ? (
          <div className="mt-3 flex items-center gap-2">
            <input
              autoFocus
              value={newTabName}
              onChange={(e) => setNewTabName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddTab();
                if (e.key === 'Escape') { setAddingTab(false); setNewTabName(''); }
              }}
              placeholder="Tab name..."
              className="flex-1 text-sm px-2 py-1.5 rounded border border-gray-300 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none"
            />
            <button
              onClick={handleAddTab}
              disabled={!newTabName.trim()}
              className="p-1.5 rounded bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAddingTab(true)}
            className="mt-3 flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-500 hover:text-brand-600 hover:bg-gray-50 rounded-lg border border-dashed border-gray-300 hover:border-brand-300 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Tab
          </button>
        )}
      </div>

      {/* Right Panel — Fields for selected tab */}
      <div className="flex-1 min-w-0">
        {!selectedTabId ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Select a tab to configure its fields
          </div>
        ) : isCoreTabs ? (
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Fields — {tabs.find((t) => t.id === selectedTabId)?.label}
              </p>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-xs text-gray-500">
                <Lock className="w-3 h-3" />
                {selectedTabId === 'seo' ? 'SEOPress plugin' : 'Core tab'}
              </span>
            </div>
            <div className="space-y-2 opacity-50 pointer-events-none select-none">
              {(CORE_TAB_FIELDS[selectedTabId] ?? []).map((field, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-lg"
                >
                  <span className="flex-1 text-sm text-gray-600">{field.label}</span>
                  <span className="text-xs px-2 py-1 rounded border border-gray-200 bg-gray-50 text-gray-500">
                    {field.type}
                  </span>
                  {field.note && (
                    <span className="text-xs text-gray-400 max-w-[180px] truncate">{field.note}</span>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-gray-400 text-center">
              {selectedTabId === 'seo'
                ? 'This tab is provided by the SEOPress plugin and cannot be edited here.'
                : 'This is a core tab and cannot be edited in Tab Layout.'}
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Fields — {tabs.find((t) => t.id === selectedTabId)?.label}
              </p>
              <div className="relative">
                <button
                  onClick={() => setShowFieldSearch(!showFieldSearch)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-brand-600 hover:bg-brand-50 rounded-lg border border-brand-200 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Field
                </button>

                {showFieldSearch && (
                  <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-64 overflow-hidden flex flex-col">
                    <div className="p-2 border-b border-gray-100">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input
                          autoFocus
                          value={fieldSearchQuery}
                          onChange={(e) => setFieldSearchQuery(e.target.value)}
                          placeholder="Search fields..."
                          className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded focus:border-brand-400 outline-none"
                        />
                      </div>
                    </div>
                    <div className="overflow-y-auto max-h-48">
                      {filteredAvailableFields.length === 0 ? (
                        <p className="p-3 text-sm text-gray-400 text-center">No fields available</p>
                      ) : (
                        filteredAvailableFields.map((field) => (
                          <button
                            key={field.key}
                            onClick={() => handleAddField(field)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
                          >
                            <span className="truncate">{field.label}</span>
                            <code className="text-xs text-gray-400 font-mono flex-shrink-0 ml-2">
                              {field.key}
                            </code>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {selectedFields.length === 0 ? (
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center">
                <p className="text-sm text-gray-400">No fields yet. Click &quot;Add Field&quot; to get started.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {selectedFields.map((field, idx) => (
                  <div
                    key={field.key}
                    className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-lg group"
                  >
                    {/* Reorder buttons */}
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => handleMoveField(idx, 'up')}
                        disabled={idx === 0}
                        className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30"
                      >
                        <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                      </button>
                      <button
                        onClick={() => handleMoveField(idx, 'down')}
                        disabled={idx === selectedFields.length - 1}
                        className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30"
                      >
                        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                      </button>
                    </div>

                    {/* Label */}
                    <input
                      value={field.label}
                      onChange={(e) => handleUpdateField(idx, { label: e.target.value })}
                      className="flex-1 text-sm px-2 py-1 rounded border border-transparent hover:border-gray-200 focus:border-brand-400 outline-none"
                    />

                    {/* Type dropdown */}
                    <select
                      value={field.type}
                      onChange={(e) => handleUpdateField(idx, { type: e.target.value as FieldDefinition['type'] })}
                      className="text-xs px-2 py-1 rounded border border-gray-200 bg-gray-50 text-gray-600"
                    >
                      {FIELD_TYPE_OPTIONS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>

                    {/* Width dropdown */}
                    <select
                      value={field.width ?? 'full'}
                      onChange={(e) => handleUpdateField(idx, { width: e.target.value as FieldDefinition['width'] })}
                      className="text-xs px-2 py-1 rounded border border-gray-200 bg-gray-50 text-gray-600"
                    >
                      {WIDTH_OPTIONS.map((w) => (
                        <option key={w.value} value={w.value}>{w.label}</option>
                      ))}
                    </select>

                    {/* Key badge */}
                    <code className="text-xs text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded max-w-[120px] truncate">
                      {field.key}
                    </code>

                    {/* Remove */}
                    <button
                      onClick={() => handleRemoveField(idx)}
                      className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove field"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
