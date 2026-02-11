# Developer Guide

> **Start here** if you're new to the Juggernaut codebase. This document explains how the app works, how the pieces fit together, and where to find things.

For coding standards, see [`docs/standards/coding_standards.md`](docs/standards/coding_standards.md).
For AI agent instructions, see [`AGENTS.md`](AGENTS.md).
For the v1.0 technical spec and roadmap, see [`docs/v1.0-spec.md`](docs/v1.0-spec.md).

---

## What Is Juggernaut?

Juggernaut is a **desktop app for managing WordPress content**. It syncs posts from a WordPress site into a local SQLite database, lets you bulk-edit them offline, and pushes changes back with conflict detection.

It's built for content teams that need to edit dozens or hundreds of WordPress posts at once — changing taxonomies, updating meta fields, managing SEO data — without doing it one-by-one in the WordPress admin.

### Key Concepts

- **Local-first**: All data lives in a local SQLite database. You can edit offline.
- **Profile-driven**: A JSON profile defines what post types, taxonomies, plugins, and UI tabs are available for a given WordPress site.
- **Plugin-based**: WordPress plugin integrations (MetaBox, SEOPress, etc.) are handled by Juggernaut plugins that extend sync, push, and UI behavior.
- **Workspace**: A workspace groups related sites (e.g. `plexkits.com` + `dev.plexkits.com`) that share the same profile and post type structure. Each workspace has its own database.

---

## Data Flow

This is the core loop of the application:

```
WordPress REST API
       │
       ▼
   ┌────────┐     Fetches posts, taxonomies, meta fields
   │  SYNC  │     via WP REST API (paginated, batched)
   │ Engine │     Stores in local SQLite tables:
   └────┬───┘     resources, post_meta, resource_terms, terms
        │
        ▼
   ┌────────┐     User edits in ResourceTable → EditModal
   │ LOCAL  │     Changes set is_dirty = 1
   │ SQLite │     Meta fields stored as JSON in post_meta
   └────┬───┘     Taxonomy assignments in resource_terms
        │
        ▼
   ┌────────┐     Reads dirty resources, builds payload
   │  PUSH  │     Checks modified_gmt for conflicts
   │ Engine │     Batch updates via WP REST API (max 25/batch)
   └────┬───┘     Clears is_dirty on success, re-syncs timestamps
        │
        ▼
WordPress REST API
```

### Sync Details

1. **Full sync**: Fetches ALL taxonomy terms (parallel), then ALL resources (paginated). Detects deletions by comparing local IDs vs server IDs.
2. **Incremental sync**: Fetches only resources modified since `last_sync_time`. Skips deletion detection.
3. **Conflict prevention**: If a local resource has `is_dirty = 1`, sync preserves that flag so unsaved edits aren't lost.

### Push Details

