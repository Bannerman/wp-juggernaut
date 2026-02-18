# Settings Pages Architecture

## Shared Navigation

All settings pages use the `SettingsNav` component (`src/components/SettingsNav.tsx`) for a consistent header with tab navigation.

### Usage

```tsx
import { SettingsNav } from '@/components/SettingsNav';

// Simple usage (sub-page like Field Mapping or Tab Layout)
<SettingsNav activeTab="your-tab-id" />

// With a save button in the header
<SettingsNav
  activeTab="your-tab-id"
  actions={<button>Save</button>}
/>

// Main settings page (in-page tabs use buttons instead of links)
<SettingsNav
  activeTab={activeTab}
  onTabClick={(tabId) => setActiveTab(tabId)}
/>
```

### Props

| Prop | Type | Description |
|------|------|-------------|
| `activeTab` | `string` | The ID of the currently active tab (used for highlight) |
| `actions` | `React.ReactNode` | Optional content rendered on the right side of the header (e.g., Save button) |
| `onTabClick` | `(tabId: string) => void` | When provided, in-page tabs (target, prompts, plugins, diagnostics) render as buttons that call this callback instead of navigating. Used by the main settings page. |

### Current Navigation Tabs

| ID | Label | Route | Type |
|----|-------|-------|------|
| `target` | Target Site | `/settings` | In-page tab |
| `prompts` | Prompts | `/settings` | In-page tab |
| `plugins` | Plugins | `/settings` | In-page tab |
| `diagnostics` | Diagnostics | `/settings` | In-page tab |
| `field-mappings` | Field Mapping | `/settings/field-mappings` | Separate page |
| `tab-layout` | Tab Layout | `/settings/tab-layout` | Separate page |
| `views` | Views | `/settings/views` | Separate page (gated by `custom-views` plugin) |

In-page tabs live on `/settings` and are controlled by local state. When clicked from a sub-page (no `onTabClick`), they navigate to `/settings`.

## Adding a New Settings Page

1. **Create the page** at `src/app/settings/your-page/page.tsx`

2. **Add the nav tab** in `src/components/SettingsNav.tsx`:
   ```tsx
   // Add to NAV_ITEMS array
   { id: 'your-page', label: 'Your Page', icon: YourIcon, href: '/settings/your-page', inPage: false },
   ```

3. **Use `SettingsNav` in your page**:
   ```tsx
   'use client';

   import { SettingsNav } from '@/components/SettingsNav';

   export default function YourPage(): React.ReactElement {
     return (
       <div className="min-h-screen bg-gray-50">
         <SettingsNav activeTab="your-page" />
         <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
           {/* Your content */}
         </main>
       </div>
     );
   }
   ```

4. **With a save button**:
   ```tsx
   <SettingsNav
     activeTab="your-page"
     actions={
       <button
         onClick={handleSave}
         disabled={!hasChanges || isSaving}
         className={cn(
           'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
           hasChanges
             ? 'bg-brand-600 text-white hover:bg-brand-700'
             : 'bg-gray-300 text-gray-500 cursor-not-allowed'
         )}
       >
         <Save className="w-4 h-4" />
         {isSaving ? 'Saving...' : 'Save'}
       </button>
     }
   />
   ```

## Page Layout Conventions

- **Container**: `max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8`
- **Description**: `<p className="text-sm text-gray-500 mb-6">` below the nav
- **Content cards**: `bg-white rounded-xl border border-gray-200 p-6`
- **Toast notifications**: Fixed top-right with auto-dismiss (see existing pages for pattern)
- **Loading state**: Centered spinner with `<RefreshCw className="w-8 h-8 text-brand-600 animate-spin" />`
