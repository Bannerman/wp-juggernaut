import { NextRequest, NextResponse } from 'next/server';
import { getResourceById, updateLocalResource, getResourceSeo, saveResourceSeo, getSyncedSnapshot } from '@/lib/queries';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id, 10);
    const resource = getResourceById(id);

    if (!resource) {
      return NextResponse.json(
        { error: 'Resource not found' },
        { status: 404 }
      );
    }

    // Include SEO data
    const seo = getResourceSeo(id);

    // Include synced snapshot when dirty (for field-level change detection)
    const synced_snapshot = resource.is_dirty ? getSyncedSnapshot(id) : null;

    return NextResponse.json({ ...resource, seo, synced_snapshot });
  } catch (error) {
    console.error('Error fetching resource:', error);
    return NextResponse.json(
      { error: 'Failed to fetch resource' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id, 10);
    const body = await request.json();

    const resource = getResourceById(id);
    if (!resource) {
      return NextResponse.json(
        { error: 'Resource not found' },
        { status: 404 }
      );
    }

    // Update resource fields
    updateLocalResource(id, {
      title: body.title,
      slug: body.slug,
      status: body.status,
      taxonomies: body.taxonomies,
      meta_box: body.meta_box,
    });

    // Update SEO data if provided
    if (body.seo) {
      saveResourceSeo(id, body.seo, true); // true = mark dirty
    }

    const updated = getResourceById(id);
    const seo = getResourceSeo(id);
    return NextResponse.json({ ...updated, seo });
  } catch (error) {
    console.error('Error updating resource:', error);
    return NextResponse.json(
      { error: 'Failed to update resource' },
      { status: 500 }
    );
  }
}
