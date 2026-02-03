# **AI Agent Guidelines for PLEXKITS API**

This document provides guidelines for AI agents and human developers working on **PLEXKITS API**, a project built with the MAIA (Modular AI-driven Application) Toolkit.

## **1. Project Overview**

**PLEXKITS API** is a local-first Next.js application designed to sync, bulk edit, and push WordPress Resource posts. It leverages a modular architecture to handle complex synchronization logic and batch updates.

**Tech Stack:**
- **Frontend:** Next.js 14 (App Router) + React 18
- **Language:** TypeScript 5.4 (Strict mode)
- **Styling:** TailwindCSS 3.4
- **Database:** SQLite 3 (via `better-sqlite3`)
- **HTTP Client:** Native Fetch API
- **WordPress Integration:** WP REST API (Application Passwords)

### **Project Structure**

```
PLEXKITS-API/
├── README.md                    # Project overview and setup
├── AGENTS.md                    # This file - AI agent guidelines
├── project-manifest.yaml        # Central project registry & module mapping
├── docs/                        # All project documentation
│   ├── requirements/            # Functional & non-functional requirements
│   ├── standards/               # Coding standards (see coding_standards.md)
│   ├── adr/                     # Architecture Decision Records
│   └── work-items/              # Task tracking and planning
├── modules/                     # Module Specifications
│   └── [module-name]/           # Specification folders
│       └── spec.yaml           # Module specification (Requirements & API)
├── src/                         # Implementation (Source Code)
│   ├── app/                     # Next.js App Router (Pages & API Routes)
│   ├── components/              # Shared UI components
│   └── lib/                     # Core logic (Sync, Push, DB, Queries)
└── standards/                   # Additional project templates
```

## **2. MAIA Development Process**

### **Phase 1: Project Setup (Completed)**

Phase 1 established the foundation:
1. ✅ **Project Manifest** - Central registry in `project-manifest.yaml` mapping logical modules to `src/` paths.
2. ✅ **Technology Stack** - Next.js + SQLite stack selected.
3. ✅ **Requirements** - Defined in `docs/requirements/`.
4. ✅ **Coding Standards** - Strictly defined in `docs/standards/coding_standards.md`.
5. ✅ **Initial Modules** - Specifications created in `modules/*/spec.yaml`.

### **Phase 2: Module Development (Active)**

We are currently in Phase 2. While many core modules are implemented, refinements and new features follow this workflow:

1. **Check the Manifest** - Consult `project-manifest.yaml` to find where a module is implemented.
2. **Read the Specification** - Located in `modules/[module-name]/spec.yaml`.
3. **Adhere to Standards** - Follow `docs/standards/coding_standards.md` (e.g., explicit return types, no `any`).
4. **Implement/Refine** - Make changes in `src/`.
5. **Verify** - Run tests and linting.

## **3. Module Registry & Mapping**

The logical modules defined in `modules/` are mapped to implementation files in `src/` as follows:

| Module | Implementation Path | Status |
| :--- | :--- | :--- |
| **database** | `src/lib/db.ts` | Implemented |
| **wp-client** | `src/lib/wp-client.ts` | Implemented |
| **sync-engine** | `src/lib/sync.ts` | Implemented |
| **queries** | `src/lib/queries.ts` | Implemented |
| **push-engine** | `src/lib/push.ts` | Implemented |
| **api-routes** | `src/app/api/*` | Implemented |
| **ui-components** | `src/components/*` | Implemented |

## **4. Coding Standards Highlights**

All code must adhere to `docs/standards/coding_standards.md`. Key mandates:
- **TypeScript:** Strict mode, explicit return types, `import type` for types.
- **Database:** Use `better-sqlite3`, follow singleton pattern in `src/lib/db.ts`.
- **API:** Handle WordPress batch limits (max 25/batch) and conflict detection via `modified_gmt`.
- **UI:** TailwindCSS for styling, functional components with TypeScript interfaces for props.

## **5. Git Workflow**

### **Commit Message Format**
Follow Conventional Commits: `type(scope): description`.
- `feat(sync): Add progress tracking to sync engine`
- `fix(db): Correct type mismatch in resource query`

## **6. Quality Checklist**

Before completing a task:
- [ ] Code follows `docs/standards/coding_standards.md`.
- [ ] TypeScript compiles without errors.
- [ ] Module logic aligns with its `spec.yaml`.
- [ ] Changes are documented if API surface changes.
- [ ] No hardcoded secrets (use `.env.local`).

---

**Note to AI Agents:** You are working on a high-efficiency tool for content managers. Prioritize performance and reliability of the sync/push engines. Always check `project-manifest.yaml` before adding new files to maintain the established structure.