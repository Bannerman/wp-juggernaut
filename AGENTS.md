# **AI Agent Guidelines for Juggernaut**

This document provides guidelines for AI agents and human developers working on **Juggernaut**, a project built with the MAIA (Modular AI-driven Application) Toolkit.

## **1. Project Overview**

**Juggernaut** is a modular, plugin-based WordPress content management platform. It's a local-first desktop application (Electron + Next.js) designed to sync, bulk edit, and push WordPress posts. It leverages a profile-driven architecture with extensible plugin support and multi-site target switching.

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

**Current Version:** 0.9.6

### **Project Structure**

```
wp-juggernaut/
├── README.md                    # Project overview and setup
├── AGENTS.md                    # This file - AI agent guidelines
├── CLAUDE.md                    # Claude Code specific instructions
├── CONTRIBUTING.md              # Contribution guidelines
├── project-manifest.yaml        # Central project registry & module mapping
├── docs/                        # All project documentation
│   ├── requirements/            # Functional & non-functional requirements
│   ├── standards/               # Coding standards (see coding_standards.md)
│   ├── adr/                     # Architecture Decision Records
│   └── work-items/              # Task tracking and planning
├── modules/                     # Module Specifications (7 specs)
│   └── [module-name]/           # Specification folders
│       └── spec.yaml            # Module specification (Requirements & API)
├── prompts/                     # AI agent prompts (MAIA)
├── maia_templates/              # MAIA toolkit templates
├── src/                         # Implementation (Source Code)
│   ├── app/                     # Next.js App Router (Pages & API Routes)
│   │   ├── api/                 # 14 API route groups
│   │   ├── settings/            # Settings page
│   │   └── diagnostics/         # Diagnostics page
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

## **2. MAIA Development Process**

### **Phase 1: Project Setup (Completed)**

Phase 1 established the foundation:
1. ✅ **Project Manifest** - Central registry in `project-manifest.yaml` mapping logical modules to `src/` paths.
2. ✅ **Technology Stack** - Next.js + SQLite + Electron stack selected.
3. ✅ **Requirements** - Defined in `docs/requirements/`.
4. ✅ **Coding Standards** - Strictly defined in `docs/standards/coding_standards.md`.
5. ✅ **Initial Modules** - Specifications created in `modules/*/spec.yaml`.

### **Phase 2: Module Development (Active)**

Phase 2 is well underway. All core modules are implemented and several additional features have been added beyond the original spec (discovery, field audit, image processing, AI prompt templates, multi-site config). Refinements and new features follow this workflow:

1. **Check the Manifest** - Consult `project-manifest.yaml` to find where a module is implemented.
2. **Read the Specification** - Located in `modules/[module-name]/spec.yaml`.
3. **Adhere to Standards** - Follow `docs/standards/coding_standards.md` (e.g., explicit return types, no `any`).
4. **Implement/Refine** - Make changes in `src/`.
5. **Verify** - Run tests and linting (`npm run test`, `npm run lint` from `src/`).

## **3. Module Registry & Mapping**

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
| **site-config** | `src/lib/site-config.ts` | Multi-site target switching (local/staging/production) |
| **utils** | `src/lib/utils.ts` | Shared utilities (cn, HTML decode, date formatting) |

### **API Routes** (`src/app/api/`)

| Route | Purpose |
| :--- | :--- |
| `/api/sync` | Sync resources from WordPress |
| `/api/push` | Push local changes to WordPress |
| `/api/resources` | CRUD operations on resources |
| `/api/terms` | Taxonomy term management |
| `/api/profile` | Site profile configuration |
| `/api/plugins` | Plugin management |
| `/api/discover` | WordPress site discovery |
| `/api/field-audit` | Field integrity auditing |
| `/api/prompt-templates` | AI prompt template CRUD |
| `/api/seo` | SEO data management |
| `/api/site-config` | Multi-site target switching |
| `/api/stats` | Dashboard statistics |
| `/api/test-connection` | WordPress connection testing |
| `/api/upload` | File/image uploads |

## **4. Plugin System**

Juggernaut uses a modular plugin architecture:

- **Bundled Plugins** (`src/lib/plugins/bundled/`): MetaBox, SEOPress
- **Profile System** (`src/lib/profiles/`): Site-specific configurations (e.g., `plexkits.json`)
- **Hook System** (`src/lib/plugins/hooks.ts`): Event-driven extension points with priority ordering
- **Plugin Registry** (`src/lib/plugins/registry.ts`): Plugin registration and lifecycle
- **Plugin Loader** (`src/lib/plugins/loader.ts`): Dynamic plugin loading
- **Plugin Types** (`src/lib/plugins/types.ts`): Shared type definitions

## **5. Coding Standards Highlights**

All code must adhere to `docs/standards/coding_standards.md`. Key mandates:
- **TypeScript:** Strict mode, explicit return types, `import type` for types, no `any`.
- **Database:** Use `better-sqlite3`, singleton pattern in `src/lib/db.ts`, prepared statements, transactions for multi-ops.
- **API:** Handle WordPress batch limits (max 25/batch) and conflict detection via `modified_gmt`.
- **UI:** TailwindCSS for styling, functional components with TypeScript interfaces for props.
- **Functions:** Max 50 lines, max 3 parameters, explicit return types.
- **Imports:** External → `@/` absolute → relative → types → CSS.

## **6. Git Workflow**

### **Commit Message Format**
Follow Conventional Commits: `type(scope): description`.
- `feat(sync): Add progress tracking to sync engine`
- `fix(db): Correct type mismatch in resource query`

### **Releasing**
1. Update version in `src/package.json`
2. Commit: `git commit -m "Release vX.Y.Z"`
3. Create git tag: `git tag vX.Y.Z`
4. Push tag: `git push origin vX.Y.Z`
5. GitHub Actions builds macOS (Intel + Apple Silicon) and publishes the release

## **7. Quality Checklist**

Before completing a task:
- [ ] Code follows `docs/standards/coding_standards.md`.
- [ ] TypeScript compiles without errors.
- [ ] Module logic aligns with its `spec.yaml` (if one exists).
- [ ] Tests pass (`npm run test` from `src/`).
- [ ] Changes are documented if API surface changes.
- [ ] No hardcoded secrets (use `.env.local`).

---

**Note to AI Agents:** You are working on a high-efficiency tool for content managers. Prioritize performance and reliability of the sync/push engines. Always check `project-manifest.yaml` before adding new files to maintain the established structure. Note that several lib files (discovery, field-audit, imageProcessing, prompt-templates, site-config) were added post-spec and do not have formal module specifications yet.
