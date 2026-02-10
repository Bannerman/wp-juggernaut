# ADR-004: Profile-Driven Site Configuration

## Status
Accepted

## Date
2024-06

## Context

Juggernaut was initially built for a single WordPress site (PlexKits) with hardcoded post types, taxonomies, and plugin assumptions. To make it a generic tool that works with any WordPress site, all site-specific configuration needs to be externalized.

Requirements:
- Support multiple WordPress sites with different post types, taxonomies, and plugins
- Allow switching between site targets (local dev, staging, production) for the same site
- Define which plugins are active and how they're configured per site
- Control UI behavior (which tabs show, which fields appear, field ordering) per site
- No code changes required when connecting to a new WordPress site

## Decision

Implement a **profile system** where each WordPress site (or group of related sites) is configured via a **JSON profile file**.

### Profile Structure

A profile defines everything about a WordPress site:
- **`sites[]`** — Multiple URL targets (local, staging, production) with one default
- **`post_types[]`** — Which content types to manage, with one marked `is_primary`
- **`taxonomies[]`** — Which taxonomies to sync, filter by, and allow editing
- **`required_plugins[]`** — Which Juggernaut plugins to auto-enable
- **`plugin_settings{}`** — Per-plugin configuration (e.g., MetaBox field group IDs)
- **`ui.tabs[]`** — Tab order and sources for the EditModal
- **`ui.field_layout{}`** — Which fields appear on each tab and how they render

### ProfileManager

A singleton `ProfileManager` (`src/lib/profiles/index.ts`) manages the active profile:
- Auto-loads the default profile on first access
- Provides typed accessors (`getTaxonomySlugs()`, `getPrimaryPostType()`, etc.)
- Supports in-memory updates when settings UI modifies tabs/fields
- All core services (wp-client, sync, push, queries) read from the ProfileManager instead of hardcoded values

### Site Config

The `site-config.ts` module manages multi-site target switching:
- Stores the active site URL and credentials
- Allows switching between local/staging/production without changing the profile
- In Electron, credentials are stored in macOS Keychain; in dev mode, in a local JSON file

## Consequences

**Positive:**
- Zero code changes to add a new WordPress site — just create a profile JSON
- Clean separation between "what the site has" (profile) and "how to connect" (site-config)
- UI customization (tabs, field layout) is data-driven, not code-driven
- Plugin activation is per-profile, supporting diverse WordPress setups
- Profile files are human-readable and version-controllable

**Negative:**
- Profile schema is complex (~100+ lines of JSON for a full profile)
- No profile editor UI yet — profiles must be edited as JSON (Tab Layout editor covers partial editing)
- Some core code still reads from `process.env` as a fallback, creating dual config paths
- Profile validation is minimal — malformed profiles may cause runtime errors rather than clear messages