1. Reads all resources where `is_dirty = 1`
2. For each, compares local `modified_gmt` with server's current `modified_gmt`
3. If they match → safe to push. If different → conflict (someone edited on WordPress since last sync)
4. Sends updates in batches of 25 via the WP batch API endpoint
5. On success: clears `is_dirty`, updates `modified_gmt` and `synced_at`

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                         ELECTRON SHELL                          │
│  main.ts │ preload.ts │ safeStorage (Keychain) │ auto-updater  │
├─────────────────────────────────────────────────────────────────┤
│                         UI LAYER                                │
│  ResourceTable │ EditModal │ FilterPanel │ Settings pages        │
│  Tab system: Core tabs + Plugin-provided tabs (dynamic)         │
├─────────────────────────────────────────────────────────────────┤
│                       API ROUTES (Next.js)                      │
│  /sync │ /push │ /resources │ /terms │ /profile │ /plugins      │
│  /discover │ /field-audit │ /seo │ /site-config │ /stats        │
│  /test-connection │ /upload │ /field-mappings │ /tab-layout      │
│  /discover-fields │ /prompt-templates                           │
├─────────────────────────────────────────────────────────────────┤
│                      PLUGIN SYSTEM                              │
│  Registry │ Loader │ Hooks (priority-ordered) │ Types           │
│  Bundled: MetaBox, SEOPress                                     │
├─────────────────────────────────────────────────────────────────┤
│                      CORE SERVICES                              │
│  wp-client.ts │ sync.ts │ push.ts │ queries.ts │ db.ts          │
├─────────────────────────────────────────────────────────────────┤
│                     PROFILE SYSTEM                              │
│  ProfileManager │ Site Profiles (JSON) │ Site Config             │
└─────────────────────────────────────────────────────────────────┘
```

### Layer Responsibilities

- **Electron Shell** (`src/electron/`): Window management, macOS Keychain credential storage via `safeStorage`, auto-updates via `electron-updater`, IPC bridge between renderer and main process.
- **UI Layer** (`src/components/`): React components. `ResourceTable` for the main data grid (TanStack React Table), `EditModal` for editing a single resource across tabbed views, `FilterPanel` for search/taxonomy/status filtering.
- **API Routes** (`src/app/api/`): Next.js route handlers that bridge UI ↔ business logic. One handler per HTTP method, always returns `NextResponse`, wrapped in try-catch.
- **Plugin System** (`src/lib/plugins/`): Hook-based extensibility. Plugins implement `JuggernautPlugin` interface and can transform data during sync/push and provide UI tabs.
- **Core Services** (`src/lib/`): Business logic — WordPress API client, sync/push engines, SQLite query layer, database management.
- **Profile System** (`src/lib/profiles/`): JSON configs that define post types, taxonomies, required plugins, UI tabs, and site targets for a WordPress site.

---

## Profile System

A profile is a JSON file that configures everything about a WordPress site. See `src/lib/profiles/plexkits.json` for a full example.

### Key Sections

```json
{
  "profile_id": "my-site",
  "profile_name": "My WordPress Site",
  "sites": [
    { "id": "local", "name": "Local Dev", "url": "http://my-site.local" },
    { "id": "production", "name": "Production", "url": "https://my-site.com", "is_default": true }
  ],
  "post_types": [
    { "slug": "post", "name": "Post", "rest_base": "posts", "is_primary": true }
  ],
  "taxonomies": [
    { "slug": "category", "name": "Category", "rest_base": "categories", "editable": true, "show_in_filter": true }
  ],
  "required_plugins": [
    { "id": "metabox", "auto_enable": true }
  ],
  "plugin_settings": { ... },
  "ui": {
    "tabs": [ ... ],
    "field_layout": { ... }
  }
}
```

- **`sites`**: Multiple targets (local/staging/production) for the same WordPress setup
- **`post_types`**: What content types to sync. The `is_primary` one is used by default.
- **`taxonomies`**: Which taxonomies to sync, show in filters, and allow editing
- **`required_plugins`**: Which Juggernaut plugins to auto-enable for this profile
- **`ui.tabs`**: Tab order and source (core vs plugin) for the EditModal
- **`ui.field_layout`**: Which fields appear on each tab and how they render

The `ProfileManager` (`src/lib/profiles/index.ts`) is a singleton that auto-loads the default profile on first access.

---

## Plugin System

Plugins extend Juggernaut's ability to work with WordPress ecosystem plugins (MetaBox, SEOPress, ACF, etc.).

### Plugin Interface

Every plugin implements `JuggernautPlugin` (defined in `src/lib/plugins/types.ts`):

```typescript
interface JuggernautPlugin {
  id: string;
  name: string;
  version: string;
  manifest: PluginManifest;

  // Lifecycle
  initialize(core: CoreAPI): Promise<void>;
  activate(profile: SiteProfile, settings: Record<string, unknown>): Promise<void>;
  deactivate(): Promise<void>;

  // Data hooks (sync/push transformation)
  transformResourceForSync?(resource: WPResource): Promise<WPResource>;
  transformResourceForPush?(resource: LocalResource, payload: PushPayload): Promise<PushPayload>;

  // UI extensions
  getTabs?(): TabDefinition[];
  getFieldRenderers?(): Record<string, ComponentType<FieldRendererProps>>;
  getSettingsPanel?(): ComponentType<SettingsPanelProps>;
  getFilterComponents?(): ComponentType<FilterComponentProps>[];

