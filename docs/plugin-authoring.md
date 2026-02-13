# Plugin Authoring Guide

> **How to build a Juggernaut plugin from scratch.** This guide walks through creating a plugin that integrates a WordPress plugin (custom fields, SEO, e-commerce, etc.) into Juggernaut's sync/push/UI pipeline.

For general developer onboarding, see [`DEVELOPER.md`](../DEVELOPER.md).
For the plugin type definitions, see [`src/lib/plugins/types.ts`](../src/lib/plugins/types.ts).

---

## Quick Start

1. Copy the example skeleton:
   ```bash
   cp -r src/lib/plugins/bundled/_example src/lib/plugins/bundled/my-plugin
   ```
2. Edit `manifest.json` with your plugin's metadata
3. Implement your plugin class in `index.ts`
4. Register it in `src/lib/plugins/bundled/index.ts`
5. Add it to a profile's `required_plugins` to activate it
6. **Zero changes to core code required** — the plugin system handles discovery, lifecycle, and UI wiring

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    YOUR PLUGIN                           │
│  manifest.json │ index.ts │ (optional UI components)     │
├─────────────────────────────────────────────────────────┤
│                  PLUGIN SYSTEM                           │
│  Loader → Registry → Hook System → UI Registration       │
├─────────────────────────────────────────────────────────┤
│                  CORE APP                                │
│  Sync Engine │ Push Engine │ EditModal │ FieldRenderer    │
└─────────────────────────────────────────────────────────┘
```

### How Plugins Integrate

| Extension Point | What It Does | How to Use |
|---|---|---|
| **Hooks** | Transform data during sync/push | Subscribe to `HOOKS.*` in `initialize()` |
| **Field Renderers** | Add custom field types to DynamicTab | Call `registerFieldRenderer()` in `initialize()` |
| **Tab Components** | Add full custom tabs to EditModal | Call `registerPluginTab()` in `initialize()` |
| **WordPress Detection** | Auto-detect WP plugin during discovery | Implement `detectWordPressPlugin()` |
| **Settings Panel** | Add plugin config to Settings page | Implement `getSettingsPanel()` |

---

## File Structure

Every plugin lives in its own directory under `src/lib/plugins/bundled/`:

```
src/lib/plugins/bundled/my-plugin/
├── manifest.json          # Plugin metadata (required)
├── index.ts               # Plugin class + singleton export (required)
├── MyCustomTab.tsx         # Custom tab component (optional)
├── MyFieldRenderer.tsx     # Custom field renderer (optional)
└── __tests__/
    └── index.test.ts       # Plugin tests (recommended)
```

---

## Step-by-Step Walkthrough

### Step 1: Create `manifest.json`

The manifest declares your plugin's identity, what WordPress plugin it supports, and what capabilities it provides.

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "Support for My WP Plugin custom fields.",
  "tier": "bundled",
  "wordpress_plugin": {
    "name": "My WP Plugin",
    "slug": "my-wp-plugin",
    "url": "https://wordpress.org/plugins/my-wp-plugin/",
    "detection": {
      "rest_endpoint": "/wp-json/my-plugin/v1/"
    }
  },
  "provides": {
    "tabs": ["my-tab"],
    "field_types": ["star-rating"],
    "api_extensions": []
  },
  "settings_schema": {
    "auto_sync": {
      "type": "boolean",
      "label": "Auto-sync on load",
      "description": "Fetch plugin data automatically during sync",
      "default": true
    }
  }
}
```

**Key fields:**
- **`id`** — Unique lowercase identifier. Used everywhere: registry, profile references, hook context.
- **`tier`** — `"bundled"` for plugins shipped with the app. Community/premium tiers are future.
- **`wordpress_plugin.detection.rest_endpoint`** — Used by `detectWordPressPlugin()` to auto-detect if the WP plugin is active.
- **`provides.tabs`** — Tab IDs your plugin adds to the editor. Must match what you register in `initialize()`.
- **`provides.field_types`** — Custom field types your plugin can render.
- **`settings_schema`** — Defines settings that appear in the plugin's config panel.

