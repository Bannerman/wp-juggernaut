'use client';

import type { FieldRendererProps } from './types';

export function NumberRenderer({ field, value, onChange }: FieldRendererProps) {
  return (
    <input
      type="number"
      value={(value as number) ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      placeholder={field.placeholder}
      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
    />
  );
}