  // WordPress detection
  detectWordPressPlugin?(baseUrl: string, authHeader: string): Promise<boolean>;
}
```

### How Plugins Work

1. **Registration**: Bundled plugins are registered in `src/lib/plugins/bundled/index.ts`
2. **Loading**: `PluginLoader` initializes plugins and calls their lifecycle methods
3. **Hooks**: The hook system (`hooks.ts`) fires events like `beforeSync`, `afterPush` with priority ordering. Plugins subscribe to hooks they care about.
4. **UI**: Plugins can provide tabs via `getTabs()` and field renderers via `getFieldRenderers()` — the EditModal renders these dynamically.

### Bundled Plugins

| Plugin | Path | What It Does |
|--------|------|-------------|
| **MetaBox** | `src/lib/plugins/bundled/metabox/` | Syncs/pushes MetaBox custom fields, provides field type renderers |
| **SEOPress** | `src/lib/plugins/bundled/seopress/` | Syncs/pushes SEOPress SEO data (title, description, OG, robots) |

---

## Database Schema

SQLite database with WAL mode. Schema defined in `src/lib/db.ts`.

| Table | Purpose |
|-------|---------|
| `resources` | Core post data (title, slug, status, content, excerpt, dates, `is_dirty` flag) |
| `post_meta` | Custom field values as JSON (one row per field per resource) |
| `resource_terms` | Many-to-many: which taxonomy terms are assigned to which resources |
| `terms` | All taxonomy terms (id, name, slug, taxonomy, parent) |
| `seo_data` | SEOPress data (title, description, OG, canonical, robots) |
| `change_log` | Audit trail of local edits (post_id, field, old_value, new_value) |
| `sync_meta` | Key-value store for sync metadata (e.g. `last_sync_time`) |

### Key Patterns

- **Singleton**: `getDb()` returns one connection per process
- **WAL mode**: Enables concurrent reads while writing
- **Prepared statements**: All queries use parameterized statements (no string concatenation)
- **Transactions**: Multi-table writes wrapped in transactions for atomicity
- **Dirty tracking**: `is_dirty = 1` set on local edit, cleared after successful push

---

## Development Setup

### Prerequisites

- **Node.js 20+** (v25 has ABI compatibility issues with Electron's native modules)
- **npm 9+**

### Quick Start

```bash
git clone https://github.com/Bannerman/wp-juggernaut.git
cd wp-juggernaut/src
npm install
cp .env.example .env.local
# Edit .env.local with your WordPress credentials
npm run dev
# Open http://localhost:3000
```

### Environment Variables

Copy `src/.env.example` to `src/.env.local`:

```
WP_BASE_URL=https://your-site.com
WP_USERNAME=your-wp-username
WP_APP_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx
DATABASE_PATH=./data/juggernaut.db
```

Your WordPress site needs:
- REST API enabled (WordPress 5.9+)
- Application Password created (WP Admin → Users → Your Profile)
- `show_in_rest: true` on any custom post types you want to manage
- MB REST API plugin if using MetaBox fields

### Running in Development

```bash
cd src

# Web only (Next.js dev server)
npm run dev                 # http://localhost:3000

# Electron (two terminals)
npm run dev                 # Terminal 1: Start Next.js first
npm run electron:dev        # Terminal 2: Launch Electron after Next.js is ready

