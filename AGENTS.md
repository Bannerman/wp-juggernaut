# **AI Agent Guidelines for Juggernaut**

This document is the **single source of truth** for AI agents (Windsurf Cascade, Claude Code, etc.) and human developers working on **Juggernaut**. For a human-friendly onboarding guide, see [`DEVELOPER.md`](DEVELOPER.md).

## **CRITICAL: Always Work From a Plan**

**NEVER start building without a documented plan.**

Before making significant changes:
1. Check if `/docs/v1.0-spec.md` exists and is up to date
2. If no plan exists, CREATE ONE FIRST before writing any code
3. If the plan is outdated, UPDATE IT before proceeding
4. For new features, add them to the plan and get user approval

The spec document (`docs/v1.0-spec.md`) contains architecture decisions, implementation roadmap (§13), PLEXKITS hardcoding audit (§14), blockers (§15), backlog (§16), and what's completed vs. in progress.

**Do not rely on conversation context alone** — plans get lost when conversations compact.

## **1. Project Overview**

**Juggernaut** is a modular, plugin-based WordPress content management platform. It's a local-first desktop application (Electron + Next.js) designed to sync, bulk edit, and push WordPress posts. It leverages a profile-driven architecture with extensible plugin support and multi-site target switching.

**Repository**: https://github.com/Bannerman/wp-juggernaut

**Tech Stack:**
- **Desktop:** Electron 31 with auto-updates via GitHub Releases
- **Frontend:** Next.js 14 (App Router) + React 18
- **Language:** TypeScript 5.4 (Strict mode)
- **Styling:** TailwindCSS 3.4
- **Database:** SQLite 3 (via `better-sqlite3`, WAL mode)
- **HTTP Client:** Native Fetch API
- **WordPress Integration:** WP REST API (Application Passwords)
- **Testing:** Jest + Testing Library
- **UI Libraries:** Tanstack React Table, Lucide icons, clsx + tailwind-merge

**Current Version:** 0.9.8

### **Project Structure**

```
wp-juggernaut/
├── README.md                    # Project overview and setup
├── AGENTS.md                    # This file — AI agent & developer guidelines
├── CLAUDE.md                    # Points to this file (for Claude Code)
├── DEVELOPER.md                 # Human developer onboarding guide
├── project-manifest.yaml        # Central project registry & module mapping
├── docs/                        # All project documentation
│   ├── requirements/            # Functional requirements
│   ├── standards/               # Coding standards, design standards, global rules
│   ├── adr/                     # Architecture Decision Records
│   └── work-items/              # Task tracking and planning
├── modules/                     # Module Specifications (7 specs)
│   └── [module-name]/
│       └── spec.yaml            # Module specification (Requirements & API)
├── src/                         # Implementation (Source Code)
│   ├── app/                     # Next.js App Router (Pages & API Routes)
│   │   ├── api/                 # API route groups
│   │   └── settings/            # Settings pages
│   ├── components/              # Shared UI components
│   ├── lib/                     # Core logic (Sync, Push, DB, Queries, Plugins)
│   │   ├── plugins/             # Plugin system (hooks, registry, loader, bundled)
│   │   ├── profiles/            # Site-specific configurations
│   │   └── __tests__/           # Unit tests for core modules
│   ├── electron/                # Electron main process files
│   ├── types/                   # TypeScript declarations
│   └── prompt-templates/        # AI prompt template files
└── .github/workflows/           # CI/CD (release.yml)
```

## **2. Common Commands**

All commands run from the `src/` directory:

```bash
cd src

# Development
npm run dev              # Start Next.js dev server (http://localhost:3000)
npm run electron:dev     # Run Electron in development (start dev server first)
npm run lint             # ESLint check
npm run test             # Jest test suite
npm run test:watch       # Tests in watch mode

# Building
npm run build            # Build Next.js for production
npm run build:electron   # Compile Electron TypeScript
npm run electron:build:mac  # Build macOS app locally

# Database
npm run db:init          # Initialize SQLite database
```

### **Environment Setup**

Copy `src/.env.example` to `src/.env.local`:

```
WP_BASE_URL=https://your-site.com
WP_USERNAME=<wp-username>
WP_APP_PASSWORD=<application-password>
DATABASE_PATH=./data/juggernaut.db
```

