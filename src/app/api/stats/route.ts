import { NextRequest, NextResponse } from 'next/server';
import { getSyncStats } from '@/lib/queries';

export async function GET(request: NextRequest) {
  try {
    const postType = request.nextUrl.searchParams.get('postType') || undefined;
    const stats = getSyncStats(postType);
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
