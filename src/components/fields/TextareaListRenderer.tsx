'use client';

import type { FieldRendererProps } from './types';

export function TextareaListRenderer({ field, value, onChange }: FieldRendererProps) {
  const separator = field.separator ?? '\n';
  const items = Array.isArray(value) ? value : [];
  const displayValue = items.join(separator);

  const handleChange = (text: string) => {
    const newItems = text.split(separator).filter(Boolean);
    onChange(newItems);
  };

  return (
    <textarea
      value={displayValue}
      onChange={(e) => handleChange(e.target.value)}
      rows={field.rows ?? 3}
      placeholder={field.placeholder ?? `One item per line...`}
      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
    />
  );
}