## **3. Key Patterns**

- **Database singleton**: `getDb()` lazily initializes one connection with WAL mode
- **Dirty flag tracking**: `is_dirty = 1` on local edit, cleared after push
- **Conflict detection**: Compares `modified_gmt` timestamps before push
- **Batch push**: Groups of 25 via WP batch API
- **Plugin system**: Hook-based extensibility with priority ordering
- **Profile system**: JSON configurations per WordPress site
- **Tab system**: `CORE_TAB_IDS` (basic, classification) always show regardless of plugins; `HARDCODED_TAB_IDS` matches core tabs (custom JSX in EditModal). Plugin tabs like `seo` and `ai` are registered via `registerPluginTab()` and rendered dynamically. All other tabs are profile-driven via `DynamicTab` + `FieldRenderer`
- **Taxonomy dual push**: Taxonomy data is sent both as top-level REST fields AND as `meta_box.tax_xyz` fields; `tax_xyz` meta keys are filtered from Tab Layout and Field Mapping available fields to avoid double-editing
- **Environment indicator**: Header shows workspace name (from `profile_name`) + colored environment badge (red=production, yellow=staging, green=development). Environment is set via explicit `environment` field in profile `sites[]`, with auto-derivation from site `id` as fallback
- **Custom views**: Resource table columns are driven by `ui.views[]` in the profile JSON. Each `ViewConfig` has a name, optional post type filter, and an ordered `columns: ViewColumn[]` array. The `ViewSwitcher` component replaces the old hardcoded General/Power/Downloads toggle. Views with `built_in: 'downloads'` render `DownloadsTable` instead of `ResourceTable`. Title and Actions columns are always implicit (not in the columns array). Profiles without `ui.views` auto-generate defaults from `show_in_table` taxonomy config + `ui.power_columns` for backward compatibility. Active view per post type is persisted in localStorage. The Custom Views plugin gates access to `/settings/views` but views render regardless of plugin status

## **4. Module Registry & Mapping**

### **Modules with Specifications** (`modules/*/spec.yaml`)

| Module | Spec Path | Implementation Path | Status |
| :--- | :--- | :--- | :--- |
| **database** | `modules/database/spec.yaml` | `src/lib/db.ts` | Implemented |
| **wp-client** | `modules/wp-client/spec.yaml` | `src/lib/wp-client.ts` | Implemented |
| **sync-engine** | `modules/sync-engine/spec.yaml` | `src/lib/sync.ts` | Implemented |
| **queries** | `modules/queries/spec.yaml` | `src/lib/queries.ts` | Implemented |
| **push-engine** | `modules/push-engine/spec.yaml` | `src/lib/push.ts` | Implemented |
| **api-routes** | `modules/api-routes/spec.yaml` | `src/app/api/*` | Implemented |
| **ui-components** | `modules/ui-components/spec.yaml` | `src/components/*` | Implemented |

### **Additional Implementation (No Spec)**

These were added during Phase 2 and do not have corresponding `modules/*/spec.yaml` files:

| Feature | Implementation Path | Description |
| :--- | :--- | :--- |
| **plugins** | `src/lib/plugins/*` | Hook-based plugin system with registry & loader |
| **profiles** | `src/lib/profiles/*` | Site-specific JSON configurations |
| **electron** | `src/electron/*` | Desktop shell, auto-updater, IPC bridge |
| **discovery** | `src/lib/discovery.ts` | WordPress site scanning (post types, taxonomies, plugins) |
| **field-audit** | `src/lib/field-audit.ts` | Field integrity auditing between local DB and WordPress |
| **image-processing** | `src/lib/imageProcessing.ts` | Modular image processing pipeline for uploads |
| **prompt-templates** | `src/lib/prompt-templates.ts` | AI prompt template management for content generation |
| **site-config** | `src/lib/site-config.ts` | Multi-site target switching with environment type derivation |
| **environment-indicator** | `src/components/EnvironmentIndicator.tsx` | Workspace name + colored environment badge for header |
| **custom-views** | `src/lib/plugins/bundled/custom-views/` | Feature-flag plugin gating `/settings/views` editor |
| **view-switcher** | `src/components/ViewSwitcher.tsx` | Dynamic view toggle for resource table (replaces hardcoded 3-button toggle) |
| **utils** | `src/lib/utils.ts` | Shared utilities (cn, HTML decode, date formatting) |

