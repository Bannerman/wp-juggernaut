/**
 * Plugin Global Page Registration
 *
 * Client-side mirror of `JuggernautPlugin.getGlobalPages()`. The main app
 * imports plugin page modules for side effects; each module calls
 * `registerGlobalPage()` at top level to mount its React component in this
 * registry. The main app reads the registry to render nav entries and route
 * the selected page.
 *
 * This is the global-page counterpart to `pluginTabs.ts` (which handles
 * per-resource EditModal tabs).
 *
 * @example
 * ```tsx
 * // In your plugin's page module:
 * import { registerGlobalPage } from '@/components/globalPages';
 * export function MyPage() { ... }
 * registerGlobalPage({ id: 'mypage', label: 'My Page', component: MyPage });
 * ```
 */

import type { ComponentType } from 'react';
import type { PageComponentProps } from '@/lib/plugins/types';

export interface GlobalPageEntry {
  id: string;
  label: string;
  icon?: string;
  position?: number;
  component: ComponentType<PageComponentProps>;
  /** ID of the plugin that owns this page; used to gate nav visibility. */
  pluginId: string;
}

const globalPageRegistry: Record<string, GlobalPageEntry> = {};

export function registerGlobalPage(entry: GlobalPageEntry): void {
  globalPageRegistry[entry.id] = entry;
}

export function unregisterGlobalPage(id: string): void {
  delete globalPageRegistry[id];
}

export function getGlobalPage(id: string): GlobalPageEntry | undefined {
  return globalPageRegistry[id];
}

export function getAllGlobalPages(): GlobalPageEntry[] {
  return Object.values(globalPageRegistry).sort((a, b) => {
    const pa = a.position ?? 100;
    const pb = b.position ?? 100;
    if (pa !== pb) return pa - pb;
    return a.id.localeCompare(b.id);
  });
}
