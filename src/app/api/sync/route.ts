import { NextRequest, NextResponse } from 'next/server';
import { fullSync, incrementalSync } from '@/lib/sync';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const incremental = body.incremental === true;
    
    console.log(`Starting ${incremental ? 'incremental' : 'full'} sync...`);
    const result = incremental ? await incrementalSync() : await fullSync();
    console.log('Sync result:', JSON.stringify(result));
    
    if (result.errors.length > 0) {
      console.error('Sync errors:', result.errors);
      return NextResponse.json(
        { 
          ...result,
          error: result.errors.join(', ')
        },
        { status: 207 } // Multi-Status - partial success
      );
    }
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { error: `Sync failed: ${error}` },
      { status: 500 }
    );
  }
}
