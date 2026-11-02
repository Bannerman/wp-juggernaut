import { NextResponse } from 'next/server';
import { getAllTermsGrouped } from '@/lib/queries';

// Reads user files / local DB at request time: never prerender at build
// (a build would otherwise bake one machine's data into the output).
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const terms = getAllTermsGrouped();
    return NextResponse.json(terms);
  } catch (error) {
    console.error('Error fetching terms:', error);
    return NextResponse.json(
      { error: 'Failed to fetch terms' },
      { status: 500 }
    );
  }
}
