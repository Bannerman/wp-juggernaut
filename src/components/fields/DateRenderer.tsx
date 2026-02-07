'use client';

import type { FieldRendererProps } from './types';

export function DateRenderer({ field, value, onChange }: FieldRendererProps) {
  return (
    <input
      type="date"
      value={(value as string) ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
    />
  );
}
