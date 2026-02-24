'use client';

import Link from 'next/link';
import { ArrowLeft, Server, Sparkles, Puzzle, Activity, Repeat, LayoutGrid, Columns3, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SettingsNavProps {
  activeTab: string;
  /** Optional right-side content (e.g. save button) */
  actions?: React.ReactNode;
  /** When provided, in-page tabs (target, prompts, plugins, diagnostics) call this instead of navigating */
  onTabClick?: (tabId: string) => void;
  /** List of enabled plugin IDs — nav items with a pluginId are hidden when that plugin is disabled */
  enabledPlugins?: string[];
}

const NAV_ITEMS = [
  { id: 'target', label: 'Target Site', icon: Server, href: '/settings?tab=target', inPage: true },
  { id: 'prompts', label: 'Prompts', icon: Sparkles, href: '/settings?tab=prompts', inPage: true },
  { id: 'plugins', label: 'Plugins', icon: Puzzle, href: '/settings?tab=plugins', inPage: true },
  { id: 'diagnostics', label: 'Diagnostics', icon: Activity, href: '/settings?tab=diagnostics', inPage: true },
  { id: 'updates', label: 'Updates', icon: Download, href: '/settings?tab=updates', inPage: true },
  { id: 'field-mappings', label: 'Field Mapping', icon: Repeat, href: '/settings/field-mappings', inPage: false, pluginId: 'convert-post-type' },
  { id: 'tab-layout', label: 'Tab Layout', icon: LayoutGrid, href: '/settings/tab-layout', inPage: false },
  { id: 'views', label: 'Views', icon: Columns3, href: '/settings/views', inPage: false, pluginId: 'custom-views' },
];

export function SettingsNav({ activeTab, actions, onTabClick, enabledPlugins }: SettingsNavProps): React.ReactElement {
  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40 electron-drag">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pl-20">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-4 electron-no-drag">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Link>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h1>
          </div>
          {actions && <div className="electron-no-drag">{actions}</div>}
        </div>

        <nav className="flex gap-6 -mb-px electron-no-drag">
          {NAV_ITEMS.filter(item => !item.pluginId || !enabledPlugins || enabledPlugins.includes(item.pluginId)).map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const className = cn(
              'py-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
              isActive
                ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
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
