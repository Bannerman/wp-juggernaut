import { NextResponse } from 'next/server';
import { getLatestAudit } from '@/lib/field-audit';

// Reads user files / local DB at request time: never prerender at build
// (a build would otherwise bake one machine's data into the output).
export const dynamic = 'force-dynamic';

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