### **API Routes** (`src/app/api/`)

| Route | Purpose |
| :--- | :--- |
| `/api/sync` | Sync resources from WordPress |
| `/api/push` | Push local changes to WordPress |
| `/api/resources` | CRUD operations on resources |
| `/api/terms` | Taxonomy term management |
| `/api/profile` | Site profile configuration |
| `/api/profile/import-export` | Profile import (POST) and export (GET) |
| `/api/plugins` | Plugin management |
| `/api/discover` | WordPress site discovery |
| `/api/discover-fields` | Discover meta/taxonomy fields per post type from WP |
| `/api/field-audit` | Field integrity auditing |
| `/api/field-mappings` | Field mapping CRUD (auto-discovers fields from WP) |
| `/api/tab-layout` | Tab layout CRUD (create/reorder/delete custom tabs, assign fields) |
| `/api/views` | Custom views CRUD (GET loads views + available columns, PUT saves views to profile) |
| `/api/prompt-templates` | AI prompt template CRUD |
| `/api/seo` | SEO data management |
| `/api/site-config` | Multi-site target switching |
| `/api/stats` | Dashboard statistics |
| `/api/test-connection` | WordPress connection testing |
| `/api/upload` | File/image uploads |

## **5. Plugin System**

Juggernaut uses a modular plugin architecture. See **[`docs/plugin-authoring.md`](docs/plugin-authoring.md)** for the full plugin creation guide with step-by-step instructions and a copy-pasteable skeleton (`src/lib/plugins/bundled/_example/`).

- **Bundled Plugins** (`src/lib/plugins/bundled/`): MetaBox, SEOPress, AI Fill, Convert Post Type, WooCommerce, Custom Views, _example (template)
- **Profile System** (`src/lib/profiles/`): Site-specific configurations (e.g., `plexkits-resources.json`)
- **Hook System** (`src/lib/plugins/hooks.ts`): Event-driven extension points with priority ordering
- **Plugin Registry** (`src/lib/plugins/registry.ts`): Plugin registration and lifecycle
- **Plugin Loader** (`src/lib/plugins/loader.ts`): Dynamic plugin loading
- **Plugin Types** (`src/lib/plugins/types.ts`): Shared type definitions (~700 lines of interfaces)
- **UI Registration** (`src/components/fields/`): `registerFieldRenderer()` for custom field types, `registerPluginTab()` for custom tab components

## **6. Settings Pages**

Settings are accessible from the gear icon in the main UI:

- **`/settings`** — Main settings page (post type configs, plugin management)
- **`/settings/field-mappings`** — Map fields between post types for conversion
- **`/settings/tab-layout`** — Visual editor for configuring custom EditModal tabs and their fields per post type
- **`/settings/views`** — Visual editor for configuring custom resource table views with column selection per post type (gated by `custom-views` plugin)

### **Custom Views Architecture**

The resource table renders columns driven by `ViewConfig` objects stored in `ui.views[]` in the profile JSON. Each view has a name, optional post type filter, and an ordered `columns: ViewColumn[]` array. The `ViewSwitcher` component dynamically shows available views filtered for the active post type.

- **Profile storage**: Profile JSON → `ui.views[]` (view definitions with column arrays)
- **Column sources**: `core` (status, dates), `taxonomy` (term badges with max_display), `meta` (text/count/download_stats from meta_box)
- **Implicit columns**: Title (always first after checkbox) and Actions (always last) are not in the columns array
- **Built-in views**: Views with `built_in: 'downloads'` render `DownloadsTable` instead of the generic column loop
- **Safe merge**: PUT uses `initialViewIds` to diff deleted vs. never-loaded views (same pattern as Tab Layout)
- **In-memory sync**: After file save, `ProfileManager.setViews()` updates the singleton
- **Migration fallback**: Profiles without `ui.views` auto-generate defaults from `show_in_table` taxonomies + `ui.power_columns`
- **Persistence**: Active view per post type stored in localStorage

### **Tab Layout Architecture**

