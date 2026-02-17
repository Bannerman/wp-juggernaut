'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronUp, ChevronDown, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  date_gmt: string;
  modified_gmt: string;
  is_dirty: boolean;
  taxonomies: Record<string, number[]>;
  meta_box: Record<string, unknown>;
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
  download_version?: string;
  download_section_color?: string;
  download_archive?: boolean;
  download_links: DownloadLink[];
}

interface DownloadRow {
  resourceId: number;
  sectionIndex: number;
  linkIndex: number;
  resourceTitle: string;
  sectionHeading: string;
  downloadVersion: string;
  isArchived: boolean;
  linkText: string;
  fileFormat: number | undefined;
  linkType: string;
  url: string;
}

interface EditingCell {
  resourceId: number;
  sectionIndex: number;
  linkIndex: number;
  field: string;
}

type DownloadSortField = 'resourceTitle' | 'sectionHeading' | 'downloadVersion' | 'linkText' | 'fileFormat' | 'linkType' | 'url' | 'isArchived';
type SortDirection = 'asc' | 'desc';

interface DownloadsTableProps {
  resources: Resource[];
  terms: Record<string, Term[]>;
  onUpdate: (id: number, updates: Partial<Resource>) => void;
  onEdit: (resource: Resource) => void;
}

function flattenDownloadRows(resources: Resource[]): DownloadRow[] {
  const rows: DownloadRow[] = [];

  for (const resource of resources) {
    const sections = (resource.meta_box?.download_sections as DownloadSection[]) || [];

    for (let si = 0; si < sections.length; si++) {
      const section = sections[si];
      const links = section.download_links || [];

      for (let li = 0; li < links.length; li++) {
        const link = links[li];
        rows.push({
          resourceId: resource.id,
          sectionIndex: si,
          linkIndex: li,
          resourceTitle: resource.title,
          sectionHeading: section.download_section_heading || '',
          downloadVersion: section.download_version || '',
          isArchived: !!section.download_archive,
          linkText: link.link_text || '',
          fileFormat: link.download_file_format,
          linkType: link.download_link_type || 'link',
          url: link.download_link_url || link.download_link_upload || '',
        });
      }
    }
  }

  return rows;
}

function InlineInput({
  value,
  onSave,
  onCancel,
  type = 'text',
}: {
  value: string;
  onSave: (val: string) => void;
  onCancel: () => void;
  type?: 'text' | 'url';
}) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSave(draft);
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <input
      ref={inputRef}
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onSave(draft)}
      onKeyDown={handleKeyDown}
      className="w-full px-2 py-1 text-sm rounded border border-brand-400 dark:border-brand-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
    />
  );
}

