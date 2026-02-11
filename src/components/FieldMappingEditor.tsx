'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowRight,
  GripVertical,
  X,
  Save,
  Loader2,
  FileText,
  Type,
  Tag,
  Link2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface MappableField {
  key: string;
  label: string;
  category: 'core' | 'meta' | 'taxonomy';
  type?: string;
}

interface FieldMappingEntry {
  source: { key: string; category: 'core' | 'meta' | 'taxonomy' };
  target: { key: string; category: 'core' | 'meta' | 'taxonomy' };
}

interface PostTypeConfig {
  slug: string;
  name: string;
  rest_base: string;
  icon?: string;
}

interface FieldMappingEditorProps {
  sourcePostType: PostTypeConfig;
  targetPostType: PostTypeConfig;
  sourceFields: MappableField[];
  targetFields: MappableField[];
  initialMappings: FieldMappingEntry[];
  onSave: (mappings: FieldMappingEntry[]) => Promise<void>;
  sourcePreviewValues?: Record<string, string>;
  targetPreviewValues?: Record<string, string>;
  sourceFullValues?: Record<string, string>;
  targetFullValues?: Record<string, string>;
  showFieldKeys?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  saveRef?: React.MutableRefObject<(() => Promise<void>) | null>;
  headerActions?: React.ReactNode;
}

// ─── Category icon helper ────────────────────────────────────────────────

function CategoryIcon({ category }: { category: string }): React.ReactElement {
  switch (category) {
    case 'core':
      return <FileText className="w-3.5 h-3.5" />;
    case 'meta':
      return <Type className="w-3.5 h-3.5" />;
    case 'taxonomy':
      return <Tag className="w-3.5 h-3.5" />;
    default:
      return <FileText className="w-3.5 h-3.5" />;
  }
}

function categoryColor(category: string): string {
  switch (category) {
    case 'core':
      return 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300';
    case 'meta':
      return 'bg-purple-50 dark:bg-purple-900/30 border-purple-200 dark:border-purple-700 text-purple-700 dark:text-purple-300';
    case 'taxonomy':
      return 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700 text-green-700 dark:text-green-300';
    default:
      return 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300';
  }
}

function categoryBadgeColor(category: string): string {
  switch (category) {
    case 'core':
      return 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400';
    case 'meta':
      return 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400';
    case 'taxonomy':
      return 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400';
    default:
      return 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400';
  }
}

// ─── Mapping color generator ─────────────────────────────────────────────

const MAPPING_COLORS = [
  'border-indigo-400 bg-indigo-50',
  'border-emerald-400 bg-emerald-50',
  'border-amber-400 bg-amber-50',
  'border-rose-400 bg-rose-50',
  'border-cyan-400 bg-cyan-50',
  'border-violet-400 bg-violet-50',
  'border-orange-400 bg-orange-50',
  'border-teal-400 bg-teal-50',
];

const MAPPING_LINE_COLORS = [
  '#818cf8', // indigo-400
  '#34d399', // emerald-400
  '#fbbf24', // amber-400
  '#fb7185', // rose-400
  '#22d3ee', // cyan-400
  '#a78bfa', // violet-400
  '#fb923c', // orange-400
  '#2dd4bf', // teal-400
];

function getMappingColor(index: number): string {
  return MAPPING_COLORS[index % MAPPING_COLORS.length];
}

function getMappingLineColor(index: number): string {
  return MAPPING_LINE_COLORS[index % MAPPING_LINE_COLORS.length];
}

// ─── Draggable source field ──────────────────────────────────────────────

