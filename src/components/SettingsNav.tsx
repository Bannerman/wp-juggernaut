'use client';

import Link from 'next/link';
import { ArrowLeft, Server, Sparkles, Puzzle, Activity, Repeat, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SettingsNavProps {
  activeTab: string;
  /** Optional right-side content (e.g. save button) */
  actions?: React.ReactNode;
  /** When provided, in-page tabs (target, prompts, plugins, diagnostics) call this instead of navigating */
  onTabClick?: (tabId: string) => void;
}

const NAV_ITEMS = [
  { id: 'target', label: 'Target Site', icon: Server, href: '/settings', inPage: true },
  { id: 'prompts', label: 'Prompts', icon: Sparkles, href: '/settings', inPage: true },
  { id: 'plugins', label: 'Plugins', icon: Puzzle, href: '/settings', inPage: true },
  { id: 'diagnostics', label: 'Diagnostics', icon: Activity, href: '/settings', inPage: true },
  { id: 'field-mappings', label: 'Field Mapping', icon: Repeat, href: '/settings/field-mappings', inPage: false },
  { id: 'tab-layout', label: 'Tab Layout', icon: LayoutGrid, href: '/settings/tab-layout', inPage: false },
];

export function SettingsNav({ activeTab, actions, onTabClick }: SettingsNavProps): React.ReactElement {
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40 electron-drag">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pl-20">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-4 electron-no-drag">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Link>
            <h1 className="text-xl font-bold text-gray-900">Settings</h1>
          </div>
          {actions && <div className="electron-no-drag">{actions}</div>}
        </div>

        <nav className="flex gap-6 -mb-px electron-no-drag">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const className = cn(
              'py-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
              isActive
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            );

            // In-page tabs use button when onTabClick is provided (main settings page)
            if (item.inPage && onTabClick) {
              return (
                <button
                  key={item.id}
                  onClick={() => onTabClick(item.id)}
                  className={className}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            }

            return (
              <Link key={item.id} href={item.href} className={className}>
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