The EditModal has core tabs (Basic, Classification) that always show, plugin tabs (SEO via SEOPress, AI Fill via ai-fill plugin), and dynamic tabs defined in `ui.tabs` + `ui.field_layout` in the profile JSON. The Tab Layout editor allows visual configuration of dynamic tabs:

- **Profile storage**: Profile JSON → `ui.tabs[]` (tab definitions) + `ui.field_layout{}` (fields per tab)
- **Field discovery**: Available fields are discovered from WordPress via `discoverFieldsForPostType()`
- **Safe merge**: PUT uses `initialTabIds` to diff what was deleted vs. never loaded, preventing accidental deletion of tabs scoped to other post types
- **In-memory sync**: After file save, `ProfileManager.setTabs()` / `setFieldLayout()` update the singleton

See `docs/settings-pages.md` for detailed instructions on adding new settings pages.

## **7. Electron Desktop App**

### **Development Workflow**

```bash
# Terminal 1: Start Next.js
npm run dev

# Terminal 2: Start Electron (after Next.js is ready)
npm run electron:dev
```

### **Electron Files**

| File | Purpose |
|------|---------|
| `electron/main.ts` | Main process, window, auto-updater, Keychain credentials |
| `electron/preload.ts` | Secure renderer ↔ main IPC bridge |
| `electron/server.ts` | Production Next.js server |
| `electron-builder.yml` | Build configuration |
| `components/UpdateNotifier.tsx` | Update status UI |
| `types/electron.d.ts` | TypeScript declarations |

### **Credential Flow**

| Mode | Storage | Notes |
|------|---------|-------|
| **Electron** | macOS Keychain via `safeStorage` | Encrypted, injected as env vars |
| **Dev/Browser** | `site-config.json` or `.env.local` | Written by settings UI or manual |

### **Auto-Update System**

- App checks for updates on startup (3 second delay)
- Downloads from GitHub Releases (`latest-mac.yml` has version info and checksums)
- `UpdateNotifier` component shows update status in UI

### **Code Signing (Optional)**

For signed releases, add GitHub Secrets: `MAC_CERTIFICATE`, `MAC_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`. Then update `.github/workflows/release.yml` to enable signing.

## **8. Coding Standards**

All code must adhere to `docs/standards/coding_standards.md`. Key mandates:

- **TypeScript:** Strict mode, explicit return types, `import type` for types, no `any` (use `unknown`)
- **React:** Arrow function components, `handle*` handlers, `on*` callback props, `'use client'` directive
- **API routes:** One handler per method, always `NextResponse`, wrap in try-catch
- **Database:** `better-sqlite3`, singleton pattern in `src/lib/db.ts`, prepared statements, transactions for multi-ops
- **API:** Handle WordPress batch limits (max 25/batch) and conflict detection via `modified_gmt`
- **UI:** TailwindCSS for styling, functional components with TypeScript interfaces for props
- **Functions:** Max 50 lines, max 3 parameters, explicit return types
- **Imports:** External → `@/` absolute → relative → types → CSS
- **Git commits:** Conventional Commits (`feat(scope): description`)

## **9. MAIA Development Process**

### **Phase 1: Project Setup (Completed)**

1. ✅ **Project Manifest** — Central registry in `project-manifest.yaml`
2. ✅ **Technology Stack** — Next.js + SQLite + Electron
3. ✅ **Requirements** — Defined in `docs/requirements/`
4. ✅ **Coding Standards** — `docs/standards/coding_standards.md`
5. ✅ **Initial Modules** — Specifications in `modules/*/spec.yaml`

### **Phase 2: Module Development (Active)**

All core modules are implemented plus 8 additional post-spec features. Workflow for refinements and new features:

1. **Check the Manifest** — Consult `project-manifest.yaml` to find where a module is implemented
2. **Read the Specification** — Located in `modules/[module-name]/spec.yaml`
3. **Adhere to Standards** — Follow `docs/standards/coding_standards.md`
4. **Implement/Refine** — Make changes in `src/`
5. **Verify** — Run tests and linting (`npm run test`, `npm run lint` from `src/`)

## **10. Git Workflow**

### **Commit Message Format**

Follow Conventional Commits: `type(scope): description`.
- `feat(sync): Add progress tracking to sync engine`
- `fix(db): Correct type mismatch in resource query`