function DraggableField({
  field,
  mappingIndex,
  isMapped,
  fieldRef,
  previewValue,
  tooltipValue,
  showKey,
}: {
  field: MappableField;
  mappingIndex: number;
  isMapped: boolean;
  fieldRef?: (el: HTMLDivElement | null) => void;
  previewValue?: string;
  tooltipValue?: string;
  showKey?: boolean;
}): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `source-${field.key}`,
    data: { field, side: 'source' },
  });

  const style = transform
    ? { transform: CSS.Transform.toString(transform) }
    : undefined;

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        if (fieldRef) fieldRef(el);
      }}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        'flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 cursor-grab active:cursor-grabbing transition-all select-none',
        isDragging && 'opacity-0',
        isMapped
          ? getMappingColor(mappingIndex)
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm'
      )}
    >
      <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0" />
      <CategoryIcon category={field.category} />
      <div className="flex-1 min-w-0">
        <span className="text-sm truncate block">
          <span className="font-medium">{field.label}</span>
          {showKey && field.key !== field.label && (
            <span className="text-[11px] text-gray-500/70 font-mono ml-1.5">{field.key}</span>
          )}
        </span>
        {previewValue && (
          <span
            className="text-xs text-gray-400 break-words line-clamp-5 block cursor-default"
            title={tooltipValue || previewValue}
          >
            {previewValue}
          </span>
        )}
      </div>
      <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full uppercase flex-shrink-0', categoryBadgeColor(field.category))}>
        {field.category}
      </span>
    </div>
  );
}

// ─── Droppable target field ──────────────────────────────────────────────

