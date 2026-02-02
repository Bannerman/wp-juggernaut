'use client';

import { useState } from 'react';
import { X, Save, AlertTriangle } from 'lucide-react';
import { cn, TAXONOMY_LABELS } from '@/lib/utils';

interface Term {
  id: number;
  taxonomy: string;
  name: string;
  slug: string;
  parent_id: number;
}

interface Resource {
  id: number;
  title: string;
  slug: string;
  status: string;
  modified_gmt: string;
  is_dirty: boolean;
  taxonomies: Record<string, number[]>;
  meta_box: Record<string, unknown>;
}

interface EditModalProps {
  resource: Resource;
  terms: Record<string, Term[]>;
  onClose: () => void;
  onSave: (updates: Partial<Resource>) => void;
}

const EDITABLE_TAXONOMIES = [
  'resource-type',
  'topic',
  'intent',
  'audience',
  'leagues',
  'access_level',
  'competition_format',
  'bracket-size',
  'file_format',
];

const STATUS_OPTIONS = ['publish', 'draft', 'pending', 'private'];

export function EditModal({ resource, terms, onClose, onSave }: EditModalProps) {
  const [title, setTitle] = useState(resource.title);
  const [status, setStatus] = useState(resource.status);
  const [taxonomies, setTaxonomies] = useState<Record<string, number[]>>(resource.taxonomies);
  const [metaBox, setMetaBox] = useState<Record<string, unknown>>(resource.meta_box);
  const [isSaving, setIsSaving] = useState(false);

  const hasChanges =
    title !== resource.title ||
    status !== resource.status ||
    JSON.stringify(taxonomies) !== JSON.stringify(resource.taxonomies) ||
    JSON.stringify(metaBox) !== JSON.stringify(resource.meta_box);

  const handleSave = async () => {
    if (!hasChanges) {
      onClose();
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        title,
        status,
        taxonomies,
        meta_box: metaBox,
      });
    } finally {
      setIsSaving(false);
    }
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
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Edit Resource</h2>
              <p className="text-sm text-gray-500">ID: {resource.id}</p>
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
                    Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
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
                  Meta Box Fields
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Timer Date/Time
                    </label>
                    <input
                      type="datetime-local"
                      value={(metaBox.timer_single_datetime as string)?.slice(0, 16) || ''}
                      onChange={(e) => updateMetaField('timer_single_datetime', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>
              </div>

              {/* Taxonomies */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-900 border-b border-gray-200 pb-2">
                  Taxonomies
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
                                    ? 'bg-brand-100 border-brand-300 text-brand-700'
                                    : 'bg-white border-gray-300 text-gray-700 hover:border-brand-300'
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
            <div className="flex items-center gap-2">
              {hasChanges && (
                <>
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm text-yellow-700">Unsaved changes</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                  hasChanges
                    ? 'bg-brand-600 text-white hover:bg-brand-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                )}
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