### **Pull Request Review Process**

When reviewing PRs (including those from external agents like `agent-gorilla`), follow this complete process:

1. **Read the diff** — Understand what the PR changes, check for merge conflicts with `main`
2. **Inline comments** — Leave specific comments on lines with issues so the PR author can see exactly what to fix. Use `gh api` to post review comments on specific lines
3. **Label the PR** — Apply appropriate labels to categorize each PR:
   - `bug`, `enhancement`, `refactor`, `accessibility`, `performance`, `security`, `code-health`, `documentation`
   - `stale` — Branch is significantly behind `main` and would require major rebase
   - `blocked` — Cannot merge due to unresolved issues
   - `ready-to-merge` — Approved and ready to go
4. **Take action** based on assessment:
   - **Approve & Merge** — If the PR is a clear improvement, passes review, and aligns with project architecture. Use `gh pr merge --squash`
   - **Request Changes** — If there are fixable issues. Be specific about what needs to change
   - **Close** — If the PR is stale (work already done on `main`), fundamentally misaligned with architecture, or abandoned. Leave a comment explaining why. Use `gh pr close`
5. **Check for prior reviews** — If changes were previously requested, verify whether the feedback was actually addressed before approving
6. **Verify against `main`** — Check if the branch is stale (behind `main` by many commits) and whether the changes conflict with or duplicate work already merged

**Key review criteria:**
- Follows coding standards (`docs/standards/coding_standards.md`)
- Uses the plugin architecture for new features (not standalone routes/components)
- No `any` types, no hardcoded secrets, proper error handling
- Doesn't include unrelated files (lock files, logs, compiled artifacts)
- Changes are focused — one concern per PR

### **Local Build & Install**

When building the Electron app locally for testing, **always bump the version** so you can confirm which build you're running. The version shows in the app header (via `UpdateNotifier.tsx`).

1. Bump patch version in `src/package.json` (e.g. `0.9.8` → `0.9.9`)
2. Build: `npm run electron:build:mac` (from `src/`)
3. Quit the running app: `osascript -e 'quit app "Juggernaut"'`
4. Install: copy `dist-electron/Juggernaut-X.Y.Z-arm64.dmg` → `/Applications/` (or open the DMG)
5. Launch and verify the version in the header matches
6. Rebuild `better-sqlite3` if the dev server also needs to work: `npm rebuild better-sqlite3`

> **Note:** `npm run electron:build:mac` automatically rebuilds native modules (via `rebuild:electron`), but `npm run dev` does not. If the dev server fails with a native module error after building, run `npm rebuild better-sqlite3` to fix it.

### **Releasing**

1. Update version in `src/package.json`
2. Commit: `git commit -m "Release vX.Y.Z"`
3. Create git tag: `git tag vX.Y.Z`
4. Push tag: `git push origin vX.Y.Z`
5. GitHub Actions builds macOS (Intel + Apple Silicon) and publishes the release
6. Monitor: https://github.com/Bannerman/wp-juggernaut/actions

## **11. Troubleshooting**

### Build Fails with Native Module Error
```bash
npm rebuild better-sqlite3
```

### Electron Can't Connect to Dev Server
Ensure Next.js dev server is running first on port 3000.

### GitHub Action Fails with 403
Check that workflow has `permissions: contents: write` (already configured).

### Database Locked
Only one instance of the app can run at a time due to SQLite WAL mode.

## **12. Quality Checklist**

Before completing a task:
- [ ] Code follows `docs/standards/coding_standards.md`
- [ ] TypeScript compiles without errors
- [ ] Module logic aligns with its `spec.yaml` (if one exists)
- [ ] Tests pass (`npm run test` from `src/`)
- [ ] Changes are documented if API surface changes
- [ ] No hardcoded secrets (use `.env.local`)
- [ ] Version bumped in `src/package.json` if building/shipping the Electron app

---

**Note to AI Agents:** You are working on a high-efficiency tool for content managers. Prioritize performance and reliability of the sync/push engines. Always check `project-manifest.yaml` before adding new files to maintain the established structure. For full technical context, see `docs/v1.0-spec.md` and `DEVELOPER.md`.
