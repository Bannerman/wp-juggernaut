'use client';

import type { FieldRendererProps } from './types';

export function DateTimeRenderer({ field, value, onChange }: FieldRendererProps) {
  // Slice to 16 chars to match datetime-local format (YYYY-MM-DDTHH:MM)
  const displayValue = typeof value === 'string' ? value.slice(0, 16) : '';

  return (
    <input
      type="datetime-local"
      value={displayValue}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
    />
  );
}
