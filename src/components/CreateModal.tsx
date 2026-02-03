'use client';

import { useState } from 'react';
import { X, Save, Plus } from 'lucide-react';
import { cn, TAXONOMY_LABELS } from '@/lib/utils';

interface Term {
  id: number;
  taxonomy: string;
  name: string;
  slug: string;
  parent_id: number;
}

interface CreateModalProps {
  terms: Record<string, Term[]>;
  onClose: () => void;
  onSave: (data: {
    title: string;
    status: string;
    taxonomies: Record<string, number[]>;
    meta_box: Record<string, unknown>;
  }) => void;
  isCreating: boolean;
}

const EDITABLE_TAXONOMIES = [
  'resource-type',
  'topic',
  'intent',
  'audience',
  'leagues',
  'competition_format',
  'bracket-size',
  'file_format',
];

const STATUS_OPTIONS = ['publish', 'draft', 'pending', 'private'];

export function CreateModal({ terms, onClose, onSave, isCreating }: CreateModalProps) {
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('draft');
  const [taxonomies, setTaxonomies] = useState<Record<string, number[]>>({});
  const [metaBox, setMetaBox] = useState<Record<string, unknown>>({});

  const canSave = title.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      title,
      status,
      taxonomies,
      meta_box: metaBox,
    });
  };

  const toggleTerm = (taxonomy: string, termId: number) => {
    const current = taxonomies[taxonomy] || [];
    const updated = current.includes(termId)
      ? current.filter((id) => id !== termId)
      : [...current, termId];
    
    setTaxonomies({ ...taxonomies, [taxonomy]: updated });
  };

  const updateMetaField = (field: string, value: unknown) => {
    setMetaBox({ ...metaBox, [field]: value });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative min-h-full flex items-center justify-center p-4">
        <div className="relative bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-green-50">
            <div className="flex items-center gap-3">
              <Plus className="w-6 h-6 text-green-600" />
              <h2 className="text-lg font-semibold text-gray-900">Create New Resource</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-4 overflow-y-auto max-h-[calc(90vh-8rem)]">
            <div className="space-y-6">
              {/* Basic Fields */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter resource title..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt.charAt(0).toUpperCase() + opt.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Meta Box Fields */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-900 border-b border-gray-200 pb-2">
                  Meta Fields (Optional)
                </h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Intro Text
                  </label>
                  <textarea
                    value={(metaBox.intro_text as string) || ''}
                    onChange={(e) => updateMetaField('intro_text', e.target.value)}
                    rows={3}
                    placeholder="Introduction paragraph..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Timer Title
                    </label>
                    <input
                      type="text"
                      value={(metaBox.timer_title as string) || ''}
                      onChange={(e) => updateMetaField('timer_title', e.target.value)}
                      placeholder="e.g., TOURNAMENT STARTS"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Timer Date/Time
                    </label>
                    <input
                      type="datetime-local"
                      value={(metaBox.timer_single_datetime as string) || ''}
                      onChange={(e) => updateMetaField('timer_single_datetime', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Text Content
                  </label>
                  <textarea
                    value={(metaBox.text_content as string) || ''}
                    onChange={(e) => updateMetaField('text_content', e.target.value)}
                    rows={4}
                    placeholder="Main content..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>
              </div>

              {/* Taxonomies */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-900 border-b border-gray-200 pb-2">
                  Taxonomies (Optional)
                </h3>

                {EDITABLE_TAXONOMIES.map((taxonomy) => {
                  const taxonomyTerms = terms[taxonomy] || [];
                  const selectedIds = taxonomies[taxonomy] || [];

                  if (taxonomyTerms.length === 0) return null;

                  return (
                    <div key={taxonomy}>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {TAXONOMY_LABELS[taxonomy] || taxonomy}
                      </label>
                      <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 border border-gray-200 rounded-lg bg-gray-50">
                        {taxonomyTerms
                          .filter((term) => term.parent_id === 0 || taxonomy !== 'topic')
                          .map((term) => {
                            const isSelected = selectedIds.includes(term.id);
                            return (
                              <button
                                key={term.id}
                                type="button"
                                onClick={() => toggleTerm(taxonomy, term.id)}
                                className={cn(
                                  'px-3 py-1 rounded-full text-sm border transition-colors',
                                  isSelected
                                    ? 'bg-green-100 border-green-300 text-green-700'
                                    : 'bg-white border-gray-300 text-gray-700 hover:border-green-300'
                                )}
                              >
                                {term.name}
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
            <p className="text-sm text-gray-500">
              Resource will be created in WordPress immediately
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!canSave || isCreating}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                  canSave
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                )}
              >
                <Save className="w-4 h-4" />
                {isCreating ? 'Creating...' : 'Create Resource'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
