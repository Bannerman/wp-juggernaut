import { NextResponse } from 'next/server';
import { getSyncStats } from '@/lib/queries';

export async function GET() {
  try {
    const stats = getSyncStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
