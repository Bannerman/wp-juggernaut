'use client';

import type { FieldRendererProps } from './types';

export function TextareaRenderer({ field, value, onChange }: FieldRendererProps) {
  return (
    <textarea
      value={(value as string) ?? ''}
      onChange={(e) => onChange(e.target.value)}
      rows={field.rows ?? 3}
      placeholder={field.placeholder}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
    />
  );
}
