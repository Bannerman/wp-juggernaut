# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the Juggernaut project. ADRs document significant architectural choices, their context, and rationale.

## Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [ADR-001](ADR-001-electron-nextjs-desktop-app.md) | Electron + Next.js for Desktop App | Accepted | 2024-01 |
| [ADR-002](ADR-002-sqlite-local-first.md) | SQLite for Local-First Architecture | Accepted | 2024-01 |
| [ADR-003](ADR-003-hook-based-plugin-system.md) | Hook-Based Plugin System | Accepted | 2024-06 |
| [ADR-004](ADR-004-profile-driven-architecture.md) | Profile-Driven Site Configuration | Accepted | 2024-06 |
| [ADR-005](ADR-005-wp-rest-api-integration.md) | WordPress REST API with Application Passwords | Accepted | 2024-01 |
| [ADR-006](ADR-006-workspace-per-database.md) | One Database Per Workspace | Proposed | 2025-02 |

## ADR Template

When creating a new ADR, use this format:

```markdown
# ADR-NNN: Title

## Status
Proposed | Accepted | Deprecated | Superseded by ADR-NNN

## Date
YYYY-MM-DD

## Context
What is the issue or question we're addressing?

## Decision
What did we decide?

## Consequences
What are the trade-offs and implications?
```