### Step 2: Implement the Plugin Class

Create `index.ts` with a class implementing `JuggernautPlugin`:

```typescript
import type {
  JuggernautPlugin,
  PluginManifest,
  CoreAPI,
  SiteProfile,
  WPResource,
  LocalResource,
  PushPayload,
  HookSystem,
} from '../../types';
import manifest from './manifest.json';
import { HOOKS } from '../../hooks';

class MyPlugin implements JuggernautPlugin {
  id = manifest.id;
  name = manifest.name;
  version = manifest.version;
  manifest = manifest as PluginManifest;

  private coreAPI: CoreAPI | null = null;
  private hooks: HookSystem | null = null;
  private unsubscribers: Array<() => void> = [];
  private settings: Record<string, unknown> = {};

  async initialize(core: CoreAPI): Promise<void> {
    this.coreAPI = core;
    this.hooks = core.hooks;
    this.registerHooks();
  }

  async activate(profile: SiteProfile, settings: Record<string, unknown>): Promise<void> {
    this.settings = settings;
  }

  async deactivate(): Promise<void> {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
  }

  private registerHooks(): void { /* see Step 3 */ }

  async detectWordPressPlugin(baseUrl: string, authHeader: string): Promise<boolean> {
    try {
      const res = await fetch(`${baseUrl}/wp-json/my-plugin/v1/`, {
        headers: { Authorization: authHeader },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

export const myPlugin = new MyPlugin();
export default myPlugin;
```

### Step 3: Subscribe to Hooks

Hooks let you transform data at key points in the sync/push lifecycle. All available hooks are defined in `src/lib/plugins/hooks.ts` as the `HOOKS` constant.

```typescript
private registerHooks(): void {
  if (!this.hooks) return;

  // Transform data during sync (WordPress → Local)
  const unsubSync = this.hooks.on<WPResource>(
    HOOKS.RESOURCE_BEFORE_SYNC,
    (resource, _ctx) => {
      // Example: normalize a custom field
      if (resource.meta_box?.my_field) {
        resource.meta_box.my_field = String(resource.meta_box.my_field).trim();
      }
      return resource;
    },
    10 // Priority: lower runs first
  );
  this.unsubscribers.push(unsubSync);

  // Transform data during push (Local → WordPress)
  const unsubPush = this.hooks.on<{ resource: LocalResource; payload: PushPayload }>(
    HOOKS.RESOURCE_BEFORE_PUSH,
    (data, _ctx) => {
      // Add custom fields to the push payload
      if (data.resource.meta_box?.my_field) {
        data.payload.meta_box = {
          ...data.payload.meta_box,
          my_field: data.resource.meta_box.my_field,
        };
      }
      return data;
    },
    10
  );
  this.unsubscribers.push(unsubPush);
}
```

#### Available Hooks

| Hook | Data Type | When It Fires | Typical Use |
|---|---|---|---|
| `RESOURCE_BEFORE_SYNC` | `WPResource` | Before saving synced resource to DB | Normalize/extract fields |
| `RESOURCE_AFTER_SYNC` | `LocalResource` | After resource saved locally | Update plugin_data |
| `RESOURCE_BEFORE_PUSH` | `{ resource, payload }` | Before sending to WordPress | Add fields to payload |
| `RESOURCE_AFTER_PUSH` | `{ resource, response }` | After successful push | Side effects (logs, etc.) |
| `RESOURCE_BEFORE_SAVE` | `LocalResource` | Before any local DB save | Validate/transform |
| `RESOURCE_AFTER_SAVE` | `LocalResource` | After local DB save | Side effects |
| `SYNC_START` | `{ incremental, profile }` | Sync begins | Setup |
| `SYNC_COMPLETE` | `{ resourceCount, termCount, duration }` | Sync finishes | Reporting |
| `SYNC_ERROR` | `{ error, partial }` | Sync fails | Error handling |
| `PUSH_START` | `{ resourceIds, profile }` | Push begins | Setup |
| `PUSH_COMPLETE` | `{ successCount, failCount, duration }` | Push finishes | Reporting |
| `PUSH_ERROR` | `{ error, failedIds }` | Push fails | Error handling |
| `PROFILE_LOADED` | `SiteProfile` | Profile loaded | Modify profile |
| `SITE_CHANGED` | `{ siteId, site }` | Active site changes | React to site switch |
| `UI_REGISTER_TABS` | `TabDefinition[]` | Editor tab registration | Add tabs |
| `UI_REGISTER_FILTERS` | `FilterComponent[]` | Filter panel registration | Add filters |

