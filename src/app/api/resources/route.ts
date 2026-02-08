import { NextRequest, NextResponse } from 'next/server';
import { getResources } from '@/lib/queries';

export async function GET(request: NextRequest) {
  try {
    const postType = request.nextUrl.searchParams.get('postType') || undefined;
    const resources = getResources({}, postType);
    return NextResponse.json(resources);
  } catch (error) {
    console.error('Error fetching resources:', error);
    return NextResponse.json(
      { error: 'Failed to fetch resources' },
      { status: 500 }
    );
  }
}
