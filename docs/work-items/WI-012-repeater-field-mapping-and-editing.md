# WI-012: Repeater-Aware Field Mapping & Sub-Field Editing

## Status: Backlog

## Priority: Medium

## Summary

Enable sub-field level control for repeater/group fields in both the **Field Mapping** system and the **Tab Layout Editor**. Currently, repeaters are treated as opaque JSON blobs — you can map or display them as a whole, but can't interact with individual sub-fields within them.

---

## Problem Statement

### Field Mapping Limitation

When mapping fields between post types, repeater fields (e.g., `group_features`, `download_sections`) are mapped as **atomic units**. The entire JSON array is copied as-is from source to target.

**This breaks when repeater structures don't match:**
- Source repeater has sub-fields `{a, b}`
- Target repeater has sub-fields `{a, b, c}`
- Mapping copies the blob → target items have `a` and `b` but `c` is entirely absent (not even empty)
- Whether this causes errors depends on how Meta Box handles missing keys on the WordPress side

**Use case that doesn't work today:** Converting a `resource` to a `post` where the target has a similar but not identical repeater — e.g., same feature list but with an extra `feature_icon` sub-field. You can't map `feature_text → feature_text` while leaving `feature_icon` to get a default value.

### Tab Layout Editor Limitation

When a user adds a field with type `repeater` in the Tab Layout editor, they can set the top-level label, type, and width — but **cannot configure sub-fields** within the repeater. Sub-field definitions must be manually edited in the profile JSON (`ui.field_layout`).

**Example:** The Downloads tab only shows "Download Sections" as one field in the Tab Layout. The actual structure (section heading, color, archive checkbox, nested download links with link text, file format, link type, URL) is all defined in JSON and invisible to the visual editor.

---

## Current Architecture (Research Notes)

### How Repeaters Are Stored

- **Database**: Single JSON blob per repeater in `post_meta` table
  - Schema: `post_meta(post_id INTEGER, field_id TEXT, value TEXT)`
  - Example: `field_id = "download_sections"`, `value = '[{"download_section_heading": "...", "download_links": [...]}]'`
  - One row per repeater, entire nested structure serialized as JSON string

### How Repeaters Flow Through the System

| Stage | Behavior |
|-------|----------|
| **Sync** (`sync.ts`) | `meta_box` fields from WP REST API stored as `JSON.stringify(value)` per key |
| **Storage** (`post_meta` table) | One row per repeater key, value is JSON string |
| **Read** (`queries.ts:getPostMeta`) | `JSON.parse(value)` back to full nested object |
| **Push** (`push.ts:buildUpdatePayload`) | Entire repeater array included in `meta_box` payload |
| **Field Discovery** (`discovery.ts`) | Repeaters detected as single meta_box keys, sub-fields not enumerated |
| **Field Mapping** (`field-mappings/route.ts`) | `getFieldsForPostType()` returns repeater as one `MappableField` with `type: "repeater"` |
| **UI Rendering** (`RepeaterRenderer.tsx`) | Recursively renders sub-fields from profile `field.fields` definition |

### Key Files

- `src/lib/db.ts` — Schema, `post_meta` table definition
- `src/lib/queries.ts:158-173` — `getPostMeta()` deserializes JSON
- `src/lib/sync.ts:185-191` — Stores meta_box as JSON.stringify per field
- `src/lib/push.ts:200-240` — `buildUpdatePayload()` sends repeaters as blobs
- `src/app/api/field-mappings/route.ts:42-83` — `getFieldsForPostType()` lists fields
- `src/app/api/discover-fields/route.ts` — Discovery sees repeaters as single keys
- `src/components/fields/RepeaterRenderer.tsx` — Renders nested sub-fields from profile definition
- `src/components/TabLayoutEditor.tsx` — Tab/field visual editor (no sub-field UI)
- `src/lib/profiles/plexkits.json:379-455` — Example: `download_sections` repeater definition with nested repeater

### Profile JSON Structure (Example: Downloads)

