import { NextResponse } from 'next/server';
import { testConnection } from '@/lib/wp-client';

export async function GET() {
  try {
    const result = await testConnection();
    
    if (!result.success) {
      return NextResponse.json(result, { status: 503 });
    }
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Connection test error:', error);
    return NextResponse.json(
      { success: false, message: String(error) },
      { status: 500 }
    );
  }
}
