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
import type { FieldMappingEntry, MappableField } from '@/lib/plugins/types';

/** Resolve path to the profile JSON file */
function getProfileFilePath(): string {
  return join(process.cwd(), 'lib', 'profiles', 'plexkits.json');
}

/** Core WP fields that exist on all post types */
const CORE_FIELDS: MappableField[] = [
  { key: 'title', label: 'Title', category: 'core', type: 'text' },
  { key: 'content', label: 'Content', category: 'core', type: 'textarea' },
  { key: 'excerpt', label: 'Excerpt', category: 'core', type: 'textarea' },
  { key: 'slug', label: 'Slug', category: 'core', type: 'text' },
  { key: 'status', label: 'Status', category: 'core', type: 'select' },
  { key: 'featured_media', label: 'Featured Image', category: 'core', type: 'number' },
];

/** Build the list of mappable fields for a post type */
function getFieldsForPostType(postTypeSlug: string): MappableField[] {
  const manager = getProfileManager();
  const fields: MappableField[] = [...CORE_FIELDS];

  // Add meta_box fields from field_layout
  const ui = manager.getUIConfig();
  if (ui?.field_layout) {
    for (const [, tabFields] of Object.entries(ui.field_layout)) {
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

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    ensureProfileLoaded();
    const manager = getProfileManager();
    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source');
    const target = searchParams.get('target');

    const postTypes = manager.getPostTypes();

    if (source && target) {
      const sourceFields = getFieldsForPostType(source);
      const targetFields = getFieldsForPostType(target);
      const mappings = manager.getFieldMappings(source, target);

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
