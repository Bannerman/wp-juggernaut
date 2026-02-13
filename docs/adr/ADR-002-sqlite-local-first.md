# ADR-002: SQLite for Local-First Architecture

## Status
Accepted

## Date
2024-01

## Context

Juggernaut needs a local data store that:
- Supports offline editing of WordPress content
- Handles relational data (posts, meta fields, taxonomy terms, term assignments)
- Is fast for bulk read/write operations (hundreds of posts with meta)
- Requires zero server infrastructure
- Works within an Electron + Next.js desktop app

Alternatives considered:
1. **IndexedDB** — Browser-native, but poor relational query support, no SQL, harder to debug
2. **LevelDB/PouchDB** — Document-oriented, not ideal for relational data
3. **PostgreSQL/MySQL** — Requires a running server process, heavy for a desktop app
4. **JSON files** — Simple but no query capability, poor performance at scale

## Decision

Use **SQLite 3** via the `better-sqlite3` npm package with **WAL (Write-Ahead Logging) mode**.

- SQLite is a single-file, zero-config, ACID-compliant relational database
- `better-sqlite3` is synchronous (no callback/promise overhead), which is ideal for the server-side API routes
- WAL mode allows concurrent reads while writing, preventing lock contention
- The database is a single file (`data/juggernaut.db`) that can be easily backed up, moved, or deleted

### Schema Design

The schema uses normalized tables:
- `posts` — Core post data with `post_type` and `is_dirty` flag
- `post_meta` — Key-value meta fields per post (stored as JSON values)
- `post_terms` — Many-to-many post ↔ taxonomy term relationships
- `terms` — All taxonomy terms across all taxonomies
- `plugin_data` — Generic key-value storage for plugin-specific data
- `change_log` — Audit trail of local edits
- `sync_meta` — Key-value store for sync state (e.g., `last_sync_time`)

### Access Pattern

All database access goes through a **singleton** (`getDb()` in `src/lib/db.ts`). The singleton:
1. Creates the data directory if needed
2. Handles legacy `plexkits.db` → `juggernaut.db` migration
3. Applies schema migrations based on a version number in `sync_meta`
4. Enables WAL mode

All queries use **prepared statements** to prevent SQL injection. Multi-table writes are wrapped in **transactions** for atomicity.

## Consequences

**Positive:**
- Zero infrastructure — no database server to install or manage
- Single file makes backup/restore trivial
- Excellent performance for the expected data sizes (hundreds to low thousands of posts)
- SQL provides powerful querying, filtering, and joining
- Schema versioning with migrations allows safe upgrades

**Negative:**
- Only one process can write at a time (mitigated by WAL mode)
- `better-sqlite3` is a native Node.js module, requiring compilation for the target platform/ABI
- No built-in replication or multi-device sync (not needed for current scope)
- Schema changes require migration code
