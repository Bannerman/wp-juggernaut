/**
 * GET /api/field-mappings?source=resource&target=post
 *   Returns fields for both post types + saved mappings
 *
 * PUT /api/field-mappings
 *   Saves field mappings to the profile config file
 */

import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ensureProfileLoaded, getProfileManager } from '@/lib/profiles';
import { getWpBaseUrl, getWpCredentials } from '@/lib/wp-client';
import { discoverFieldsForPostType } from '@/lib/discovery';
import type { FieldMappingEntry, MappableField } from '@/lib/plugins/types';

/** Resolve path to the profile JSON file */
function getProfileFilePath(): string {
  return join(process.cwd(), 'lib', 'profiles', 'plexkits.json');
}

/**
 * All possible core WP fields. Filtered per post type using the REST schema
 * (WordPress omits fields the CPT doesn't support, e.g., no `content` without `editor`).
 */
const ALL_CORE_FIELDS: MappableField[] = [
  { key: 'title', label: 'Title', category: 'core', type: 'text' },
  { key: 'content', label: 'Content', category: 'core', type: 'textarea' },
  { key: 'excerpt', label: 'Excerpt', category: 'core', type: 'textarea' },
  { key: 'slug', label: 'Slug', category: 'core', type: 'text' },
  { key: 'status', label: 'Status', category: 'core', type: 'select' },
  { key: 'featured_media', label: 'Featured Image', category: 'core', type: 'number' },
  { key: 'author', label: 'Author', category: 'core', type: 'number' },
];

/** Convert a meta_box key like "text_content" to "Text Content" */
function humanizeKey(key: string): string {
  return key
    .replace(/^[-_]+|[-_]+$/g, '')  // trim leading/trailing separators
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    || key;  // fallback to raw key if result is empty
}

/**
 * Build the list of mappable fields for a post type.
 * If schemaProperties is provided (from WP OPTIONS), core fields are filtered
 * to only those the CPT actually supports. Falls back to all core fields.
 */
function getFieldsForPostType(postTypeSlug: string, schemaProperties?: string[]): MappableField[] {
  const manager = getProfileManager();
  const coreFields = schemaProperties?.length
    ? ALL_CORE_FIELDS.filter((f) => schemaProperties.includes(f.key))
    : ALL_CORE_FIELDS;
  const fields: MappableField[] = [...coreFields];

  // Add meta_box fields from field_layout, but only for tabs scoped to this post type
  const ui = manager.getUIConfig();
  if (ui?.field_layout && ui?.tabs) {
    // Build a set of tab IDs that apply to this post type
    const applicableTabIds = new Set(
      ui.tabs
        .filter(tab => tab.dynamic && (!tab.post_types || tab.post_types.includes(postTypeSlug)))
        .map(tab => tab.id)
    );

    for (const [tabId, tabFields] of Object.entries(ui.field_layout)) {
      if (!applicableTabIds.has(tabId)) continue;
      for (const field of tabFields) {
        fields.push({
          key: field.key,
          label: field.label,
          category: 'meta',
          type: field.type,
        });
      }
    }
  }

  // Add taxonomy fields scoped to this post type
  const taxonomies = manager.getTaxonomies();
  for (const tax of taxonomies) {
    if (tax.post_types?.includes(postTypeSlug)) {
      fields.push({
        key: tax.slug,
        label: tax.name,
        category: 'taxonomy',
        type: 'taxonomy',
      });
    }
  }

  return fields;
}

/** Merge discovered fields into the profile-based list, deduplicating by key */
function mergeDiscoveredFields(
  profileFields: MappableField[],
  discoveredMeta: MappableField[],
  discoveredTaxonomies: MappableField[]
): MappableField[] {
  const existingKeys = new Set(profileFields.map((f) => f.key));
  const merged = [...profileFields];

  for (const field of discoveredMeta) {
    if (!existingKeys.has(field.key)) {
      merged.push(field);
      existingKeys.add(field.key);
    }
  }

  for (const field of discoveredTaxonomies) {
    if (!existingKeys.has(field.key)) {
      merged.push(field);
      existingKeys.add(field.key);
    }
  }

  return merged;
}

