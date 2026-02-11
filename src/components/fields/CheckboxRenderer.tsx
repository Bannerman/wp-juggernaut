'use client';

import type { FieldRendererProps } from './types';

export function CheckboxRenderer({ field, value, onChange }: FieldRendererProps) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
      />
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{field.label}</span>
    </label>
  );
}