#### Hook Rules

- **Always return data** from your callback, even for side-effect-only hooks. Returning `undefined` preserves the previous value.
- **Use the priority parameter** to control ordering. Lower numbers run first. Default is `10`. Use `5` if your plugin must run before others (e.g., MetaBox normalizing `meta_box` data).
- **Always store unsubscribe functions** and call them in `deactivate()`.
- **Hooks are async** — you can `await` API calls inside hook callbacks.

### Step 4: Add Custom Field Types (Optional)

If your WordPress plugin uses field types not covered by the built-in renderers (`text`, `textarea`, `number`, `checkbox`, `date`, `datetime`, `color`, `select`, `url`, `repeater`, `textarea-list`), you can register custom renderers.

**Create a field renderer component** (`MyFieldRenderer.tsx`):

```tsx
'use client';

import type { FieldRendererProps } from '@/components/fields/types';

export function StarRatingRenderer({ field, value, onChange }: FieldRendererProps) {
  const rating = typeof value === 'number' ? value : 0;

  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className={star <= rating ? 'text-yellow-400' : 'text-gray-300'}
        >
          ★
        </button>
      ))}
    </div>
  );
}
```

**Register it in your plugin's `initialize()`:**

```typescript
import { registerFieldRenderer, unregisterFieldRenderer } from '@/components/fields';
import { StarRatingRenderer } from './StarRatingRenderer';

async initialize(core: CoreAPI): Promise<void> {
  // ... other setup ...
  registerFieldRenderer('star-rating', StarRatingRenderer);
}

async deactivate(): Promise<void> {
  // ... other cleanup ...
  unregisterFieldRenderer('star-rating');
}
```

**Use it in a profile's `field_layout`:**

```json
{
  "ui": {
    "field_layout": {
      "my-tab": [
        { "key": "overall_rating", "type": "star-rating", "label": "Overall Rating" }
      ]
    }
  }
}
```

The `DynamicTab` component renders fields using `FieldRenderer`, which checks plugin-registered renderers automatically.

### Step 5: Add Custom Tab Components (Optional)

For tabs that need more than a list of fields (e.g., the SEO tab with its multi-section layout), register a full React component.

> **Real-world example:** See `src/lib/plugins/bundled/seopress/SEOTab.tsx` — the SEOPress plugin registers a full SEO editing interface (title, description, social media, robots) as a plugin tab. It receives SEO state from EditModal through the `context` prop on `PluginTabProps`.

**Create a tab component** (`MyTab.tsx`):

```tsx
'use client';

import type { PluginTabProps } from '@/components/fields';

export function MyTab({ resource, terms, updateMetaField, isCreateMode, siteUrl, context }: PluginTabProps) {
  const myValue = resource.meta_box?.my_field as string || '';
  // Use `context` for plugin-specific data passed by EditModal (see SEOTab.tsx for an example)

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">My Plugin Data</h3>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          My Custom Field
        </label>
        <input
          type="text"
          value={myValue}
          onChange={(e) => updateMetaField('my_field', e.target.value)}
          className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
        />
      </div>

      {isCreateMode && (
        <p className="text-sm text-blue-600">Creating new resource — some fields may be unavailable.</p>
      )}
    </div>
  );
}
```

**Register it in your plugin's `initialize()`:**

```typescript
import { registerPluginTab, unregisterPluginTab } from '@/components/fields';
import { MyTab } from './MyTab';

async initialize(core: CoreAPI): Promise<void> {
  // ... other setup ...
  registerPluginTab('my-tab', MyTab);
}

async deactivate(): Promise<void> {
  // ... other cleanup ...
  unregisterPluginTab('my-tab');
}
```