```json
{
  "downloads": [
    {
      "key": "download_sections",
      "type": "repeater",
      "label": "Download Sections",
      "fields": {
        "download_section_heading": { "key": "download_section_heading", "type": "text", "label": "Section Heading" },
        "download_section_color": { "key": "download_section_color", "type": "color", "label": "Section Color" },
        "download_archive": { "key": "download_archive", "type": "checkbox", "label": "Archive Section" },
        "download_links": {
          "key": "download_links",
          "type": "repeater",
          "label": "Download Links",
          "fields": {
            "link_text": { "type": "text", "label": "Link Text" },
            "download_file_format": { "type": "select", "label": "File Format", "taxonomy_source": "file_format" },
            "download_link_type": { "type": "select", "label": "Link Type", "options": [...] },
            "download_link_url": { "type": "url", "label": "URL", "conditional": {...} }
          }
        }
      }
    }
  ]
}
```

---

## Proposed Solutions

### Option A: Sub-Field Aware Mapping (Recommended)

Explode repeaters into individually mappable sub-fields in the Field Mapping UI.

**How it would work:**
1. When `getFieldsForPostType()` encounters a repeater, also emit its sub-fields as nested `MappableField` entries (e.g., `download_sections[].download_section_heading`)
2. Field Mapping UI shows repeaters as expandable groups — user can map the whole repeater OR individual sub-fields
3. When mapping sub-fields, the conversion logic iterates each item in the source array and constructs target items by mapping individual keys
4. Unmapped target sub-fields get default values (empty string, false, [], etc.)

**Pros:** Most flexible, handles mismatched structures
**Cons:** Complex UI, need to handle nested repeaters (repeater inside repeater), array length mismatches

**Inspiration:** Zapier, Make.com, n8n all do this with `[]` notation for array fields.

### Option B: Repeater-to-Repeater Mapping with Field Alignment

Keep repeaters as atomic units but add a secondary alignment config.

**How it would work:**
1. When two repeaters are mapped, show a "Configure sub-field alignment" option
2. Opens a mini field-mapping UI showing source sub-fields → target sub-fields
3. On conversion, each source item is transformed: rename keys per alignment, add defaults for new target keys, drop unmapped source keys

**Pros:** Simpler than full sub-field explosion, handles the common case
**Cons:** Only works repeater-to-repeater (can't map a flat field into a repeater sub-field)

### Option C: Post-Mapping Transform Hook

Plugin-based approach — let a hook modify data after blob copy.

**How it would work:**
1. After the field mapping blob copy, fire a `post_field_mapping` hook
2. Plugins or profile config can register transforms that patch up the target data
3. Example transform: "For `group_features`, add `feature_icon: ''` to each item"

**Pros:** Extensible, no UI changes needed
**Cons:** Requires code/config knowledge, not visual

---

## Implementation Plan (When Ready)

### Phase 1: Tab Layout Sub-Field Editor
- [ ] When field type is `repeater`, show a nested "Sub-fields" section in the Tab Layout editor
- [ ] Allow adding/removing/reordering sub-fields within the repeater
- [ ] Each sub-field gets: key, label, type, width (same as top-level fields)
- [ ] Support nested repeaters (cap at 2 levels deep)
- [ ] Save sub-field definitions into `ui.field_layout[tabId][fieldIndex].fields`

### Phase 2: Sub-Field Aware Discovery
- [ ] Update `discoverFieldsForPostType()` to detect repeater sub-field keys from sample data
- [ ] Store discovered sub-fields in field audit results
- [ ] Expose sub-fields in the `getFieldsForPostType()` API response

### Phase 3: Sub-Field Mapping UI
- [ ] Add expandable repeater groups in the Field Mapping editor
- [ ] Allow mapping whole repeater (existing behavior) or individual sub-fields
- [ ] Show sub-field preview values when preview is enabled
- [ ] Handle array length mismatches (shorter source → pad target, longer source → truncate or warn)

### Phase 4: Conversion Logic
- [ ] Update post conversion to apply sub-field mappings item-by-item
- [ ] Add default value injection for unmapped target sub-fields
- [ ] Handle type coercion between sub-fields (string → number, etc.)
- [ ] Test with nested repeaters (download_sections → download_links)

---

## Related Files

- `docs/settings-pages.md` — Settings page architecture
- `docs/standards/design_standards.md` — UI design patterns
- `CLAUDE.md` — Tab system documentation (CORE_TAB_IDS, HARDCODED_TAB_IDS, dynamic tabs)
