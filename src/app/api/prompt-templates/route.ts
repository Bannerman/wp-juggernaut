import { NextResponse } from 'next/server';
import {
  getAllTemplates,
  getTemplate,
  saveTemplate,
  resetTemplate,
  PLACEHOLDER_TAGS,
} from '@/lib/prompt-templates';

// Reads user files / local DB at request time: never prerender at build
// (a build would otherwise bake one machine's data into the output).
export const dynamic = 'force-dynamic';

// GET /api/prompt-templates - List all templates
export async function GET() {
  try {
    const templates = getAllTemplates();
    return NextResponse.json({
      templates,
      placeholders: PLACEHOLDER_TAGS,
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}
