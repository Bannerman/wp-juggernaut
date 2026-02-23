'use client';

import { RotateCcw } from 'lucide-react';
import type { FieldDefinition } from '@/lib/plugins/types';
import { FieldRenderer } from './FieldRenderer';
import { cn } from '@/lib/utils';

interface DynamicTabProps {
  fields: FieldDefinition[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  terms?: Record<string, Array<{ id: number; name: string }>>;
  resourceTitle?: string;
  /** Set of changed field keys (e.g. 'meta:field_key') for dirty highlighting */
  changedFields?: Set<string>;
  /** Callback to reset a single field to its snapshot value */
  onResetField?: (key: string) => void;
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

export function DynamicTab({ fields, values, onChange, terms, resourceTitle, changedFields, onResetField }: DynamicTabProps) {
  if (fields.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 italic">No fields configured for this tab.</p>
    );
  }

  return (
    <div className="space-y-4">
      {fields.map((field) => {
        if (!evaluateConditional(field, values)) return null;

        const width = field.width ?? 'full';
        const showLabel = field.type !== 'checkbox' && field.type !== 'repeater';
        const isChanged = changedFields?.has(`meta:${field.key}`);

        return (
          <div
            key={field.key}
            className={cn(
              widthClasses[width],
              isChanged && 'border-l-4 border-amber-400 pl-3'
            )}
          >
            {showLabel && (
              <div className="flex items-center gap-2 mb-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {field.label}
                </label>
                {isChanged && onResetField && (
                  <button
                    type="button"
                    onClick={() => onResetField(field.key)}
                    className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300"
                    title="Reset to server value"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </button>
                )}
              </div>
            )}
            <FieldRenderer
              field={field}
              value={values[field.key]}
              onChange={(val) => onChange(field.key, val)}
              terms={terms}
              depth={0}
              resourceTitle={resourceTitle}
            />
          </div>
        );
      })}
    </div>
  );
}
