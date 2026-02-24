'use client';

import { useState } from 'react';
import { Plus, Trash2, GripVertical, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FieldRenderer } from './FieldRenderer';
import type { FieldRendererProps } from './types';
import type { FieldDefinition } from '@/lib/plugins/types';

const subFieldWidthClasses: Record<string, string> = {
  full: 'w-full',
  half: 'w-[calc(50%-0.375rem)]',
  quarter: 'w-[calc(25%-0.5625rem)]',
};

/** Format a value for display in the diff tooltip */
function formatDiffValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '(empty)';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    if (value.length > 80) return value.slice(0, 80) + '...';
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '(empty)';
    return `${value.length} item${value.length === 1 ? '' : 's'}`;
  }
  return String(value);
}

/** Compute which sub-field keys differ between a snapshot item and a current item */
function diffItem(
  snapshotItem: Record<string, unknown> | undefined,
  currentItem: Record<string, unknown>,
  subFields: FieldDefinition[]
): Set<string> {
  const changed = new Set<string>();
  if (!snapshotItem) {
    // Entire item is new
    subFields.forEach(sf => changed.add(sf.key));
    return changed;
  }
  for (const sf of subFields) {
    if (JSON.stringify(currentItem[sf.key]) !== JSON.stringify(snapshotItem[sf.key])) {
      changed.add(sf.key);
    }
  }
  return changed;
}

export function RepeaterRenderer({ field, value, onChange, terms, depth = 0, resourceTitle, snapshotValue }: FieldRendererProps) {
  const items = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
  const snapshotItems = Array.isArray(snapshotValue) ? (snapshotValue as Record<string, unknown>[]) : undefined;
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

      const changedField = subFields.find((sf) => sf.key === fieldKey);
      if (changedField?.triggers && terms) {
        for (const trigger of changedField.triggers) {
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

  /** Reset a single sub-field within an item back to its snapshot value */
  const resetSubField = (index: number, fieldKey: string) => {
    if (!snapshotItems?.[index]) return;
    const updated = items.map((item, i) => {
      if (i !== index) return item;
      return { ...item, [fieldKey]: JSON.parse(JSON.stringify(snapshotItems[index][fieldKey])) };
    });
    onChange(updated);
  };

  const isNested = depth > 0;
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
        <div className="space-y-3">
          {items.map((item, index) => {
            const snapshotItem = snapshotItems?.[index];
            const changedSubFields = snapshotItems ? diffItem(snapshotItem, item, subFields) : undefined;

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
                {snapshotItems && !snapshotItem && (
                  <div className="absolute top-2 left-2 px-1.5 py-0.5 text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 rounded">
                    NEW
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className={`absolute ${isNested ? 'top-2 right-2 p-1' : 'top-3 right-3 p-2'} text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded`}
                >
                  <Trash2 className={isNested ? 'w-3 h-3' : 'w-4 h-4'} />
                </button>

                {headerField && (
                  <div className={cn(
                    'mb-3 pr-10',
                    changedSubFields?.has(headerField.key) && 'border-l-4 border-amber-400 pl-3'
                  )}>
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
                      snapshotValue={snapshotItem?.[headerField.key]}
                    />
                    {changedSubFields?.has(headerField.key) && snapshotItem && (
                      <SubFieldDiff
                        label={headerField.label}
                        original={snapshotItem[headerField.key]}
                        current={item[headerField.key]}
                        onReset={() => resetSubField(index, headerField.key)}
                      />
                    )}
                  </div>
                )}

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
                        isChanged={changedSubFields?.has(subField.key)}
                        snapshotItem={snapshotItem}
                        onResetSubField={resetSubField}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {snapshotItems && snapshotItems.length > items.length && (
            <div className="px-3 py-2 rounded-lg border border-dashed border-red-300 dark:border-red-700 text-xs text-red-600 dark:text-red-400">
              {snapshotItems.length - items.length} item{snapshotItems.length - items.length > 1 ? 's' : ''} removed
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Inline diff display for a sub-field showing server vs local */
function SubFieldDiff({ label, original, current, onReset }: {
  label: string;
  original: unknown;
  current: unknown;
  onReset?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-1 w-full text-left">
      {expanded ? (
        <div className="text-[11px] bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded px-2 py-1.5 space-y-1">
          <div>
            <span className="text-gray-400 dark:text-gray-500">Server: </span>
            <span className="text-gray-600 dark:text-gray-300">{formatDiffValue(original)}</span>
          </div>
          <div>
            <span className="text-amber-500">Local: </span>
            <span className="text-gray-900 dark:text-white">{formatDiffValue(current)}</span>
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            {onReset && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onReset(); }}
                className="inline-flex items-center gap-1 text-[10px] text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                Reset
              </button>
            )}
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              Hide
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-[10px] text-amber-500 dark:text-amber-400 hover:underline"
        >
          Show diff
        </button>
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
  isChanged,
  snapshotItem,
  onResetSubField,
}: {
  subField: FieldDefinition;
  item: Record<string, unknown>;
  index: number;
  updateItem: (index: number, key: string, value: unknown) => void;
  terms?: Record<string, Array<{ id: number; name: string }>>;
  depth: number;
  resourceTitle?: string;
  isChanged?: boolean;
  snapshotItem?: Record<string, unknown>;
  onResetSubField?: (index: number, key: string) => void;
}) {
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

  const showLabel = subField.type !== 'checkbox' && subField.type !== 'repeater';
  const width = subField.width ?? 'full';

  // For nested repeaters with snapshot data, let the inner repeater handle its own highlighting
  const isNestedRepeaterWithSnapshot = subField.type === 'repeater' && isChanged && snapshotItem;
  const showBorder = isChanged && !isNestedRepeaterWithSnapshot;

  return (
    <div className={cn(
      subFieldWidthClasses[width] ?? 'w-full',
      showBorder && 'border-l-4 border-amber-400 pl-2'
    )}>
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
        snapshotValue={snapshotItem?.[subField.key]}
      />
      {showBorder && snapshotItem && (
        <SubFieldDiff
          label={subField.label}
          original={snapshotItem[subField.key]}
          current={item[subField.key]}
          onReset={onResetSubField ? () => onResetSubField(index, subField.key) : undefined}
        />
      )}
    </div>
  );
}
