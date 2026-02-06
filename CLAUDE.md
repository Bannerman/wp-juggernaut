# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PLEXKITS API Pusher is a local-first Next.js application for syncing, bulk editing, and pushing WordPress Resource posts from plexkits.com via the REST API. It uses a local SQLite database for offline editing with conflict detection when pushing changes back.

## Common Commands

All commands run from the `src/` directory:

```bash
cd src
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Production build
npm run lint         # ESLint (next/core-web-vitals + no-explicit-any)
npm run test         # Jest test suite
npm run test:watch   # Tests in watch mode
npm run test:coverage # Coverage report (80% threshold)
npm run db:init      # Initialize SQLite database
```

## Architecture

**Stack**: Next.js 14 (App Router) + React 18 + TypeScript 5.4 (strict) + TailwindCSS 3.4 + SQLite (better-sqlite3)

The app is structured in layers:

1. **UI Components** (`src/components/`) - Client-side React components using `'use client'` directive. ResourceTable uses @tanstack/react-table. EditModal and CreateModal handle resource editing. FilterPanel provides taxonomy/status filtering.

2. **API Routes** (`src/app/api/`) - Next.js route handlers that bridge UI to business logic. Key routes: `/api/sync` (POST), `/api/push` (POST), `/api/resources` (GET/PATCH), `/api/resources/[id]` (GET/PATCH), `/api/resources/create` (POST), `/api/terms` (GET), `/api/stats` (GET), `/api/test-connection` (GET).

3. **Business Logic** (`src/lib/`) - Core modules:
   - `wp-client.ts` - WordPress REST API client with Basic auth (Application Passwords). Handles paginated fetches and batch updates via `/wp-json/batch/v1`.
   - `sync.ts` - Full sync (all resources) and incremental sync (modified since last sync via `modified_after`). Handles deletion detection.
   - `push.ts` - Pushes dirty resources in batches of 25. Conflict detection compares local `modified_gmt` with server. 300ms delay between batches.
   - `queries.ts` - Local database query abstraction with filtering support. Tracks dirty resources via `is_dirty` flag.
   - `db.ts` - SQLite singleton connection with WAL mode. Schema: `resources`, `resource_meta`, `resource_terms`, `terms`, `sync_meta`, `change_log`.
   - `utils.ts` - `cn()` class merge utility (clsx + tailwind-merge), date formatting, HTML stripping, taxonomy/status constants.

4. **Dashboard** (`src/app/page.tsx`) - Main page orchestrating all components. Manages state with React hooks, handles sync/push/edit/filter operations.

## Key Patterns

- **Database singleton**: `getDb()` in `db.ts` lazily initializes one connection with WAL mode
- **Dirty flag tracking**: Resources marked `is_dirty = 1` on local edit, cleared after successful push
- **Conflict detection**: Compares `modified_gmt` timestamps to detect server-side changes since last sync
- **Batch push**: Groups of 25 via WP batch API, with individual fallback on batch failure
- **9 WordPress taxonomies**: resource-type, topic, intent, audience, leagues, access_level, competition_format, bracket-size, file_format
- **Meta Box fields**: Custom fields via MB REST API plugin (intro_text, text_content, version, download_sections, etc.)

## Environment Setup

Copy `src/.env.example` to `src/.env.local`:
```
WP_BASE_URL=https://plexkits.com
WP_USERNAME=<wp-username>
WP_APP_PASSWORD=<application-password>
DATABASE_PATH=./data/plexkits.db
```

WordPress requires: REST API enabled, Resource CPT with `show_in_rest`, MB REST API plugin active, Application Password created.

## Coding Standards

Defined in `docs/standards/coding_standards.md`. Key points:

- **TypeScript strict mode** — no `any` (ESLint enforced), use `unknown` if type unknown
- **`interface`** for extensible objects, **`type`** for unions/intersections
- **Import order**: external libs → `@/` absolute imports → relative → type imports → CSS
- **Use `@/`** path alias for cross-directory imports (maps to `src/`)
- **Functions**: max 50 lines, max 3 params (use object for more), explicit return types
- **React**: arrow functions for components, `handle*` for handlers, `on*` for props
- **API routes**: one handler per HTTP method, always return `NextResponse`, try-catch with status codes
- **Database**: always use prepared statements, transactions for multi-statement ops
- **Styling**: TailwindCSS utilities, use `cn()` for conditional classes, no static inline styles
- **Git commits**: Conventional Commits format (`feat(scope): description`)
- **`better-sqlite3`** is in `serverComponentsExternalPackages` in next.config.js to avoid bundling issues

## Electron Desktop App

Juggernaut is packaged as a native Mac app using Electron with auto-updates via GitHub Releases.

### Electron Commands

```bash
cd src
npm run electron:dev        # Run Electron in development (requires npm run dev separately)
npm run electron:build:mac  # Build Mac app (.dmg and .zip)
npm run electron:publish    # Build and publish to GitHub Releases
```

### Auto-Updates

The app checks for updates on startup and notifies users when a new version is available. Updates are downloaded from GitHub Releases.

**To release a new version:**
1. Update `version` in `package.json`
2. Create a git tag: `git tag v1.0.0`
3. Push the tag: `git push origin v1.0.0`
4. GitHub Actions will automatically build and publish the release

### Code Signing & Notarization (macOS)

Set these secrets in GitHub repository settings:
- `MAC_CERTIFICATE` - Base64-encoded .p12 certificate
- `MAC_CERTIFICATE_PASSWORD` - Certificate password
- `APPLE_ID` - Apple ID email
- `APPLE_APP_SPECIFIC_PASSWORD` - App-specific password from appleid.apple.com
- `APPLE_TEAM_ID` - Apple Developer Team ID

### Electron Architecture

- `electron/main.ts` - Main process, window management, auto-updater
- `electron/preload.ts` - Secure bridge between main and renderer
- `electron/server.ts` - Production Next.js server runner
- `electron-builder.yml` - Build and packaging configuration
- `components/UpdateNotifier.tsx` - UI for update status

## MAIA Development Framework

This project was bootstrapped using MAIA (Modular AI-driven Application). Planning artifacts live in:
- `prompts/` - Phase 1 (planning) and Phase 2 (development) AI agent prompts
- `modules/` - Module specifications (`spec.yaml` per module)
- `docs/` - Requirements, domain model, API contracts, user stories
- `maia_templates/` - Templates used during project generation
- `project-manifest.yaml` - Module registry and project metadata
- `kickstart.md` - Original project vision and requirements
