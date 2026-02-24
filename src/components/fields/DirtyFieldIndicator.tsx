'use client';

import { useState, useRef, useEffect } from 'react';
import { RotateCcw } from 'lucide-react';

interface DirtyFieldIndicatorProps {
  fieldLabel: string;
  originalValue: unknown;
  currentValue: unknown;
  onReset?: () => void;
}

/** Format a value for display in the tooltip */
function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '(empty)';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    if (value.length > 120) return value.slice(0, 120) + '...';
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '(empty list)';
    // For arrays of primitives, show them directly
    if (value.every(v => typeof v === 'string' || typeof v === 'number')) {
      const joined = value.join(', ');
      return joined.length > 120 ? joined.slice(0, 120) + '...' : joined;
    }
    return `${value.length} item${value.length === 1 ? '' : 's'}`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    return `{${keys.length} field${keys.length === 1 ? '' : 's'}}`;
  }
  return String(value);
}

/** Summarize changes between two complex values (arrays/objects) */
function summarizeChanges(original: unknown, current: unknown): string | null {
  if (Array.isArray(original) && Array.isArray(current)) {
    // For repeater fields — compare item counts and identify which items differ
    if (original.length !== current.length) {
      return `${original.length} → ${current.length} items`;
    }
    let changedCount = 0;
    for (let i = 0; i < original.length; i++) {
      if (JSON.stringify(original[i]) !== JSON.stringify(current[i])) {
        changedCount++;
      }
    }
    if (changedCount > 0) {
      return `${changedCount} of ${original.length} item${original.length === 1 ? '' : 's'} changed`;
    }
    return null;
  }
  return null;
}

/**
 * Hover tooltip showing the original (server) value vs the current (local) value.
 * Renders as an inline indicator next to a field label.
 */
export function DirtyFieldIndicator({ fieldLabel, originalValue, currentValue, onReset }: DirtyFieldIndicatorProps): React.ReactElement {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [tooltipPos, setTooltipPos] = useState<'below' | 'above'>('below');

  useEffect(() => {
    if (showTooltip && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setTooltipPos(spaceBelow < 200 ? 'above' : 'below');
    }
  }, [showTooltip]);

  const isComplex = typeof originalValue === 'object' && originalValue !== null;
  const changeSummary = isComplex ? summarizeChanges(originalValue, currentValue) : null;

  return (
    <div
      ref={triggerRef}
      className="relative inline-flex items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />

      {showTooltip && (
        <div
          ref={tooltipRef}
          className={`absolute left-0 z-50 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-3 text-xs ${
            tooltipPos === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <div className="font-medium text-gray-900 dark:text-white mb-2">
            {fieldLabel}
          </div>

          {changeSummary && (
            <div className="mb-2 text-amber-600 dark:text-amber-400 font-medium">
              {changeSummary}
            </div>
          )}

          <div className="space-y-1.5">
            <div>
              <span className="text-gray-400 dark:text-gray-500">Server: </span>
              <span className="text-gray-600 dark:text-gray-300 break-words">
                {formatValue(originalValue)}
              </span>
            </div>
            <div>
              <span className="text-amber-500 dark:text-amber-400">Local: </span>
              <span className="text-gray-900 dark:text-white break-words">
                {formatValue(currentValue)}
              </span>
            </div>
          </div>

          {onReset && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onReset();
                setShowTooltip(false);
              }}
              className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1 rounded bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Reset to server value
            </button>
          )}
        </div>
      )}
    </div>
  );
}
