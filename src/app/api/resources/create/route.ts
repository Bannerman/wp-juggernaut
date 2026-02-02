import { NextRequest, NextResponse } from 'next/server';
import { createResource } from '@/lib/wp-client';
import { saveResource } from '@/lib/sync';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.title) {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }

    // Create on WordPress
    const resource = await createResource({
      title: body.title,
      status: body.status || 'draft',
      content: body.content || '',
      ...body.taxonomies,
      meta_box: body.meta_box,
    });

    // Save to local database
    saveResource(resource);

    return NextResponse.json(resource, { status: 201 });
  } catch (error) {
    console.error('Error creating resource:', error);
    return NextResponse.json(
      { error: `Failed to create resource: ${error}` },
      { status: 500 }
    );
  }
}
