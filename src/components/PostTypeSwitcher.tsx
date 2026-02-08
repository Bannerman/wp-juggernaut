'use client';

import { FileText, Newspaper } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PostTypeConfig {
  slug: string;
  name: string;
  rest_base: string;
  icon?: string;
  is_primary?: boolean;
}

interface PostTypeSwitcherProps {
  postTypes: PostTypeConfig[];
  activePostType: string;
  onSwitch: (postType: PostTypeConfig) => void;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText,
  Newspaper,
};

export function PostTypeSwitcher({ postTypes, activePostType, onSwitch }: PostTypeSwitcherProps): React.ReactElement | null {
  if (postTypes.length <= 1) return null;

  return (
    <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
      {postTypes.map((pt) => {
        const Icon = pt.icon ? ICON_MAP[pt.icon] : FileText;
        const isActive = pt.slug === activePostType;

        return (
          <button
            key={pt.slug}
            onClick={() => onSwitch(pt)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              isActive
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {Icon && <Icon className="w-4 h-4" />}
            {pt.name}
          </button>
        );
      })}
    </div>
  );
}
