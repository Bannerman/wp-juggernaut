'use client';

import type { FieldRendererProps } from './types';

export function SelectRenderer({ field, value, onChange, terms }: FieldRendererProps) {
  // Build options from static config or taxonomy source
  let options: Array<{ value: string; label: string }> = [];

  if (field.taxonomy_source && terms) {
    const taxTerms = terms[field.taxonomy_source] || [];
    options = taxTerms.map((t) => ({ value: String(t.id), label: t.name }));
  } else if (field.options) {
    options = field.options;
  }

  return (
    <select
      value={value != null ? String(value) : ''}
      onChange={(e) => {
        const val = e.target.value;
        // For taxonomy-sourced selects, convert back to number if non-empty
        if (field.taxonomy_source && val) {
          onChange(Number(val));
        } else {
          onChange(val || undefined);
        }
      }}
      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
    >
      <option value="">None</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
