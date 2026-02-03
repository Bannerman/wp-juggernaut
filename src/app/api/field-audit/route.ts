import { NextResponse } from 'next/server';
import { getLatestAudit } from '@/lib/field-audit';

export async function GET() {
  try {
    const latest = getLatestAudit();
    return NextResponse.json({ latest });
  } catch (error) {
    console.error('Field audit fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch field audit results' },
      { status: 500 }
    );
  }
}
