'use client';

import type { FieldRendererProps } from './types';

export function UrlRenderer({ field, value, onChange }: FieldRendererProps) {
  return (
    <input
      type="url"
      value={(value as string) ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder ?? 'https://...'}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-mono text-sm"
    />
  );
}