function DroppableField({
  field,
  mappingIndex,
  isMapped,
  mappedSourceLabel,
  onRemove,
  fieldRef,
  previewValue,
  tooltipValue,
  showKey,
}: {
  field: MappableField;
  mappingIndex: number;
  isMapped: boolean;
  mappedSourceLabel?: string;
  onRemove?: () => void;
  fieldRef?: (el: HTMLDivElement | null) => void;
  previewValue?: string;
  tooltipValue?: string;
  showKey?: boolean;
}): React.ReactElement {
  const { isOver, setNodeRef } = useDroppable({
    id: `target-${field.key}`,
    data: { field, side: 'target' },
  });

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        if (fieldRef) fieldRef(el);
      }}
      className={cn(
        'flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 transition-all',
        isOver && !isMapped && 'border-brand-400 bg-brand-50 shadow-md scale-[1.02]',
        isOver && isMapped && 'border-red-300 bg-red-50',
        !isOver && isMapped && getMappingColor(mappingIndex),
        !isOver && !isMapped && 'border-dashed border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/30'
      )}
    >
      <CategoryIcon category={field.category} />
      <div className="flex-1 min-w-0">
        <span className="text-sm truncate block">
          <span className="font-medium">{field.label}</span>
          {showKey && field.key !== field.label && (
            <span className="text-[11px] text-gray-500/70 font-mono ml-1.5">{field.key}</span>
          )}
        </span>
        {isMapped && mappedSourceLabel && (
          <span className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
            <Link2 className="w-3 h-3" />
            {mappedSourceLabel}
          </span>
        )}
        {previewValue && (
          <span
            className="text-xs text-gray-400 break-words line-clamp-5 block cursor-default"
            title={tooltipValue || previewValue}
          >
            {previewValue}
          </span>
        )}
      </div>
      <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full uppercase flex-shrink-0', categoryBadgeColor(field.category))}>
        {field.category}
      </span>
      {isMapped && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="p-0.5 text-gray-400 hover:text-red-500 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

// ─── Drag overlay (what you see while dragging) ──────────────────────────

function DragOverlayContent({ field }: { field: MappableField }): React.ReactElement {
  return (
    <div className={cn(
      'flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 shadow-lg',
      categoryColor(field.category),
      'cursor-grabbing'
    )}>
      <GripVertical className="w-4 h-4 text-gray-400" />
      <CategoryIcon category={field.category} />
      <span className="text-sm font-medium">{field.label}</span>
    </div>
  );
}

// ─── Main Editor Component ───────────────────────────────────────────────

interface LineCoordinate {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}

export function FieldMappingEditor({
  sourcePostType,
  targetPostType,
  sourceFields,
  targetFields,
  initialMappings,
  onSave,
  sourcePreviewValues,
  targetPreviewValues,
  sourceFullValues,
  targetFullValues,
  showFieldKeys,
  onDirtyChange,
  saveRef,
  headerActions,
}: FieldMappingEditorProps): React.ReactElement {
  const [mappings, setMappings] = useState<FieldMappingEntry[]>(initialMappings);
  const [activeField, setActiveField] = useState<MappableField | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [lines, setLines] = useState<LineCoordinate[]>([]);
  const initialRef = useRef(JSON.stringify(initialMappings));
  const containerRef = useRef<HTMLDivElement>(null);
  const sourceRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const targetRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const rafIdRef = useRef<number>();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  // Calculate line coordinates
  const calculateLines = useCallback((): void => {
    if (!containerRef.current) return;

    const newLines: LineCoordinate[] = [];
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    mappings.forEach((mapping, index) => {
      const sourceEl = sourceRefs.current.get(mapping.source.key);
      const targetEl = targetRefs.current.get(mapping.target.key);

      if (sourceEl && targetEl) {
        const sourceRect = sourceEl.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();

        // Calculate center points relative to the grid container
        const gridEl = containerRef.current?.querySelector('.relative.grid');
        if (!gridEl) return;
        const gridRect = gridEl.getBoundingClientRect();

        const x1 = sourceRect.right - gridRect.left;
        const y1 = sourceRect.top + sourceRect.height / 2 - gridRect.top;
        const x2 = targetRect.left - gridRect.left;
        const y2 = targetRect.top + targetRect.height / 2 - gridRect.top;

        newLines.push({
          x1,
          y1,
          x2,
          y2,
          color: getMappingLineColor(index),
        });
      }
    });

    setLines(newLines);
  }, [mappings]);

  // Schedule line calculation with RAF
  const scheduleCalculation = useCallback((): void => {
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = requestAnimationFrame(calculateLines);
    });
  }, [calculateLines]);

  // Recalculate when mappings change
  useEffect(() => {
    scheduleCalculation();
  }, [mappings, scheduleCalculation]);

  // Recalculate on window resize
  useEffect(() => {
    window.addEventListener('resize', scheduleCalculation);
    return () => {
      window.removeEventListener('resize', scheduleCalculation);
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [scheduleCalculation]);

  // Find mapping index for a field (for color coordination)
  const getSourceMappingIndex = useCallback(
    (sourceKey: string): number => {
      return mappings.findIndex((m) => m.source.key === sourceKey);
    },
    [mappings]
  );

  const getTargetMappingIndex = useCallback(
    (targetKey: string): number => {
      return mappings.findIndex((m) => m.target.key === targetKey);
    },
    [mappings]
  );

  const getTargetMappedSource = useCallback(
    (targetKey: string): MappableField | undefined => {
      const mapping = mappings.find((m) => m.target.key === targetKey);
      if (!mapping) return undefined;
      return sourceFields.find((f) => f.key === mapping.source.key);
    },
    [mappings, sourceFields]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { field } = event.active.data.current as { field: MappableField };
    setActiveField(field);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveField(null);

      const { active, over } = event;
      if (!over) return;

      const sourceData = active.data.current as { field: MappableField; side: string };
      const targetData = over.data.current as { field: MappableField; side: string };

      if (sourceData.side !== 'source' || targetData.side !== 'target') return;

      const sourceField = sourceData.field;
      const targetField = targetData.field;

      setMappings((prev) => {
        // Remove any existing mapping for this source or target
        const filtered = prev.filter(
          (m) => m.source.key !== sourceField.key && m.target.key !== targetField.key
        );

        const next = [
          ...filtered,
          {
            source: { key: sourceField.key, category: sourceField.category },
            target: { key: targetField.key, category: targetField.category },
          },
        ];

        setHasChanges(JSON.stringify(next) !== initialRef.current);
        return next;
      });
    },
    []
  );

  const handleRemoveMapping = useCallback((targetKey: string) => {
    setMappings((prev) => {
      const next = prev.filter((m) => m.target.key !== targetKey);
      setHasChanges(JSON.stringify(next) !== initialRef.current);
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await onSave(mappings);
      initialRef.current = JSON.stringify(mappings);
      setHasChanges(false);
    } finally {
      setIsSaving(false);
    }
  }, [mappings, onSave]);

  // Expose save function to parent via ref
  useEffect(() => {
    if (saveRef) saveRef.current = handleSave;
    return () => { if (saveRef) saveRef.current = null; };
  }, [saveRef, handleSave]);

  // Notify parent of dirty state changes
  useEffect(() => {
    onDirtyChange?.(hasChanges);
  }, [hasChanges, onDirtyChange]);

  return (
    <div className="space-y-6" ref={containerRef}>
      {/* Header bar */}
      <div className="flex items-center gap-3 text-sm">
        <span className="font-semibold text-gray-900 dark:text-white">{sourcePostType.name}</span>
        <ArrowRight className="w-4 h-4 text-gray-400" />
        <span className="font-semibold text-gray-900 dark:text-white">{targetPostType.name}</span>
        <span className="text-gray-400 dark:text-gray-500">
          ({mappings.length} mapping{mappings.length !== 1 ? 's' : ''})
        </span>
        {headerActions && <div className="ml-auto flex items-center gap-3">{headerActions}</div>}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-blue-100 border border-blue-200" />
          Core fields
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-purple-100 border border-purple-200" />
          Meta Box fields
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-green-100 border border-green-200" />
          Taxonomies
        </div>
        <div className="ml-auto text-gray-400 dark:text-gray-500">
          Drag a source field and drop it on a target field to create a mapping
        </div>
      </div>

      {/* DnD context wrapping both columns */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="relative grid grid-cols-[1fr_auto_1fr] gap-4">
          {/* SVG overlay for connection lines */}
          {lines.length > 0 && (
            <svg
              className="absolute inset-0 pointer-events-none w-full h-full"
              style={{ zIndex: 0 }}
            >
              {lines.map((line, i) => {
                // Create a smooth cubic bezier curve
                const midX = (line.x1 + line.x2) / 2;
                const path = `M ${line.x1} ${line.y1} C ${midX} ${line.y1}, ${midX} ${line.y2}, ${line.x2} ${line.y2}`;

                return (
                  <path
                    key={i}
                    d={path}
                    stroke={line.color}
                    strokeWidth="2.5"
                    fill="none"
                    opacity="0.7"
                  />
                );
              })}
            </svg>
          )}
          {/* Source column */}
          <div className="min-w-0 overflow-hidden" style={{ zIndex: 1 }}>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 px-1">
              Source: {sourcePostType.name}
            </h3>
            <div className="space-y-2">
              {sourceFields.map((field) => {
                const idx = getSourceMappingIndex(field.key);
                return (
                  <DraggableField
                    key={field.key}
                    field={field}
                    mappingIndex={idx}
                    isMapped={idx >= 0}
                    previewValue={sourcePreviewValues?.[field.key]}
                    tooltipValue={sourceFullValues?.[field.key]}
                    showKey={showFieldKeys}
                    fieldRef={(el) => {
                      if (el) {
                        sourceRefs.current.set(field.key, el);
                        // Recalculate lines when ref is set
                        scheduleCalculation();
                      } else {
                        sourceRefs.current.delete(field.key);
                      }
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Center connector column */}
          <div className="flex flex-col items-center justify-center pt-8" style={{ zIndex: 1 }}>
            {mappings.length > 0 ? (
              <div className="flex flex-col gap-1">
                {mappings.map((_, i) => (
                  <ArrowRight
                    key={i}
                    className="w-5 h-5 text-gray-300"
                  />
                ))}
              </div>
            ) : (
              <div className="text-gray-300 text-xs text-center w-16">
                Drag to connect
              </div>
            )}
          </div>

          {/* Target column */}
          <div className="min-w-0 overflow-hidden" style={{ zIndex: 1 }}>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 px-1">
              Target: {targetPostType.name}
            </h3>
            <div className="space-y-2">
              {targetFields.map((field) => {
                const idx = getTargetMappingIndex(field.key);
                const mappedSource = getTargetMappedSource(field.key);
                return (
                  <DroppableField
                    key={field.key}
                    field={field}
                    mappingIndex={idx}
                    isMapped={idx >= 0}
                    mappedSourceLabel={mappedSource?.label}
                    onRemove={() => handleRemoveMapping(field.key)}
                    previewValue={targetPreviewValues?.[field.key]}
                    tooltipValue={targetFullValues?.[field.key]}
                    showKey={showFieldKeys}
                    fieldRef={(el) => {
                      if (el) {
                        targetRefs.current.set(field.key, el);
                        // Recalculate lines when ref is set
                        scheduleCalculation();
                      } else {
                        targetRefs.current.delete(field.key);
                      }
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Drag overlay */}
        <DragOverlay>
          {activeField ? <DragOverlayContent field={activeField} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
