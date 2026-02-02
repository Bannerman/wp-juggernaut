'use client';

import { useState } from 'react';
import { X, Save, AlertTriangle, Plus, Trash2, GripVertical } from 'lucide-react';
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

interface FeatureItem {
  feature_text: string;
  feature_icon?: string;
}

interface ChangelogItem {
  changelog_version: string;
  changelog_date: string;
  changelog_notes: string[];
}

interface DownloadLink {
  link_text: string;
  download_link_type: 'link' | 'upload';
  download_file_format?: number;
  download_link_url?: string;
  download_link_upload?: string;
}

interface DownloadSection {
  download_section_heading: string;
  download_section_color?: string;
  download_archive?: boolean;
  download_links: DownloadLink[];
}

const TABS = [
  { id: 'basic', label: 'Basic' },
  { id: 'content', label: 'Content' },
  { id: 'features', label: 'Features' },
  { id: 'classification', label: 'Classification' },
  { id: 'timer', label: 'Timer' },
  { id: 'downloads', label: 'Downloads' },
  { id: 'changelog', label: 'Changelog' },
];

const STATUS_OPTIONS = ['publish', 'draft', 'pending', 'private'];

// Conditional visibility constants from PHP
const BRACKET_RESOURCE_TYPE_ID = 417;
const SPORTS_TOPIC_ID = 432;

