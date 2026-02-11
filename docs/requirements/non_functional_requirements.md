# Juggernaut Non-Functional Requirements (v1.0)

## 1. Performance

- Sync operations should handle large datasets without UI blocking.
- WordPress reads/writes must respect API limits (batch size max 25).
- Local data access must use indexed SQLite queries for primary list/edit workflows.
- App startup should remain responsive on typical developer hardware.

## 2. Reliability

- Local edits must persist to SQLite immediately and survive restarts.
- Dirty-flag tracking must prevent silent data loss between sync/push cycles.
- Conflict detection must compare local vs remote `modified_gmt` before push.
- Database operations involving multiple writes should use transactions where needed.

## 3. Security

- No hardcoded secrets in source or committed config files.
- In Electron mode, credentials must be stored via secure platform storage flow.
- API routes and client calls should fail safely with explicit error messages.
- Sensitive local files (`site-config.json`, local env files, DB files) must remain ignored by git.

## 4. Modularity and Extensibility

- Core services (db, sync, push, wp-client, queries) must remain decoupled from site-specific assumptions.
- Plugin integrations should use the plugin hook/registry interfaces rather than hardcoded branching.
- Profile-driven configuration should remain the primary mechanism for post types, taxonomies, and site targets.

## 5. Compatibility

- Target runtime stack: Electron 31, Next.js 14, React 18, TypeScript strict mode.
- WordPress integration must use WP REST API + Application Password auth.
- Database schema migrations must preserve existing local data across app upgrades.

## 6. Maintainability and Quality

- TypeScript strict mode should remain enabled.
- Lint and test suites should pass in CI for release candidates.
- Project docs and manifest metadata must stay aligned with current implementation/version.
- Changes to API/database behavior should include matching test updates to avoid suite drift.
