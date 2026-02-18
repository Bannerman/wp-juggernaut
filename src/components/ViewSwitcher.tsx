'use client';

import { cn } from '@/lib/utils';

interface ViewOption {
  id: string;
  name: string;
}

interface ViewSwitcherProps {
  views: ViewOption[];
  activeViewId: string;
  onViewChange: (viewId: string) => void;
}

export function ViewSwitcher({ views, activeViewId, onViewChange }: ViewSwitcherProps): React.ReactElement | null {
  if (views.length === 0) return null;

  return (
    <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
      {views.map((view) => (
        <button
          key={view.id}
          onClick={() => onViewChange(view.id)}
          className={cn(
            'px-3 py-1 rounded-md text-xs font-medium transition-colors',
            activeViewId === view.id
              ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          )}
        >
          {view.name}
        </button>
      ))}
    </div>
  );
}