**Add the tab to a profile's `ui.tabs`:**

```json
{
  "ui": {
    "tabs": [
      { "id": "basic", "label": "Basic", "source": "core", "position": 0 },
      { "id": "my-tab", "label": "My Plugin", "source": "my-plugin", "position": 3 },
      { "id": "classification", "label": "Classification", "source": "core", "position": 5 },
      { "id": "ai", "label": "AI Fill", "source": "core", "position": 10 }
    ]
  }
}
```

#### Tab Rendering Priority

EditModal renders tabs in this order of precedence:

1. **Hardcoded core tabs** (`basic`, `classification`, `ai`) — built-in JSX in EditModal
2. **Dynamic tabs** — tabs with a matching `field_layout` entry, rendered via `DynamicTab` + `FieldRenderer`
3. **Plugin-registered tabs** — custom React components registered via `registerPluginTab()` (e.g., `seo` tab from SEOPress)

If a tab has both a `field_layout` entry AND a registered plugin component, the `field_layout` wins (dynamic tab rendering). Use one or the other, not both.

> **`context` prop:** When rendering plugin tabs, EditModal passes a `context?: Record<string, unknown>` prop on `PluginTabProps`. Plugins that need state from EditModal (like SEO data, loading states, or update handlers) receive it through `context`. The plugin casts it to the expected shape. See `SEOTab.tsx` and its `SEOTabContext` interface for the pattern.

### Step 6: Register in the Bundled Index

Add your plugin to `src/lib/plugins/bundled/index.ts`:

```typescript
import myPlugin from './my-plugin';

export const bundledPlugins: JuggernautPlugin[] = [
  metaBoxPlugin,
  seopressPlugin,
  myPlugin,       // ← Add here
];

export { myPlugin };
```

### Step 7: Add to a Profile

In your site's profile JSON (e.g., `src/lib/profiles/my-site.json`), add the plugin to `required_plugins` so it auto-activates:

```json
{
  "required_plugins": [
    { "id": "metabox", "auto_enable": true },
    { "id": "my-plugin", "auto_enable": true }
  ],
  "plugin_settings": {
    "my-plugin": {
      "auto_sync": true
    }
  }
}
```

The `plugin_settings.my-plugin` object is passed to your plugin's `activate(profile, settings)` method.

---

## The CoreAPI

When your plugin's `initialize(core)` is called, you receive a `CoreAPI` object with these capabilities:

| Method | Status | Description |
|---|---|---|
| `core.hooks` | ✅ Working | Hook system for subscribing to events |
| `core.getProfile()` | ✅ Working | Get the current site profile |
| `core.getBaseUrl()` | ✅ Working | WordPress site base URL |
| `core.getAuthHeader()` | ✅ Working | Base64 auth header for WP REST API |
| `core.log(msg, level)` | ✅ Working | Structured logging |
| `core.showNotification(msg, type)` | ⚠️ Console only | Logs to console (UI notifications not yet wired) |
| `core.database.query()` | ⚠️ Stub | Not yet connected to SQLite — use `queries.ts` imports directly |
| `core.database.run()` | ⚠️ Stub | Not yet connected to SQLite — use `queries.ts` imports directly |

For database operations, import from `src/lib/queries.ts` directly until the CoreAPI database methods are wired:

```typescript
import { getPluginData, savePluginData } from '@/lib/queries';
```

---

## Testing Your Plugin

Create `__tests__/index.test.ts`:

