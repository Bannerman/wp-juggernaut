# Functional Requirements

## Scope
This is a lightweight v1.0 functional summary based on `docs/v1.0-spec.md`, module specs in `modules/*/spec.yaml`, and the module registry in `AGENTS.md`.

## Core Platform
- FR-001: The app shall run as a local-first desktop application with Electron + Next.js.
- FR-002: The app shall sync WordPress content into a local SQLite database for offline editing.
- FR-003: The app shall allow bulk/local edits and push changes back to WordPress.

## Database and Data Access
- FR-004: The database module shall initialize and manage SQLite schema and connection lifecycle.
- FR-005: The query module shall provide resource, term, dirty-state, and sync-stat retrieval/update operations.
- FR-006: Resource and taxonomy metadata shall be persisted locally for sync and push workflows.

## WordPress Integration
- FR-007: The WordPress client shall authenticate using Application Passwords and call WP REST API endpoints.
- FR-008: The sync engine shall support both full and incremental sync.
- FR-009: The push engine shall detect conflicts using `modified_gmt` before updates.
- FR-010: Push operations shall support batch updates with a max batch size of 25.

## API Surface
- FR-011: API routes shall expose sync, push, resources, terms, profile, plugin, discovery, audit, stats, and upload operations.
- FR-012: The API shall provide connection testing and return actionable error messages.

## UI and Editing
- FR-013: The UI shall provide resource table, filtering, edit/create flows, and dashboard statistics.
- FR-014: The app shall support taxonomy-aware filtering and dirty-state visibility.
- FR-015: The settings experience shall support target/site configuration and diagnostics.

## Plugin and Profile System
- FR-016: The platform shall support hook-based plugins with registry, lifecycle, and bundled plugin loading.
- FR-017: The platform shall support site profiles that define post types, taxonomies, plugin settings, and UI behavior.
- FR-018: Required plugins in a profile shall be supportable as auto-enabled integrations.
- FR-019: Multi-site target switching (local/staging/production) shall be supported.

## Extended Modules
- FR-020: The app shall support discovery of WordPress post types/taxonomies/plugins.
- FR-021: The app shall support field-audit checks between local DB and WordPress.
- FR-022: The app shall support image upload/processing workflows.
- FR-023: The app shall support AI prompt template CRUD and reuse.
