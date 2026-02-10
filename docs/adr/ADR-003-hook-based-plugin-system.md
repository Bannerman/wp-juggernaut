# ADR-003: Hook-Based Plugin System

## Status
Accepted

## Date
2024-06

## Context

Juggernaut needs to support multiple WordPress ecosystem plugins (MetaBox, SEOPress, ACF, Yoast, etc.) without hardcoding plugin-specific logic into core services. Each WordPress plugin stores data differently (custom meta fields, custom REST endpoints, different field types), and Juggernaut needs to sync, display, edit, and push that data back correctly.

Requirements:
- Support for multiple WordPress plugins simultaneously
- Plugins must be able to transform data during sync and push
- Plugins should be able to provide UI components (tabs, field renderers)
- New plugin support should not require changes to core sync/push code
- Plugins must be activatable per-site via the profile system

Alternatives considered:
1. **Hardcoded plugin support** — Fast to build, but every new plugin requires core code changes
2. **Middleware pipeline** — Too generic, hard to reason about data flow
3. **Hook/event system with priority ordering** — Well-understood pattern (WordPress itself uses this), clear extension points

## Decision

Implement a **hook-based plugin system** with these components:

### Architecture

- **`JuggernautPlugin` interface** (`src/lib/plugins/types.ts`, ~700 lines): Defines the full contract for plugins including lifecycle methods, data hooks, and UI extensions
- **Hook System** (`src/lib/plugins/hooks.ts`): Event-driven pub/sub with priority ordering. Plugins subscribe to hooks like `beforeSync`, `afterPush`, `transformPayload`
- **Plugin Registry** (`src/lib/plugins/registry.ts`): Manages plugin enable/disable state, stores state per-profile
- **Plugin Loader** (`src/lib/plugins/loader.ts`): Handles plugin initialization, activation with profile settings, and deactivation
- **Bundled Plugins** (`src/lib/plugins/bundled/`): Ship with the app — currently MetaBox and SEOPress

### Plugin Lifecycle

1. Plugin is **registered** in the bundled index
2. Plugin is **initialized** with access to the CoreAPI
3. Plugin is **activated** when a profile requires it (with profile-specific settings)
4. Plugin subscribes to relevant **hooks** during activation
5. Plugin is **deactivated** when switching profiles or disabling

### Data Flow

Plugins participate in the sync/push pipeline via hooks:
- `transformResourceForSync` — Modify/enrich data coming from WordPress before saving locally
- `transformResourceForPush` — Modify the payload being sent back to WordPress
- `getTabs` / `getFieldRenderers` — Provide UI components for the EditModal

## Consequences

**Positive:**
- Adding support for a new WordPress plugin is self-contained (create a new bundled plugin directory)
- Core sync/push code stays clean and generic
- Priority ordering allows plugins to layer transformations
- Type definitions provide a clear contract for plugin authors
- Profile-driven activation means different sites can use different plugins

**Negative:**
- Hook system adds indirection — harder to trace data flow through the codebase
- UI extension points (`getTabs`, `getFieldRenderers`) are defined in types but **not yet fully wired up** to the frontend (see `docs/v1.0-spec.md` Phase C). The EditModal still has hardcoded rendering for some fields.
- Plugin state management adds complexity to the profile system
- No hot-loading — plugins are bundled at build time, not dynamically loaded at runtime
