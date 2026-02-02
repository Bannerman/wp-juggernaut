import { NextResponse } from 'next/server';
import { getAllTermsGrouped } from '@/lib/queries';

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