/** Discover fields from WordPress for a post type, returning MappableField arrays + schema */
async function discoverFields(postTypeSlug: string): Promise<{
  metaFields: MappableField[];
  taxonomyFields: MappableField[];
  schemaProperties?: string[];
}> {
  const manager = getProfileManager();
  const ptConfig = manager.getPostTypes().find((pt) => pt.slug === postTypeSlug);
  if (!ptConfig) return { metaFields: [], taxonomyFields: [] };

  const baseUrl = getWpBaseUrl();
  const creds = getWpCredentials();
  const authHeader = 'Basic ' + Buffer.from(`${creds.username}:${creds.appPassword}`).toString('base64');

  const discovered = await discoverFieldsForPostType(
    baseUrl,
    authHeader,
    ptConfig.rest_base,
    ptConfig.slug
  );

  // Build set of taxonomy meta_field keys (e.g., tax_intent, tax_topic)
  // These are Meta Box's internal storage for taxonomy assignments,
  // already handled by taxonomy fields — exclude them to avoid duplication.
  const taxonomyMetaKeys = new Set<string>();
  for (const tax of manager.getTaxonomies()) {
    if (tax.meta_field) taxonomyMetaKeys.add(tax.meta_field);
  }

  const metaFields: MappableField[] = discovered.metaKeys
    .filter((key) => !taxonomyMetaKeys.has(key))
    .map((key) => ({
      key,
      label: humanizeKey(key),
      category: 'meta' as const,
      type: 'unknown',
    }));

  const taxonomyFields: MappableField[] = discovered.taxonomies.map((tax) => ({
    key: tax.slug,
    label: tax.name,
    category: 'taxonomy' as const,
    type: 'taxonomy',
  }));

  return { metaFields, taxonomyFields, schemaProperties: discovered.schemaProperties };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    ensureProfileLoaded();
    const manager = getProfileManager();
    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source');
    const target = searchParams.get('target');

    const postTypes = manager.getPostTypes();

    if (source && target) {
      const mappings = manager.getFieldMappings(source, target);

      // Discover fields from WordPress (includes REST schema for core field filtering)
      let sourceSchemaProps: string[] | undefined;
      let targetSchemaProps: string[] | undefined;
      let sourceDiscoveredMeta: MappableField[] = [];
      let sourceDiscoveredTax: MappableField[] = [];
      let targetDiscoveredMeta: MappableField[] = [];
      let targetDiscoveredTax: MappableField[] = [];

      try {
        const [sourceDiscovered, targetDiscovered] = await Promise.all([
          discoverFields(source),
          discoverFields(target),
        ]);
        sourceSchemaProps = sourceDiscovered.schemaProperties;
        targetSchemaProps = targetDiscovered.schemaProperties;
        sourceDiscoveredMeta = sourceDiscovered.metaFields;
        sourceDiscoveredTax = sourceDiscovered.taxonomyFields;
        targetDiscoveredMeta = targetDiscovered.metaFields;
        targetDiscoveredTax = targetDiscovered.taxonomyFields;
      } catch (err) {
        console.warn('[field-mappings] Field discovery failed, using profile-only fields:', err);
      }

      // Build field lists — core fields filtered by schema, then merge discovered
      const sourceFields = mergeDiscoveredFields(
        getFieldsForPostType(source, sourceSchemaProps),
        sourceDiscoveredMeta,
        sourceDiscoveredTax
      );
      const targetFields = mergeDiscoveredFields(
        getFieldsForPostType(target, targetSchemaProps),
        targetDiscoveredMeta,
        targetDiscoveredTax
      );

      return NextResponse.json({
        sourceFields,
        targetFields,
        mappings,
        postTypes,
      });
    }

    // Return all mappings and post types
    return NextResponse.json({
      mappings: manager.getAllFieldMappings(),
      postTypes,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to get field mappings: ${error}` },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    ensureProfileLoaded();
    const manager = getProfileManager();
    const body = await request.json() as {
      source: string;
      target: string;
      mappings: FieldMappingEntry[];
    };

    const { source, target, mappings } = body;

    if (!source || !target || !mappings) {
      return NextResponse.json(
        { error: 'source, target, and mappings are required' },
        { status: 400 }
      );
    }

    // Update in-memory profile
    manager.setFieldMappings(source, target, mappings);

    // Persist to profile JSON file
    const filePath = getProfileFilePath();
    const fileContent = JSON.parse(readFileSync(filePath, 'utf-8'));
    if (!fileContent.field_mappings) {
      fileContent.field_mappings = {};
    }
    const key = `${source}->${target}`;
    fileContent.field_mappings[key] = mappings;
    writeFileSync(filePath, JSON.stringify(fileContent, null, 2) + '\n', 'utf-8');

    return NextResponse.json({
      success: true,
      key,
      count: mappings.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to save field mappings: ${error}` },
      { status: 500 }
    );
  }
}
