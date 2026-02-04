import { NextRequest, NextResponse } from 'next/server';
import { getResourceById, updateLocalResource } from '@/lib/queries';

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
    
    return NextResponse.json(resource);
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
    
    updateLocalResource(id, {
      title: body.title,
      slug: body.slug,
      status: body.status,
      taxonomies: body.taxonomies,
      meta_box: body.meta_box,
    });
    
    const updated = getResourceById(id);
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating resource:', error);
    return NextResponse.json(
      { error: 'Failed to update resource' },
      { status: 500 }
    );
  }
}
