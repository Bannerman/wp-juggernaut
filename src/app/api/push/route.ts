import { NextRequest, NextResponse } from 'next/server';
import { pushAllDirty } from '@/lib/push';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const skipConflictCheck = body.skipConflictCheck === true;
    const postType = body.postType as string | undefined;

    const result = await pushAllDirty(skipConflictCheck, postType);
    
    const failedCount = result.results.filter(r => !r.success).length;
    
    if (failedCount > 0 || result.conflicts.length > 0) {
      return NextResponse.json(
        result,
        { status: 207 } // Multi-Status - partial success
      );
    }
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Push error:', error);
    return NextResponse.json(
      { error: `Push failed: ${error}` },
      { status: 500 }
    );
  }
}