# Testing
npm run test                # Run Jest test suite
npm run test:watch          # Watch mode
npm run lint                # ESLint check
```

### Building for Distribution

```bash
cd src
npm run electron:build:mac  # Builds macOS app (Intel + Apple Silicon)
# Output: src/dist-electron/
```

---

## Common Tasks

### "I want to add support for a new WordPress plugin"

See the **[Plugin Authoring Guide](docs/plugin-authoring.md)** for a complete walkthrough with code examples.

**Quick version:**

1. Copy the example skeleton: `cp -r src/lib/plugins/bundled/_example src/lib/plugins/bundled/your-plugin`
2. Edit `manifest.json` with your plugin's metadata
3. Implement your plugin class in `index.ts` (lifecycle, hooks, detection)
4. Register it in `src/lib/plugins/bundled/index.ts`
5. Add data transform hooks for sync/push if the plugin stores custom fields
6. Optionally register custom field renderers via `registerFieldRenderer()` from `@/components/fields`
7. Optionally register custom tab components via `registerPluginTab()` from `@/components/fields`
8. Add to a profile's `required_plugins` to activate it
9. **Zero changes to core code required** — the plugin system handles discovery, lifecycle, and UI wiring

### "I want to add a new API route"

1. Create `src/app/api/your-route/route.ts`
2. Export async handler functions (`GET`, `POST`, `PUT`, `DELETE`)
3. Use `NextResponse.json()` for responses, wrap in try-catch
4. See existing routes in `src/app/api/` for patterns

### "I want to add a new settings page"

See [`docs/settings-pages.md`](docs/settings-pages.md) for step-by-step instructions. Use the shared `<SettingsNav>` component.

### "I want to understand the EditModal tabs"

- **Core tabs** (`basic`, `classification`, `ai`): Always show, built into the app
- **Plugin tabs** (e.g. `seo`): Provided by enabled plugins
- **Dynamic tabs**: Defined in the profile's `ui.tabs` + `ui.field_layout`, rendered via `DynamicTab` + `FieldRenderer`
- Tab Layout Editor (`/settings/tab-layout`) lets users visually configure dynamic tabs

### "I want to understand how taxonomies work"

1. Profile defines available taxonomies in `taxonomies[]`
2. Sync fetches all terms per taxonomy from WP REST API
3. Terms stored in `terms` table, assignments in `resource_terms`
4. On push, taxonomy data is sent both as top-level REST fields AND as `meta_box.tax_xyz` fields (dual push for MetaBox compatibility)
5. `tax_xyz` meta keys are filtered from Tab Layout and Field Mapping to avoid double-editing

---

## Known Issues & Gotchas

### Native Module ABI Mismatch

`better-sqlite3` is a native Node.js module. When compiled for Electron's bundled Node.js (ABI 125), it breaks `npm run dev` on system Node.js (different ABI). If you hit `MODULE_NOT_FOUND` errors with better-sqlite3:

```bash
cd src
npm rebuild better-sqlite3
```

### EditModal Size

`EditModal.tsx` is ~1,965 lines — it's a known monolith. The plan is to refactor it into a generic shell + plugin-provided tab components (see `docs/v1.0-spec.md` Phase C).

### PLEXKITS Hardcoding

Some files still contain references to "PLEXKITS" (the original WordPress site this was built for). These are being systematically removed as part of the v1.0 generalization effort. The bundled `plexkits.json` profile is the intended home for all site-specific configuration.

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/lib/db.ts` | SQLite database singleton, schema, migrations |
| `src/lib/wp-client.ts` | WordPress REST API client (profile-driven) |
| `src/lib/sync.ts` | Sync engine (full + incremental) |
| `src/lib/push.ts` | Push engine (batch + conflict detection) |
| `src/lib/queries.ts` | SQLite query abstractions (CRUD for resources, terms, meta) |
| `src/lib/site-config.ts` | Multi-site target switching |
| `src/lib/plugins/types.ts` | All plugin/profile TypeScript interfaces (~700 lines) |
| `src/lib/plugins/hooks.ts` | Hook system (subscribe/trigger with priorities) |
| `src/lib/plugins/registry.ts` | Plugin enable/disable, state persistence |
| `src/lib/plugins/loader.ts` | Plugin lifecycle management |
| `src/lib/profiles/index.ts` | ProfileManager singleton |
| `src/components/EditModal.tsx` | Resource editing modal (tabs, fields, save) |
| `src/components/ResourceTable.tsx` | Main data grid (TanStack React Table) |
| `src/electron/main.ts` | Electron main process, Keychain, auto-updater |
| `project-manifest.yaml` | Module registry — check here before adding new files |

---

## Further Reading

- [`docs/v1.0-spec.md`](docs/v1.0-spec.md) — Full technical spec with architecture analysis and implementation plan
- [`docs/standards/coding_standards.md`](docs/standards/coding_standards.md) — Code style rules
- [`docs/standards/design_standards.md`](docs/standards/design_standards.md) — UI/Tailwind patterns
- [`docs/settings-pages.md`](docs/settings-pages.md) — How to add settings pages
- [`docs/adr/`](docs/adr/) — Architecture Decision Records
- [`docs/work-items/`](docs/work-items/) — Task tracking
- [`modules/*/spec.yaml`](modules/) — Module specifications (interfaces, data models, business logic)
