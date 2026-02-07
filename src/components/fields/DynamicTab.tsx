'use client';

import type { FieldDefinition } from '@/lib/plugins/types';
import { FieldRenderer } from './FieldRenderer';
import { cn } from '@/lib/utils';

interface DynamicTabProps {
  fields: FieldDefinition[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  terms?: Record<string, Array<{ id: number; name: string }>>;
}

function evaluateConditional(
  field: FieldDefinition,
  values: Record<string, unknown>
): boolean {
  if (!field.conditional) return true;

  const { field: condField, operator = 'eq', value: condValue } = field.conditional;
  const actualValue = values[condField];

  switch (operator) {
    case 'truthy':
      return Boolean(actualValue);
    case 'falsy':
      return !actualValue;
    case 'neq':
      return actualValue !== condValue;
    case 'eq':
    default:
      return actualValue === condValue;
  }
}

const widthClasses: Record<string, string> = {
  full: 'w-full',
  half: 'w-1/2',
  quarter: 'w-1/4',
};

export function DynamicTab({ fields, values, onChange, terms }: DynamicTabProps) {
  if (fields.length === 0) {
    return (
      <p className="text-sm text-gray-500 italic">No fields configured for this tab.</p>
    );
  }

  return (
    <div className="space-y-4">
      {fields.map((field) => {
        if (!evaluateConditional(field, values)) return null;

        const width = field.width ?? 'full';
        // Checkbox and repeater render their own label
        const showLabel = field.type !== 'checkbox' && field.type !== 'repeater';

        return (
          <div key={field.key} className={cn(widthClasses[width])}>
            {showLabel && (
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {field.label}
              </label>
            )}
            <FieldRenderer
              field={field}
              value={values[field.key]}
              onChange={(val) => onChange(field.key, val)}
              terms={terms}
              depth={0}
            />
          </div>
        );
      })}
    </div>
  );
}
