# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## CRITICAL: Always Work From a Plan

**NEVER start building without a documented plan.**

Before making significant changes:
1. Check if `/docs/v1.0-plan.md` exists and is up to date
2. If no plan exists, CREATE ONE FIRST before writing any code
3. If the plan is outdated, UPDATE IT before proceeding
4. For new features, add them to the plan and get user approval

The plan document contains:
- Architecture decisions
- Implementation roadmap
- Security requirements (e.g., Keychain for credentials)
- What's completed vs. in progress

**Do not rely on conversation context alone** - plans get lost when conversations compact.

## Project Overview

Juggernaut is a modular, plugin-based WordPress content management platform. It's a local-first desktop application (Electron + Next.js) for syncing, bulk editing, and pushing WordPress posts. It uses a local SQLite database for offline editing with conflict detection when pushing changes back.

**Repository**: https://github.com/Bannerman/wp-juggernaut

## Common Commands

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

## Architecture

**Stack**: Electron 31 + Next.js 14 (App Router) + React 18 + TypeScript 5.4 (strict) + TailwindCSS 3.4 + SQLite (better-sqlite3)

### Layers

1. **UI Components** (`src/components/`)
   - Client-side React with `'use client'` directive
   - ResourceTable (tanstack/react-table), EditModal, CreateModal, FilterPanel
   - UpdateNotifier for Electron auto-updates

2. **API Routes** (`src/app/api/`)
   - `/api/sync` - Sync from WordPress
   - `/api/push` - Push changes to WordPress
   - `/api/resources` - CRUD operations
   - `/api/terms` - Taxonomy terms
   - `/api/profile` - Site configuration
   - `/api/plugins` - Plugin management
   - `/api/field-mappings` - Field mapping CRUD (auto-discovers fields from WP)
   - `/api/discover-fields` - Discover meta/taxonomy fields per post type from WP

3. **Business Logic** (`src/lib/`)
   - `wp-client.ts` - WordPress REST API client
   - `sync.ts` - Full/incremental sync engine
   - `push.ts` - Batch push with conflict detection
   - `queries.ts` - SQLite query abstraction
   - `db.ts` - Database singleton (WAL mode)
   - `plugins/` - Plugin system with hooks
   - `profiles/` - Site-specific configurations

4. **Electron** (`src/electron/`)
   - `main.ts` - Main process, window management, auto-updater
   - `preload.ts` - Secure IPC bridge
   - `server.ts` - Production Next.js server

## Key Patterns

- **Database singleton**: `getDb()` lazily initializes one connection with WAL mode
- **Dirty flag tracking**: `is_dirty = 1` on local edit, cleared after push
- **Conflict detection**: Compares `modified_gmt` timestamps
- **Batch push**: Groups of 25 via WP batch API
- **Plugin system**: Hook-based extensibility
- **Profile system**: JSON configurations per site

## Environment Setup

Copy `src/.env.example` to `src/.env.local`:
```
WP_BASE_URL=https://your-site.com
WP_USERNAME=<wp-username>
WP_APP_PASSWORD=<application-password>
DATABASE_PATH=./data/juggernaut.db
```

## Coding Standards

- **TypeScript strict mode** — use `unknown` not `any`
- **Import order**: external → `@/` absolute → relative → types → CSS
- **Functions**: max 50 lines, max 3 params, explicit return types
- **React**: arrow functions, `handle*` handlers, `on*` props
- **API routes**: one handler per method, always `NextResponse`, try-catch
- **Database**: prepared statements, transactions for multi-ops
- **Git commits**: Conventional Commits (`feat(scope): description`)

## Electron Desktop App

### Development Workflow
```bash
# Terminal 1: Start Next.js
npm run dev

# Terminal 2: Start Electron (after Next.js is ready)
npm run electron:dev
```

### Local Build
```bash
npm run electron:build:mac
# Output: src/dist-electron/
```

### Release Process

**To release a new version:**

1. **Update version** in `src/package.json`:
   ```json
   { "version": "1.1.0" }
   ```

2. **Commit and push**:
   ```bash
   git add src/package.json
   git commit -m "Release v1.1.0"
   git push origin main
   ```

3. **Create and push tag**:
   ```bash
   git tag v1.1.0
   git push origin v1.1.0
   ```

4. **GitHub Actions automatically**:
   - Builds for Intel and Apple Silicon Macs
   - Creates GitHub Release with DMG files
   - Uploads `latest-mac.yml` for auto-updates

**Monitor build**: https://github.com/Bannerman/wp-juggernaut/actions

### Auto-Update System

- App checks for updates on startup (3 second delay)
- Downloads from GitHub Releases
- `latest-mac.yml` contains version info and checksums
- `UpdateNotifier` component shows update status in UI
- Users prompted to download/install new versions

### Electron Files

| File | Purpose |
|------|---------|
| `electron/main.ts` | Main process, window, auto-updater |
| `electron/preload.ts` | Secure renderer ↔ main bridge |
| `electron/server.ts` | Production Next.js server |
| `electron-builder.yml` | Build configuration |
| `components/UpdateNotifier.tsx` | Update status UI |
| `types/electron.d.ts` | TypeScript declarations |

### Code Signing (Optional)

For signed releases without security warnings, add GitHub Secrets:
- `MAC_CERTIFICATE` - Base64 .p12 certificate
- `MAC_CERTIFICATE_PASSWORD` - Certificate password
- `APPLE_ID` - Apple ID email
- `APPLE_APP_SPECIFIC_PASSWORD` - App-specific password
- `APPLE_TEAM_ID` - Developer Team ID

Then update `.github/workflows/release.yml` to enable signing.

## Troubleshooting

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

## MAIA Framework

Project bootstrapped with MAIA. Planning artifacts:
- `prompts/` - AI agent prompts
- `modules/` - Module specifications
- `docs/` - Requirements and standards
- `project-manifest.yaml` - Module registry
