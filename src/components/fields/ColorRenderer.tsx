'use client';

import type { FieldRendererProps } from './types';

export function ColorRenderer({ value, onChange }: FieldRendererProps) {
  return (
    <input
      type="color"
      value={(value as string) || '#3B82F6'}
      onChange={(e) => onChange(e.target.value)}
      className="w-10 h-10 rounded cursor-pointer border border-gray-300"
    />
  );
}
