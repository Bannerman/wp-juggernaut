/**
 * GET /api/tab-layout
 *   No params: returns { postTypes }
 *   ?postType=resource: returns tabs, fieldLayout, and availableFields for the post type
 *
 * PUT /api/tab-layout
 *   Saves tab layout config for a post type to the profile JSON
 */

import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync } from 'fs';
import { ensureProfileLoaded, getProfileManager, getActiveProfileFilePath } from '@/lib/profiles';
import { getWpBaseUrl, getWpCredentials } from '@/lib/wp-client';
import { discoverFieldsForPostType } from '@/lib/discovery';
import type { TabConfig, FieldDefinition, MappableField } from '@/lib/plugins/types';

// Tabs with hardcoded rendering that can't be edited in the Tab Layout editor
// Note: 'seo' is a plugin tab (seopress) but has hardcoded rendering, so it's
// non-editable here. It can be enabled/disabled via the plugin system.
const CORE_TAB_IDS = new Set(['basic', 'classification', 'ai']);
const HARDCODED_TAB_IDS = new Set(['basic', 'seo', 'classification', 'ai']);

function humanizeKey(key: string): string {
  return key
    .replace(/^[-_]+|[-_]+$/g, '')  // trim leading/trailing separators
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    || key;  // fallback to raw key if result is empty
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    ensureProfileLoaded();
    const manager = getProfileManager();
    const postTypes = manager.getPostTypes();
    const { searchParams } = new URL(request.url);
    const postType = searchParams.get('postType');

    if (!postType) {
      return NextResponse.json({ postTypes });
    }

    const ui = manager.getUIConfig();
    const allTabs = ui?.tabs ?? [];
    const allFieldLayout = ui?.field_layout ?? {};

    // Filter tabs: core tabs (always) + dynamic tabs scoped to this post type
    const tabs = allTabs.filter((tab) => {
      if (CORE_TAB_IDS.has(tab.id)) return true;
      if (!tab.post_types) return true;
      return tab.post_types.includes(postType);
    });

    // Filter field_layout to only keys for visible tabs
    const tabIds = new Set(tabs.map((t) => t.id));
    const fieldLayout: Record<string, FieldDefinition[]> = {};
    for (const [tabId, fields] of Object.entries(allFieldLayout)) {
      if (tabIds.has(tabId)) {
        fieldLayout[tabId] = fields;
      }
    }

    // Discover available fields from WordPress
    let availableFields: MappableField[] = [];
    try {
      const ptConfig = postTypes.find((pt) => pt.slug === postType);
      if (ptConfig) {
        const baseUrl = getWpBaseUrl();
        const creds = getWpCredentials();
        const authHeader = 'Basic ' + Buffer.from(`${creds.username}:${creds.appPassword}`).toString('base64');
        const discovered = await discoverFieldsForPostType(baseUrl, authHeader, ptConfig.rest_base, ptConfig.slug);

        // Build set of taxonomy meta_field keys (e.g., tax_intent, tax_topic)
        // These are Meta Box's internal storage for taxonomy assignments,
        // already handled by the Classification tab — exclude them to avoid
        // double-editing the same data through two different state paths.
        const taxonomyMetaKeys = new Set<string>();
        for (const tax of manager.getTaxonomies()) {
          if (tax.meta_field) taxonomyMetaKeys.add(tax.meta_field);
        }

        // Build a label lookup from the profile's field_layout so that fields
        // that were previously configured keep their custom labels when re-added.
        const profileLabels = new Map<string, string>();
        for (const fields of Object.values(allFieldLayout)) {
          for (const field of fields) {
            if (field.label) profileLabels.set(field.key, field.label);
          }
        }

        // Only include meta keys — taxonomy entries are excluded because:
        // 1. tax_xyz keys are already filtered (Meta Box internal storage for taxonomy assignments)
        // 2. Raw taxonomy slugs (e.g., "intent") aren't valid meta_box keys and would
        //    conflict with the Classification tab's taxonomy management
        // Taxonomy-sourced selects (like download_file_format) work via the
        // taxonomy_source property on meta fields, which are already in the meta keys list.
        availableFields = discovered.metaKeys
          .filter((key) => !taxonomyMetaKeys.has(key))
          .map((key) => ({
            key,
            label: profileLabels.get(key) ?? humanizeKey(key),
            category: 'meta' as const,
            type: 'unknown',
          }));
      }
    } catch (err) {
      console.warn('[tab-layout] Field discovery failed, returning empty availableFields:', err);
    }

    return NextResponse.json({ postTypes, tabs, fieldLayout, availableFields });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to get tab layout: ${error}` },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    ensureProfileLoaded();
    const manager = getProfileManager();
    const body = await request.json() as {
      postType: string;
      tabs: TabConfig[];
      fieldLayout: Record<string, FieldDefinition[]>;
      initialTabIds: string[];
    };

    const { postType, tabs, fieldLayout, initialTabIds } = body;

    if (!postType || !tabs || !fieldLayout || !initialTabIds) {
      return NextResponse.json(
        { error: 'postType, tabs, fieldLayout, and initialTabIds are required' },
        { status: 400 }
      );
    }

    // Read current profile JSON
    const filePath = getActiveProfileFilePath();
    const fileContent = JSON.parse(readFileSync(filePath, 'utf-8'));
    if (!fileContent.ui) fileContent.ui = {};
    if (!fileContent.ui.tabs) fileContent.ui.tabs = [];
    if (!fileContent.ui.field_layout) fileContent.ui.field_layout = {};

    const existingTabs: TabConfig[] = fileContent.ui.tabs;
    const submittedDynamicTabs = tabs.filter((tab) => !HARDCODED_TAB_IDS.has(tab.id));
    const submittedIds = new Set(submittedDynamicTabs.map((t) => t.id));
    const initialIds = new Set(initialTabIds.filter((id) => !HARDCODED_TAB_IDS.has(id)));

    // Compute which tabs were deleted (were in initial load but not in final submission)
    const deletedIds = new Set<string>();
    for (const id of initialIds) {
      if (!submittedIds.has(id)) deletedIds.add(id);
    }

    // Merge: keep existing tabs that weren't deleted, update ones that were modified, add new ones
    const mergedTabs: TabConfig[] = [];
    const handledIds = new Set<string>();

    for (const existing of existingTabs) {
      if (deletedIds.has(existing.id)) continue; // User explicitly removed this tab
      const submitted = submittedDynamicTabs.find((t) => t.id === existing.id);
      if (submitted) {
        mergedTabs.push(submitted); // Updated version
        handledIds.add(existing.id);
      } else {
        mergedTabs.push(existing); // Untouched (core or different post type)
      }
    }

    // Add brand-new tabs (not in existing file)
    for (const tab of submittedDynamicTabs) {
      if (!handledIds.has(tab.id)) {
        mergedTabs.push(tab);
      }
    }

    fileContent.ui.tabs = mergedTabs.sort((a, b) => (a.position ?? 99) - (b.position ?? 99));

    // Merge field_layout: only touch tabs the editor knew about
    // Delete field_layout for deleted tabs
    for (const tabId of deletedIds) {
      delete fileContent.ui.field_layout[tabId];
    }
    // Update/add field_layout for submitted tabs
    for (const [tabId, fields] of Object.entries(fieldLayout)) {
      if (!HARDCODED_TAB_IDS.has(tabId)) {
        fileContent.ui.field_layout[tabId] = fields;
      }
    }

    writeFileSync(filePath, JSON.stringify(fileContent, null, 2) + '\n', 'utf-8');

    // Update in-memory profile
    manager.setTabs(fileContent.ui.tabs);
    manager.setFieldLayout(fileContent.ui.field_layout);

    const fieldCount = Object.values(fieldLayout).reduce((sum, fields) => sum + fields.length, 0);

    return NextResponse.json({
      success: true,
      tabCount: submittedDynamicTabs.length,
      fieldCount,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to save tab layout: ${error}` },
      { status: 500 }
    );
  }
}
