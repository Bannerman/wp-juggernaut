# ADR-005: WordPress REST API with Application Passwords

## Status
Accepted

## Date
2024-01

## Context

Juggernaut needs to read and write WordPress content programmatically. There are several ways to interact with WordPress:

1. **Direct database access** — Maximum control, but requires MySQL access, bypasses WordPress hooks, dangerous
2. **WP-CLI** — Powerful, but requires SSH access to the server
3. **XML-RPC API** — Legacy, limited functionality, security concerns
4. **WordPress REST API** — Modern, well-documented, supports all content operations
5. **GraphQL (WPGraphQL plugin)** — Powerful querying, but requires an additional plugin

For authentication:
1. **Cookie-based** — Browser-only, not suitable for desktop apps
2. **OAuth 2.0** — Complex setup, requires a plugin
3. **JWT tokens** — Requires a plugin, token management
4. **Application Passwords** — Built into WordPress 5.6+, simple, no plugins required

## Decision

Use the **WordPress REST API** with **Application Passwords** for authentication.

### Integration Pattern

- All WordPress API calls go through `src/lib/wp-client.ts`
- Authentication uses HTTP Basic Auth with the Application Password
- Pagination is handled automatically (follows `X-WP-Total` and `X-WP-TotalPages` headers)
- Batch updates use the WordPress `/batch/v1` endpoint (max 25 requests per batch)
- The `_fields` parameter is used to limit response sizes when only IDs are needed

### Sync Strategy

- **Full sync**: Fetch all taxonomy terms (parallel), then all resources (paginated), then detect deletions by comparing server IDs vs local IDs
- **Incremental sync**: Use `modified_after` parameter to fetch only recently changed resources
- **Conflict detection**: Compare `modified_gmt` timestamps before pushing to prevent overwriting changes made directly in WordPress

### Credential Storage

- **Electron (production)**: macOS Keychain via `safeStorage` API — encrypted, never stored on disk
- **Development**: `.env.local` file or `site-config.json` written by the settings UI

## Consequences

**Positive:**
- No WordPress plugins required for basic functionality (REST API and Application Passwords are core)
- Application Passwords are easy to create (WP Admin → Users → Your Profile)
- REST API is well-documented and stable
- Batch endpoint reduces HTTP overhead for bulk operations
- `modified_after` makes incremental sync efficient

**Negative:**
- Application Passwords grant full API access for the user — no granular permission scoping
- REST API requires `show_in_rest: true` on custom post types and taxonomies
- MetaBox fields require the **MB REST API** plugin to be exposed via REST
- Batch endpoint has a hard limit of 25 requests — larger push operations require multiple batches
- Some WordPress hosts may rate-limit REST API requests