export function EditModal({ resource, terms, onClose, onSave }: EditModalProps) {
  const [activeTab, setActiveTab] = useState('basic');
  const [title, setTitle] = useState(resource.title);
  const [status, setStatus] = useState(resource.status);
  const [taxonomies, setTaxonomies] = useState<Record<string, number[]>>(resource.taxonomies);
  const [metaBox, setMetaBox] = useState<Record<string, unknown>>(resource.meta_box);
  const [isSaving, setIsSaving] = useState(false);

  // Derived state for conditional visibility
  const isBracketType = (taxonomies['resource-type'] || []).includes(BRACKET_RESOURCE_TYPE_ID);
  const hasSportsTopic = (taxonomies['topic'] || []).includes(SPORTS_TOPIC_ID);
  const timerEnabled = Boolean(metaBox.timer_enable);

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

  // Features helpers
  const features = (metaBox.group_features as FeatureItem[]) || [];
  const addFeature = () => {
    updateMetaField('group_features', [...features, { feature_text: '' }]);
  };
  const updateFeature = (index: number, text: string) => {
    const updated = [...features];
    updated[index] = { ...updated[index], feature_text: text };
    updateMetaField('group_features', updated);
  };
  const removeFeature = (index: number) => {
    updateMetaField('group_features', features.filter((_, i) => i !== index));
  };

  // Changelog helpers
  const changelog = (metaBox.group_changelog as ChangelogItem[]) || [];
  const addChangelogEntry = () => {
    updateMetaField('group_changelog', [...changelog, { changelog_version: '', changelog_date: '', changelog_notes: [] }]);
  };
  const updateChangelog = (index: number, field: keyof ChangelogItem, value: unknown) => {
    const updated = [...changelog];
    updated[index] = { ...updated[index], [field]: value };
    updateMetaField('group_changelog', updated);
  };
  const removeChangelog = (index: number) => {
    updateMetaField('group_changelog', changelog.filter((_, i) => i !== index));
  };

  // Download sections helpers
  const downloadSections = (metaBox.download_sections as DownloadSection[]) || [];
  const addDownloadSection = () => {
    updateMetaField('download_sections', [...downloadSections, { download_section_heading: '', download_links: [] }]);
  };
  const updateDownloadSection = (index: number, field: keyof DownloadSection, value: unknown) => {
    const updated = [...downloadSections];
    updated[index] = { ...updated[index], [field]: value };
    updateMetaField('download_sections', updated);
  };
  const removeDownloadSection = (index: number) => {
    updateMetaField('download_sections', downloadSections.filter((_, i) => i !== index));
  };
  const addDownloadLink = (sectionIndex: number) => {
    const updated = [...downloadSections];
    const links = updated[sectionIndex].download_links || [];
    updated[sectionIndex].download_links = [...links, { link_text: '', download_link_type: 'link' }];
    updateMetaField('download_sections', updated);
  };
  const updateDownloadLink = (sectionIndex: number, linkIndex: number, field: keyof DownloadLink, value: unknown) => {
    const updated = [...downloadSections];
    const links = [...(updated[sectionIndex].download_links || [])];
    links[linkIndex] = { ...links[linkIndex], [field]: value };
    updated[sectionIndex].download_links = links;
    updateMetaField('download_sections', updated);
  };
  const removeDownloadLink = (sectionIndex: number, linkIndex: number) => {
    const updated = [...downloadSections];
    updated[sectionIndex].download_links = updated[sectionIndex].download_links.filter((_, i) => i !== linkIndex);
    updateMetaField('download_sections', updated);
  };

  // Taxonomy renderer with conditional visibility
  const renderTaxonomy = (taxonomy: string, label: string, required = false) => {
    const taxonomyTerms = terms[taxonomy] || [];
    const selectedIds = taxonomies[taxonomy] || [];
    if (taxonomyTerms.length === 0) return null;

    return (
      <div key={taxonomy}>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 border border-gray-200 rounded-lg bg-gray-50">
          {taxonomyTerms.map((term) => {
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
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />

      <div className="relative min-h-full flex items-center justify-center p-4">
        <div className="relative bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Edit Resource</h2>
              <p className="text-sm text-gray-500">ID: {resource.id}</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200 px-6">
            <nav className="flex gap-4 -mb-px overflow-x-auto">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'py-3 px-1 text-sm font-medium border-b-2 whitespace-nowrap transition-colors',
                    activeTab === tab.id
                      ? 'border-brand-500 text-brand-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="px-6 py-4 overflow-y-auto max-h-[calc(90vh-12rem)]">
            {/* Basic Tab */}
            {activeTab === 'basic' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Content Tab */}
            {activeTab === 'content' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Intro Text</label>
                  <textarea
                    value={(metaBox.intro_text as string) || ''}
                    onChange={(e) => updateMetaField('intro_text', e.target.value)}
                    rows={3}
                    placeholder="Introduction paragraph..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Main Content Text</label>
                  <textarea
                    value={(metaBox.text_content as string) || ''}
                    onChange={(e) => updateMetaField('text_content', e.target.value)}
                    rows={6}
                    placeholder="Main content..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Additional Content</label>
                  <textarea
                    value={(metaBox.text_ as string) || ''}
                    onChange={(e) => updateMetaField('text_', e.target.value)}
                    rows={4}
                    placeholder="Additional content block..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>
              </div>
            )}

            {/* Features Tab */}
            {activeTab === 'features' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">Feature List</label>
                  <button onClick={addFeature} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700">
                    <Plus className="w-4 h-4" /> Add Feature
                  </button>
                </div>
                {features.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">No features added yet.</p>
                ) : (
                  <div className="space-y-2">
                    {features.map((feature, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <GripVertical className="w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          value={feature.feature_text}
                          onChange={(e) => updateFeature(index, e.target.value)}
                          placeholder="Feature description..."
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500"
                        />
                        <button onClick={() => removeFeature(index)} className="p-2 text-red-500 hover:bg-red-50 rounded">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Classification Tab */}
            {activeTab === 'classification' && (
              <div className="space-y-4">
                {renderTaxonomy('resource-type', 'Resource Type', true)}
                {renderTaxonomy('intent', 'Intent')}
                {renderTaxonomy('topic', 'Topic')}
                {renderTaxonomy('audience', 'Audience')}
                
                {/* Conditional: Bracket Size (visible when resource-type = 417) */}
                {isBracketType && renderTaxonomy('bracket-size', 'Bracket Size', true)}
                
                {/* Conditional: League & Competition Format (visible when topic contains 432) */}
                {hasSportsTopic && (
                  <>
                    {renderTaxonomy('leagues', 'League', true)}
                    {renderTaxonomy('competition_format', 'Competition Format')}
                  </>
                )}
              </div>
            )}

            {/* Timer Tab */}
            {activeTab === 'timer' && (
              <div className="space-y-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={timerEnabled}
                    onChange={(e) => updateMetaField('timer_enable', e.target.checked)}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Enable Timer</span>
                </label>

                {timerEnabled && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Timer Title</label>
                      <input
                        type="text"
                        value={(metaBox.timer_title as string) || ''}
                        onChange={(e) => updateMetaField('timer_title', e.target.value)}
                        placeholder="e.g., TOURNAMENT STARTS"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Timer Date/Time</label>
                      <input
                        type="datetime-local"
                        value={(metaBox.timer_single_datetime as string)?.slice(0, 16) || ''}
                        onChange={(e) => updateMetaField('timer_single_datetime', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Downloads Tab */}
            {activeTab === 'downloads' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">Download Sections</label>
                  <button onClick={addDownloadSection} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700">
                    <Plus className="w-4 h-4" /> Add Section
                  </button>
                </div>
                {downloadSections.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">No download sections added yet.</p>
                ) : (
                  <div className="space-y-4">
                    {downloadSections.map((section, sectionIndex) => (
                      <div key={sectionIndex} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                        <div className="flex items-start justify-between mb-3">
                          <input
                            type="text"
                            value={section.download_section_heading}
                            onChange={(e) => updateDownloadSection(sectionIndex, 'download_section_heading', e.target.value)}
                            placeholder="Section heading..."
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500"
                          />
                          <button onClick={() => removeDownloadSection(sectionIndex)} className="ml-2 p-2 text-red-500 hover:bg-red-50 rounded">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="flex items-center gap-4 mb-4">
                          <input
                            type="color"
                            value={section.download_section_color || '#3B82F6'}
                            onChange={(e) => updateDownloadSection(sectionIndex, 'download_section_color', e.target.value)}
                            className="w-10 h-10 rounded cursor-pointer"
                          />
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={section.download_archive || false}
                              onChange={(e) => updateDownloadSection(sectionIndex, 'download_archive', e.target.checked)}
                              className="rounded border-gray-300 text-brand-600"
                            />
                            <span className="text-sm text-gray-700">Archive Download</span>
                          </label>
                        </div>

                        {/* Download Links within section */}
                        <div className="border-t border-gray-200 pt-3 mt-3">
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-medium text-gray-600 uppercase">Download Links</label>
                            <button onClick={() => addDownloadLink(sectionIndex)} className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700">
                              <Plus className="w-3 h-3" /> Add Link
                            </button>
                          </div>
                          {(section.download_links || []).length === 0 ? (
                            <p className="text-xs text-gray-400 italic">No download links in this section.</p>
                          ) : (
                            <div className="space-y-3">
                              {(section.download_links || []).map((link, linkIndex) => (
                                <div key={linkIndex} className="bg-white border border-gray-200 rounded p-3">
                                  <div className="flex items-start gap-2 mb-2">
                                    <input
                                      type="text"
                                      value={link.link_text}
                                      onChange={(e) => updateDownloadLink(sectionIndex, linkIndex, 'link_text', e.target.value)}
                                      placeholder="Link text..."
                                      className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-brand-500"
                                    />
                                    <button onClick={() => removeDownloadLink(sectionIndex, linkIndex)} className="p-1 text-red-500 hover:bg-red-50 rounded">
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <select
                                      value={link.download_link_type}
                                      onChange={(e) => updateDownloadLink(sectionIndex, linkIndex, 'download_link_type', e.target.value)}
                                      className="text-xs px-2 py-1 border border-gray-300 rounded"
                                    >
                                      <option value="link">External Link</option>
                                      <option value="upload">Upload File</option>
                                    </select>
                                    {link.download_link_type === 'link' && (
                                      <input
                                        type="url"
                                        value={link.download_link_url || ''}
                                        onChange={(e) => updateDownloadLink(sectionIndex, linkIndex, 'download_link_url', e.target.value)}
                                        placeholder="https://..."
                                        className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-brand-500"
                                      />
                                    )}
                                    {link.download_link_type === 'upload' && (
                                      <span className="text-xs text-gray-500 italic">File upload managed in WordPress</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Changelog Tab */}
            {activeTab === 'changelog' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">Changelog</label>
                  <button onClick={addChangelogEntry} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700">
                    <Plus className="w-4 h-4" /> Add Version
                  </button>
                </div>
                {changelog.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">No changelog entries yet.</p>
                ) : (
                  <div className="space-y-4">
                    {changelog.map((entry, index) => (
                      <div key={index} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex gap-3 flex-1">
                            <input
                              type="text"
                              value={entry.changelog_version}
                              onChange={(e) => updateChangelog(index, 'changelog_version', e.target.value)}
                              placeholder="v1.0"
                              className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500"
                            />
                            <input
                              type="date"
                              value={entry.changelog_date}
                              onChange={(e) => updateChangelog(index, 'changelog_date', e.target.value)}
                              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500"
                            />
                          </div>
                          <button onClick={() => removeChangelog(index)} className="ml-2 p-2 text-red-500 hover:bg-red-50 rounded">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <textarea
                          value={(entry.changelog_notes || []).join('\n')}
                          onChange={(e) => updateChangelog(index, 'changelog_notes', e.target.value.split('\n').filter(Boolean))}
                          placeholder="Notes (one per line)..."
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
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
