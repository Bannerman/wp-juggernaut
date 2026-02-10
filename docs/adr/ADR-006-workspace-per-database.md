# ADR-006: One Database Per Workspace

## Status
Proposed

## Date
2025-02

## Context

As Juggernaut evolves to support multiple users managing multiple WordPress sites, we need to decide how to organize data storage. Currently, there is a single SQLite database (`data/juggernaut.db`) that stores all synced content.

When a user manages multiple unrelated WordPress sites, mixing their data in a single database creates problems:
- Tables grow unbounded as more sites are added
- Every query would need a `site_id` or `workspace_id` filter, adding complexity and risk of data leakage
- A corrupt database affects all sites
- Cannot easily back up, export, or delete data for a single site

A "workspace" groups related sites that share the same profile, post types, and taxonomy structure. For example, `plexkits.com`, `dev.plexkits.com`, and `local.plexkits.com` would all be one workspace because they share the same WordPress configuration.

## Decision

Use **one SQLite database per workspace**.

### Proposed Structure

```
~/Library/Application Support/Juggernaut/
├── workspaces/
│   ├── {workspace-id}/
│   │   ├── juggernaut.db        # SQLite database for this workspace
│   │   └── profile.json         # Site profile (post types, taxonomies, plugins)
│   └── {workspace-id}/
│       ├── juggernaut.db
│       └── profile.json
├── config.json                   # Global app settings, active workspace
└── credentials/                  # Managed by Keychain, referenced by workspace
```

### Key Design Points

- Each workspace gets its own directory with its own database and profile
- The current schema (posts, post_meta, post_terms, terms, etc.) stays unchanged — no `workspace_id` columns needed
- Switching workspaces means switching which database file `getDb()` opens
- Global app config (window state, preferences) stays separate from workspace data
- Workspaces are independent — deleting a workspace deletes one directory

### Migration Path

1. The existing `data/juggernaut.db` becomes the database for a "default" workspace
2. New workspaces are created through a workspace management UI
3. The `ProfileManager` and `site-config` modules are scoped to the active workspace

## Consequences

**Positive:**
- Clean isolation — no risk of data mixing between unrelated sites
- Simpler queries — no `WHERE workspace_id = ?` on every table
- Portable — move/backup/delete a workspace by copying/removing one directory
- Smaller databases = faster SQLite operations
- No schema changes needed to current tables

**Negative:**
- Need a workspace management layer (create, switch, delete, list)
- Cross-workspace operations (e.g., "how many total posts across all sites?") require opening multiple databases
- More files to manage on disk
- Need to handle the "active workspace" concept in the Electron main process