```typescript
import { createHookSystem } from '../../../hooks';
import type { CoreAPI, SiteProfile, WPResource } from '../../../types';
import myPlugin from '../index';

function createMockCoreAPI(): CoreAPI {
  return {
    version: '1.0.0',
    hooks: createHookSystem(),
    getProfile: () => null,
    getBaseUrl: () => 'https://test.example.com',
    getAuthHeader: () => 'Basic dGVzdDp0ZXN0',
    database: {
      query: jest.fn(() => []),
      run: jest.fn(),
    },
    showNotification: jest.fn(),
    log: jest.fn(),
  };
}

describe('MyPlugin', () => {
  let core: CoreAPI;

  beforeEach(async () => {
    core = createMockCoreAPI();
    await myPlugin.initialize(core);
  });

  afterEach(async () => {
    await myPlugin.deactivate();
  });

  it('initializes without errors', () => {
    expect(core.log).toHaveBeenCalledWith(
      expect.stringContaining('initialized'),
      'info'
    );
  });

  it('transforms resource during sync', async () => {
    const resource: WPResource = {
      id: 1,
      date: '', date_gmt: '', modified: '', modified_gmt: '',
      slug: 'test', status: 'publish',
      title: { rendered: 'Test' },
      content: { rendered: '' },
      excerpt: { rendered: '' },
      featured_media: 0,
      meta_box: { my_field: '  trimmed  ' },
    };

    // Trigger the hook directly
    const result = await core.hooks.trigger('resource:beforeSync', resource);
    // Assert your transformation happened
    expect(result).toBeDefined();
  });
});
```

Run tests:
```bash
cd src && npm run test -- --testPathPattern=my-plugin
```

---

## Checklist

Before shipping your plugin, verify:

- [ ] `manifest.json` has a unique `id`, correct `tier`, and accurate `provides`
- [ ] Plugin class implements all three lifecycle methods (`initialize`, `activate`, `deactivate`)
- [ ] All hook subscriptions are stored in `unsubscribers[]` and cleaned up in `deactivate()`
- [ ] All UI registrations (`registerFieldRenderer`, `registerPluginTab`) are undone in `deactivate()`
- [ ] Plugin is added to `bundled/index.ts` exports
- [ ] Plugin is added to at least one profile's `required_plugins`
- [ ] If you added custom tabs: profile has matching entries in `ui.tabs[]`
- [ ] If you added custom field types: profile has matching entries in `ui.field_layout`
- [ ] `detectWordPressPlugin()` correctly checks for the WP plugin's REST endpoint
- [ ] Tests pass: `npm run test -- --testPathPattern=my-plugin`
- [ ] No changes to core files were needed (if you had to change core, consider whether the plugin system needs a new extension point instead)

---

## Real-World Examples

Study the bundled plugins for production patterns:

| Plugin | Path | Complexity | Demonstrates |
|---|---|---|---|
| **_example** | `src/lib/plugins/bundled/_example/` | Minimal | All extension points (commented) |
| **MetaBox** | `src/lib/plugins/bundled/metabox/` | Medium | Sync/push hooks, field normalization, taxonomy mapping |
| **SEOPress** | `src/lib/plugins/bundled/seopress/` | High | REST API integration, local storage, multi-endpoint push, **plugin tab registration** (`SEOTab.tsx`) |

---

## FAQ

**Q: Can I add a new API route from a plugin?**
A: The `CoreAPI.registerApiRoute()` method exists in the type definition but is not yet implemented. For now, create a standard Next.js route in `src/app/api/` and import your plugin's logic there.

**Q: How do I store plugin-specific data per resource?**
A: Use `savePluginData(postId, pluginId, dataKey, data)` and `getPluginData(postId, pluginId, dataKey)` from `src/lib/queries.ts`. See SEOPress for a working example.

**Q: My plugin needs a database table — how?**
A: Add a migration in `src/lib/db.ts` (check the existing `ensureSchema()` function). This does require a core change — consider filing an issue if plugin-managed migrations would be useful.

**Q: How do I access the current profile's plugin_settings for my plugin?**
A: They're passed to `activate(profile, settings)`. Store them on your class instance: `this.settings = settings;`

**Q: Can I override a built-in field renderer?**
A: Yes. `registerFieldRenderer('text', MyCustomTextRenderer)` will override the built-in text renderer. Plugin renderers take precedence over builtins.

**Q: What happens if my hook callback throws an error?**
A: The error is caught and logged. Other hooks continue running. Your plugin won't crash the app, but the data for that resource won't be transformed by your callback.
