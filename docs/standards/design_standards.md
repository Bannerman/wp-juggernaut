# Design Standards

UI design patterns and component standards for Juggernaut. All styling uses TailwindCSS utility classes.

## Color System

### Brand Colors
- **Primary**: `brand-600` (main actions), `brand-700` (hover)
- **Primary subtle**: `brand-50` (backgrounds), `brand-100` (hover bg), `brand-200` (borders), `brand-600` (text)

### Neutral Colors
- **Text primary**: `gray-900`
- **Text secondary**: `gray-700`
- **Text muted**: `gray-500`
- **Text faint**: `gray-400`
- **Borders**: `gray-200` (default), `gray-300` (inputs/interactive)
- **Backgrounds**: `gray-50` (page), `white` (cards)

### Semantic Colors
- **Success**: `green-50/100/700` (bg/badge/text)
- **Error**: `red-50/200/700` (bg/border/text)
- **Warning**: `amber-50/200/700`

### Category Colors (field mapping, taxonomies)
- **Core**: `blue-50/100/200/600/700`
- **Meta**: `purple-50/100/200/600/700`
- **Taxonomy**: `green-50/100/200/600/700`

## Typography

- **Page headings**: `text-lg font-semibold text-gray-900`
- **Section headings**: `text-sm font-semibold text-gray-700`
- **Body text**: `text-sm text-gray-700`
- **Descriptions**: `text-sm text-gray-500`
- **Labels**: `text-xs font-medium text-gray-500 uppercase tracking-wider`
- **Badges**: `text-[10px] font-medium uppercase`
- **Monospace/code**: `font-mono text-[11px] text-gray-500/70`

## Buttons

### Primary Action
Main CTA buttons (Save, Push, Create).

```
className={cn(
  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
  'bg-brand-600 text-white hover:bg-brand-700',
  'disabled:opacity-50 disabled:cursor-not-allowed'
)}
```

### Secondary Action
Secondary actions (Reset, Cancel).

```
className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
```

### Toggle Button (Bordered)
Stateful toggle buttons for enabling/disabling features. Shows active state with brand colors.

```
className={cn(
  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors',
  isActive
    ? 'bg-brand-50 border-brand-200 text-brand-600'
    : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700'
)}
```

### Subtle Action Button
Secondary actions within cards/sections (History, View Details).

```
className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
```

### Icon-Only Button
Small toolbar actions (edit, move, delete).

```
// Default
className="p-0.5 rounded hover:bg-brand-100"

// Destructive
className="p-0.5 rounded hover:bg-red-100 text-gray-400 hover:text-red-600"
```

### Segmented Toggle Group
Pill-style grouped buttons for switching views.

```
// Container
className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg"

// Individual button
className={cn(
  'px-3 py-1 rounded-md text-xs font-medium transition-colors',
  isActive
    ? 'bg-white text-gray-900 shadow-sm'
    : 'text-gray-500 hover:text-gray-700'
)}
```

### Split Button
Primary action with dropdown for secondary option (Sync).

```
// Left button
className="flex items-center gap-2 px-4 py-2 rounded-l-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"

// Right dropdown
className="flex items-center px-2 py-2 rounded-r-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 border-l border-gray-300"
```

### Add/Create Button (Dashed)
For adding new items to a list.

```
className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-500 hover:text-brand-600 hover:bg-gray-50 rounded-lg border border-dashed border-gray-300 hover:border-brand-300 transition-colors"
```

### Status Toggle Button
Plugin enable/disable with colored state.

```
className={cn(
  'flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all',
  isEnabled
    ? 'bg-green-100 text-green-700 hover:bg-green-200'
    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
)}
```

## Layout

### Page Structure
```
<div className="min-h-screen bg-gray-50">
  <SettingsNav activeTab="..." actions={...} />
  <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
    {/* Page content */}
  </main>
</div>
```

### Cards
```
className="bg-white rounded-xl border border-gray-200 p-6"
```

For smaller cards or list items:
```
className="bg-white rounded-lg border border-gray-200 p-4"
```

### Form Inputs
```
// Select / Text input
className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"

// Smaller variant
className="w-full px-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
```

### Toast Notifications
Fixed position, top-right corner with auto-dismiss.

```
// Container
className="fixed top-4 right-4 z-50 max-w-sm"

// Success
className="flex items-center gap-3 p-4 rounded-lg bg-green-50 text-green-700 shadow-lg border border-green-200"

// Error
className="flex items-center gap-3 p-4 rounded-lg bg-red-50 text-red-700 shadow-lg border border-red-200"
```

## Spacing Conventions

- **Page padding**: `px-4 sm:px-6 lg:px-8 py-6`
- **Card padding**: `p-6` (standard), `p-4` (compact)
- **Section gap**: `space-y-6`
- **Item gap**: `space-y-2`
- **Button icon gap**: `gap-2` (standard), `gap-1.5` (compact)
- **Button padding**: `px-4 py-2` (standard), `px-3 py-1.5` (compact)

## Border Radius

- **Cards**: `rounded-xl` (page-level), `rounded-lg` (nested)
- **Buttons**: `rounded-lg`
- **Inputs**: `rounded-lg`
- **Badges**: `rounded-full`
- **Small elements**: `rounded-md` or `rounded`

## Icons

Use `lucide-react` for all icons. Standard sizes:
- **In buttons**: `w-4 h-4` (standard), `w-3.5 h-3.5` (compact)
- **Standalone**: `w-5 h-5`
- **Large/loading**: `w-8 h-8`
- **Inline small**: `w-3 h-3`

## Navigation

### Settings Navigation
Use the shared `<SettingsNav>` component for all settings sub-pages. See `docs/settings-pages.md` for details.

### Tab Navigation (in-page)
Border-bottom style tabs using `SettingsNav` with `onTabClick` for in-page tab switching.

```
className={cn(
  'py-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
  isActive
    ? 'border-brand-500 text-brand-600'
    : 'border-transparent text-gray-500 hover:text-gray-700'
)}
```

## Loading States

- **Full page**: Centered spinner with `<RefreshCw className="w-8 h-8 text-brand-600 animate-spin" />`
- **Button loading**: Replace icon with `<Loader2 className="w-4 h-4 animate-spin" />` and update label text
- **Disabled during load**: `disabled:opacity-50 disabled:cursor-not-allowed`
