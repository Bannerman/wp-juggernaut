import { NextResponse } from 'next/server';
import { getResources } from '@/lib/queries';

export async function GET() {
  try {
    const resources = getResources();
    return NextResponse.json(resources);
  } catch (error) {
    console.error('Error fetching resources:', error);
    return NextResponse.json(
      { error: 'Failed to fetch resources' },
      { status: 500 }
    );
  }
}
