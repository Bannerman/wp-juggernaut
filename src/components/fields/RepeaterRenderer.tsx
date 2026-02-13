'use client';

import { Plus, Trash2, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FieldRenderer } from './FieldRenderer';
import type { FieldRendererProps } from './types';
import type { FieldDefinition } from '@/lib/plugins/types';

const subFieldWidthClasses: Record<string, string> = {
  full: 'w-full',
  half: 'w-[calc(50%-0.375rem)]',
  quarter: 'w-[calc(25%-0.5625rem)]',
};

export function RepeaterRenderer({ field, value, onChange, terms, depth = 0, resourceTitle }: FieldRendererProps) {
  const items = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
  const subFields = field.fields ? Object.values(field.fields) : [];

  const addItem = () => {
    const empty: Record<string, unknown> = {};
    for (const sf of subFields) {
      if (sf.type === 'repeater') {
        empty[sf.key] = [];
      } else if (sf.type === 'checkbox') {
        empty[sf.key] = false;
      } else if (sf.type === 'textarea-list') {
        empty[sf.key] = [];
      } else {
        let defaultVal = sf.default_value ?? '';
        // Resolve {{title}} template in default values
        if (typeof defaultVal === 'string' && resourceTitle) {
          defaultVal = defaultVal.replace(/\{\{title\}\}/g, resourceTitle);
        }
        empty[sf.key] = defaultVal;
      }
    }
    onChange([...items, empty]);
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, fieldKey: string, fieldValue: unknown) => {
    const updated = items.map((item, i) => {
      if (i !== index) return item;
      const newItem = { ...item, [fieldKey]: fieldValue };

      // Evaluate triggers for the changed field
      const changedField = subFields.find((sf) => sf.key === fieldKey);
      if (changedField?.triggers && terms) {
        for (const trigger of changedField.triggers) {
          // For taxonomy-sourced selects, resolve the value to a term name
          let termName = '';
          if (changedField.taxonomy_source) {
            const taxTerms = terms[changedField.taxonomy_source] || [];
            const matched = taxTerms.find((t) => t.id === Number(fieldValue));
            termName = matched?.name ?? '';
          }
          if (termName && trigger.match_term_pattern) {
            const matches = termName.toLowerCase().includes(trigger.match_term_pattern.toLowerCase());
            if (matches) {
              newItem[trigger.set_field] = trigger.set_value;
            }
          }
        }
      }

      return newItem;
    });
    onChange(updated);
  };

  const isNested = depth > 0;
  // Single-field repeaters (e.g., features) use a compact inline layout
  const isSimple = subFields.length === 1 && subFields[0].type === 'text';

  return (
    <div className={isSimple ? 'space-y-2' : 'space-y-3'}>
      <div className="flex items-center justify-between">
        <label className={isNested ? 'text-xs font-medium text-gray-600 dark:text-gray-400 uppercase' : 'text-sm font-medium text-gray-700 dark:text-gray-300'}>
          {field.label}
        </label>
        <button
          type="button"
          onClick={addItem}
          className={`flex items-center gap-1 ${isNested ? 'text-xs' : 'text-sm'} text-brand-600 hover:text-brand-700`}
        >
          <Plus className={isNested ? 'w-3 h-3' : 'w-4 h-4'} />
          Add {field.label}
        </button>
      </div>

      {items.length === 0 ? (
        <p className={`${isNested ? 'text-xs' : 'text-sm'} text-gray-500 dark:text-gray-400 italic`}>
          No {field.label.toLowerCase()} added yet.
        </p>
      ) : isSimple ? (
        /* Compact single-line layout for simple repeaters */
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <FieldRenderer
                field={subFields[0]}
                value={item[subFields[0].key]}
                onChange={(val) => updateItem(index, subFields[0].key, val)}
                terms={terms}
                depth={depth + 1}
                resourceTitle={resourceTitle}
              />
              <button
                type="button"
                onClick={() => removeItem(index)}
                className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded flex-shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        /* Full card layout for multi-field repeaters */
        <div className="space-y-3">
          {items.map((item, index) => {
            // First full-width text/select field renders inline in the header row
            // Skip fields with width hints — they're meant to flow with siblings
            const firstInlineIdx = subFields.findIndex(
              (sf) => (sf.type === 'text' || sf.type === 'select') && !sf.width
            );
            const headerField = firstInlineIdx >= 0 ? subFields[firstInlineIdx] : null;
            const remainingFields = subFields.filter((_, i) => i !== firstInlineIdx);

            return (
              <div
                key={index}
                className={`relative border border-gray-200 dark:border-gray-700 rounded-lg ${isNested ? 'p-3' : 'p-4'} bg-gray-50 dark:bg-gray-800/50`}
              >
                {/* Delete button — top right */}
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className={`absolute ${isNested ? 'top-2 right-2 p-1' : 'top-3 right-3 p-2'} text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded`}
                >
                  <Trash2 className={isNested ? 'w-3 h-3' : 'w-4 h-4'} />
                </button>

                {/* Header field inline, if any */}
                {headerField && (
                  <div className="mb-3 pr-10">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      {headerField.label}
                    </label>
                    <FieldRenderer
                      field={headerField}
                      value={item[headerField.key]}
                      onChange={(val) => updateItem(index, headerField.key, val)}
                      terms={terms}
                      depth={depth + 1}
                      resourceTitle={resourceTitle}
                    />
                  </div>
                )}

                {/* Remaining fields */}
                {remainingFields.length > 0 && (
                  <div className={cn('flex flex-wrap gap-3', headerField ? '' : 'pr-10')}>
                    {remainingFields.map((subField) => (
                      <SubFieldWrapper
                        key={subField.key}
                        subField={subField}
                        item={item}
                        index={index}
                        updateItem={updateItem}
                        terms={terms}
                        depth={depth}
                        resourceTitle={resourceTitle}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SubFieldWrapper({
  subField,
  item,
  index,
  updateItem,
  terms,
  depth,
  resourceTitle,
}: {
  subField: FieldDefinition;
  item: Record<string, unknown>;
  index: number;
  updateItem: (index: number, key: string, value: unknown) => void;
  terms?: Record<string, Array<{ id: number; name: string }>>;
  depth: number;
  resourceTitle?: string;
}) {
  // Evaluate conditional visibility within the repeater item
  if (subField.conditional) {
    const { field: condField, operator = 'eq', value: condValue } = subField.conditional;
    const actualValue = item[condField];
    let visible = false;

    switch (operator) {
      case 'truthy':
        visible = Boolean(actualValue);
        break;
      case 'falsy':
        visible = !actualValue;
        break;
      case 'neq':
        visible = actualValue !== condValue;
        break;
      case 'eq':
      default:
        visible = actualValue === condValue;
        break;
    }

    if (!visible) return null;
  }

  // For non-checkbox types, show a label above the field
  const showLabel = subField.type !== 'checkbox' && subField.type !== 'repeater';
  const width = subField.width ?? 'full';

  return (
    <div className={cn(subFieldWidthClasses[width] ?? 'w-full')}>
      {showLabel && (
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          {subField.label}
        </label>
      )}
      <FieldRenderer
        field={subField}
        value={item[subField.key]}
        onChange={(val) => updateItem(index, subField.key, val)}
        terms={terms}
        depth={depth + 1}
        resourceTitle={resourceTitle}
      />
    </div>
  );
}