export function DownloadsTable({ resources, terms, onUpdate, onEdit }: DownloadsTableProps) {
  const [sortField, setSortField] = useState<DownloadSortField>('resourceTitle');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);

  const fileFormatTerms = terms['file_format'] || [];

  const resolveFormatName = (termId: number | undefined): string => {
    if (termId === undefined) return '';
    return fileFormatTerms.find((t) => t.id === termId)?.name || '';
  };

  const rows = flattenDownloadRows(resources);

  const sortedRows = [...rows].sort((a, b) => {
    let comparison = 0;
    switch (sortField) {
      case 'resourceTitle':
        comparison = a.resourceTitle.localeCompare(b.resourceTitle);
        break;
      case 'sectionHeading':
        comparison = a.sectionHeading.localeCompare(b.sectionHeading);
        break;
      case 'downloadVersion':
        comparison = a.downloadVersion.localeCompare(b.downloadVersion);
        break;
      case 'linkText':
        comparison = a.linkText.localeCompare(b.linkText);
        break;
      case 'fileFormat':
        comparison = resolveFormatName(a.fileFormat).localeCompare(resolveFormatName(b.fileFormat));
        break;
      case 'linkType':
        comparison = a.linkType.localeCompare(b.linkType);
        break;
      case 'url':
        comparison = a.url.localeCompare(b.url);
        break;
      case 'isArchived':
        comparison = Number(a.isArchived) - Number(b.isArchived);
        break;
    }
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const handleSort = (field: DownloadSortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ field }: { field: DownloadSortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? (
      <ChevronUp className="w-3.5 h-3.5" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5" />
    );
  };

  const isEditing = (row: DownloadRow, field: string): boolean => {
    if (!editingCell) return false;
    return (
      editingCell.resourceId === row.resourceId &&
      editingCell.sectionIndex === row.sectionIndex &&
      editingCell.linkIndex === row.linkIndex &&
      editingCell.field === field
    );
  };

  const startEditing = (row: DownloadRow, field: string) => {
    setEditingCell({
      resourceId: row.resourceId,
      sectionIndex: row.sectionIndex,
      linkIndex: row.linkIndex,
      field,
    });
  };

  const handleCellSave = (row: DownloadRow, field: string, value: string | number | boolean) => {
    setEditingCell(null);

    const resource = resources.find((r) => r.id === row.resourceId);
    if (!resource) return;

    const sections: DownloadSection[] = JSON.parse(
      JSON.stringify(resource.meta_box?.download_sections || [])
    );
    const section = sections[row.sectionIndex];
    if (!section) return;

    // Section-level fields
    if (field === 'sectionHeading') {
      section.download_section_heading = value as string;
    } else if (field === 'downloadVersion') {
      section.download_version = value as string;
    } else if (field === 'isArchived') {
      section.download_archive = value as boolean;
    } else {
      // Link-level fields
      const link = section.download_links?.[row.linkIndex];
      if (!link) return;

      if (field === 'linkText') {
        link.link_text = value as string;
      } else if (field === 'fileFormat') {
        link.download_file_format = value as number;
      } else if (field === 'linkType') {
        link.download_link_type = value as 'link' | 'upload';
      } else if (field === 'url') {
        if (link.download_link_type === 'upload') {
          link.download_link_upload = value as string;
        } else {
          link.download_link_url = value as string;
        }
      }
    }

    onUpdate(row.resourceId, { meta_box: { download_sections: sections } });
  };

  const thClass =
    'px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 select-none';

  if (rows.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-12 flex flex-col items-center justify-center text-center">
        <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-full mb-4">
          <Inbox className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
          No downloads found
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
          Resources with download sections will appear here. Add download sections to resources via the Edit modal.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full table-fixed">
          <colgroup>
            <col style={{ width: '16%' }} />   {/* Resource */}
            <col style={{ width: '14%' }} />   {/* Section */}
            <col style={{ width: '5%' }} />    {/* Version */}
            <col style={{ width: '12%' }} />   {/* Link Text */}
            <col style={{ width: '9%' }} />    {/* Format */}
            <col style={{ width: '5%' }} />    {/* Type */}
            <col style={{ width: '34%' }} />   {/* URL */}
            <col style={{ width: '5%' }} />    {/* Archived */}
          </colgroup>
          <thead className="bg-gray-50 dark:bg-gray-800/80 border-b-[3px] border-b-gray-400 dark:border-b-gray-500">
            <tr>
              <th className={thClass} onClick={() => handleSort('resourceTitle')}>
                <div className="flex items-center gap-1">
                  Resource
                  <SortIcon field="resourceTitle" />
                </div>
              </th>
              <th className={thClass} onClick={() => handleSort('sectionHeading')}>
                <div className="flex items-center gap-1">
                  Section
                  <SortIcon field="sectionHeading" />
                </div>
              </th>
              <th className={thClass} onClick={() => handleSort('downloadVersion')}>
                <div className="flex items-center gap-1">
                  Ver.
                  <SortIcon field="downloadVersion" />
                </div>
              </th>
              <th className={thClass} onClick={() => handleSort('linkText')}>
                <div className="flex items-center gap-1">
                  Link Text
                  <SortIcon field="linkText" />
                </div>
              </th>
              <th className={thClass} onClick={() => handleSort('fileFormat')}>
                <div className="flex items-center gap-1">
                  Format
                  <SortIcon field="fileFormat" />
                </div>
              </th>
              <th className={thClass} onClick={() => handleSort('linkType')}>
                <div className="flex items-center gap-1">
                  Type
                  <SortIcon field="linkType" />
                </div>
              </th>
              <th className={thClass} onClick={() => handleSort('url')}>
                <div className="flex items-center gap-1">
                  URL
                  <SortIcon field="url" />
                </div>
              </th>
              <th className={thClass} onClick={() => handleSort('isArchived')}>
                <div className="flex items-center gap-1">
                  Arch.
                  <SortIcon field="isArchived" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, idx) => {
              const resource = resources.find((r) => r.id === row.resourceId);
              const rowKey = `${row.resourceId}-${row.sectionIndex}-${row.linkIndex}`;

              // Visual grouping: hide duplicate resource/section when sorted by resource title
              const isGrouped = sortField === 'resourceTitle';
              const prevRow = idx > 0 ? sortedRows[idx - 1] : null;
              const sameResource = isGrouped && prevRow?.resourceId === row.resourceId;
              const sameSection = sameResource && prevRow?.sectionIndex === row.sectionIndex;
              const isNewResourceGroup = isGrouped && idx > 0 && !sameResource;
              const isNormalDivider = idx > 0 && !isNewResourceGroup;

              return (
                <tr
                  key={rowKey}
                  className={cn(
                    'hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors',
                    row.isArchived && 'opacity-60',
                    resource?.is_dirty && 'bg-yellow-50 dark:bg-yellow-900/20',
                    isNewResourceGroup && 'border-t-[3px] border-t-gray-400 dark:border-t-gray-500',
                    isNormalDivider && 'border-t border-t-gray-200 dark:border-t-gray-700'
                  )}
                >
                  {/* Resource Title — click to open EditModal */}
                  <td className="px-3 py-2.5 overflow-hidden">
                    {!sameResource ? (
                      <div className="flex items-center gap-1.5 min-w-0">
                        {resource?.is_dirty && (
                          <span className="w-2 h-2 bg-yellow-400 rounded-full flex-shrink-0" title="Unsaved changes" />
                        )}
                        <span
                          className="text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer hover:text-brand-600 dark:hover:text-brand-400 truncate"
                          title={row.resourceTitle}
                          onClick={() => resource && onEdit(resource)}
                        >
                          {row.resourceTitle}
                        </span>
                      </div>
                    ) : null}
                  </td>

                  {/* Section Heading — inline edit */}
                  <td className="px-3 py-2.5 overflow-hidden">
                    {sameSection ? null : isEditing(row, 'sectionHeading') ? (
                      <InlineInput
                        value={row.sectionHeading}
                        onSave={(val) => handleCellSave(row, 'sectionHeading', val)}
                        onCancel={() => setEditingCell(null)}
                      />
                    ) : (
                      <span
                        className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-1.5 py-0.5 -mx-1.5 truncate block"
                        title={row.sectionHeading || 'Click to edit'}
                        onClick={() => startEditing(row, 'sectionHeading')}
                      >
                        {row.sectionHeading || <span className="text-gray-400 italic">empty</span>}
                      </span>
                    )}
                  </td>

                  {/* Version — inline edit (section-level, collapse in group) */}
                  <td className="px-3 py-2.5">
                    {sameSection ? null : isEditing(row, 'downloadVersion') ? (
                      <InlineInput
                        value={row.downloadVersion}
                        onSave={(val) => handleCellSave(row, 'downloadVersion', val)}
                        onCancel={() => setEditingCell(null)}
                      />
                    ) : (
                      <span
                        className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-1.5 py-0.5 -mx-1.5"
                        title={row.downloadVersion || 'Click to edit'}
                        onClick={() => startEditing(row, 'downloadVersion')}
                      >
                        {row.downloadVersion || <span className="text-gray-400 italic">-</span>}
                      </span>
                    )}
                  </td>

                  {/* Link Text — inline edit */}
                  <td className="px-3 py-2.5 overflow-hidden">
                    {isEditing(row, 'linkText') ? (
                      <InlineInput
                        value={row.linkText}
                        onSave={(val) => handleCellSave(row, 'linkText', val)}
                        onCancel={() => setEditingCell(null)}
                      />
                    ) : (
                      <span
                        className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-1.5 py-0.5 -mx-1.5 truncate block"
                        title={row.linkText || 'Click to edit'}
                        onClick={() => startEditing(row, 'linkText')}
                      >
                        {row.linkText || <span className="text-gray-400 italic">empty</span>}
                      </span>
                    )}
                  </td>

                  {/* File Format — inline select */}
                  <td className="px-3 py-2.5">
                    {isEditing(row, 'fileFormat') ? (
                      <select
                        autoFocus
                        value={row.fileFormat ?? ''}
                        onChange={(e) => {
                          const val = e.target.value ? Number(e.target.value) : undefined;
                          if (val !== undefined) {
                            handleCellSave(row, 'fileFormat', val);
                          }
                        }}
                        onBlur={() => setEditingCell(null)}
                        className="w-full px-1.5 py-1 text-sm rounded border border-brand-400 dark:border-brand-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        <option value="">—</option>
                        {fileFormatTerms.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span
                        className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-1.5 py-0.5 -mx-1.5"
                        onClick={() => startEditing(row, 'fileFormat')}
                      >
                        {resolveFormatName(row.fileFormat) || <span className="text-gray-400 italic">-</span>}
                      </span>
                    )}
                  </td>

                  {/* Link Type — inline select */}
                  <td className="px-3 py-2.5">
                    {isEditing(row, 'linkType') ? (
                      <select
                        autoFocus
                        value={row.linkType}
                        onChange={(e) => handleCellSave(row, 'linkType', e.target.value)}
                        onBlur={() => setEditingCell(null)}
                        className="w-full px-1.5 py-1 text-sm rounded border border-brand-400 dark:border-brand-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        <option value="link">External Link</option>
                        <option value="upload">Upload File</option>
                      </select>
                    ) : (
                      <span
                        className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-1.5 py-0.5 -mx-1.5"
                        onClick={() => startEditing(row, 'linkType')}
                      >
                        {row.linkType === 'upload' ? 'Upload' : 'Link'}
                      </span>
                    )}
                  </td>

                  {/* URL — inline edit */}
                  <td className="px-3 py-2.5 overflow-hidden">
                    {isEditing(row, 'url') ? (
                      <InlineInput
                        value={row.url}
                        type="url"
                        onSave={(val) => handleCellSave(row, 'url', val)}
                        onCancel={() => setEditingCell(null)}
                      />
                    ) : (
                      <span
                        className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-1.5 py-0.5 -mx-1.5 truncate block"
                        title={row.url || 'Click to edit'}
                        onClick={() => startEditing(row, 'url')}
                      >
                        {row.url || <span className="text-gray-400 italic">empty</span>}
                      </span>
                    )}
                  </td>

                  {/* Archived — checkbox toggle (section-level, collapse in group) */}
                  <td className="px-3 py-2.5 text-center">
                    {sameSection ? null : (
                      <input
                        type="checkbox"
                        checked={row.isArchived}
                        onChange={(e) => handleCellSave(row, 'isArchived', e.target.checked)}
                        className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Table Footer */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 text-sm text-gray-500 dark:text-gray-400">
        {rows.length} download links across {new Set(rows.map((r) => r.resourceId)).size} resources
      </div>
    </div>
  );
}
