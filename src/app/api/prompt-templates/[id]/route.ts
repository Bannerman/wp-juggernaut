import { NextRequest, NextResponse } from 'next/server';
import {
  getTemplate,
  saveTemplate,
  resetTemplate,
  getTemplateVersions,
  getTemplateVersion,
  restoreTemplateVersion,
} from '@/lib/prompt-templates';

// GET /api/prompt-templates/[id] - Get a specific template
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const version = searchParams.get('version');
    const listVersions = searchParams.get('versions') === 'true';

    if (listVersions) {
      const versions = getTemplateVersions(params.id);
      return NextResponse.json({ versions });
    }

    if (version) {
      const content = getTemplateVersion(params.id, version);
      if (!content) {
        return NextResponse.json(
          { error: 'Version not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({ content });
    }

    const template = getTemplate(params.id);
    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ template });
  } catch (error) {
    console.error('Error fetching template:', error);
    return NextResponse.json(
      { error: 'Failed to fetch template' },
      { status: 500 }
    );
  }
}

// PATCH /api/prompt-templates/[id] - Update a template
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { content } = body;

    if (typeof content !== 'string') {
      return NextResponse.json(
        { error: 'Content is required' },
        { status: 400 }
      );
    }

    const template = saveTemplate(params.id, content);
    return NextResponse.json({ template });
  } catch (error) {
    console.error('Error saving template:', error);
    return NextResponse.json(
      { error: 'Failed to save template' },
      { status: 500 }
    );
  }
}

// POST /api/prompt-templates/[id] - Restore a version or reset to default
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { action, version } = body;

    if (action === 'restore' && version) {
      const template = restoreTemplateVersion(params.id, version);
      return NextResponse.json({ template });
    }

    if (action === 'reset') {
      const template = resetTemplate(params.id);
      return NextResponse.json({ template });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error processing template action:', error);
    return NextResponse.json(
      { error: 'Failed to process action' },
      { status: 500 }
    );
  }
}
