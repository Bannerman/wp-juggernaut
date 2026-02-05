import { NextRequest, NextResponse } from 'next/server';
import { getConfig, setActiveTarget, getActiveTarget, SITE_TARGETS } from '@/lib/site-config';

// GET /api/site-config - Get current config and available targets
export async function GET() {
  try {
    const config = getConfig();
    const activeTarget = getActiveTarget();

    return NextResponse.json({
      activeTarget,
      targets: SITE_TARGETS,
      config,
    });
  } catch (error) {
    console.error('Error getting site config:', error);
    return NextResponse.json(
      { error: 'Failed to get site config' },
      { status: 500 }
    );
  }
}

// PATCH /api/site-config - Update active target
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { targetId } = body;

    if (!targetId) {
      return NextResponse.json(
        { error: 'targetId is required' },
        { status: 400 }
      );
    }

    const config = setActiveTarget(targetId);
    const activeTarget = getActiveTarget();

    return NextResponse.json({
      activeTarget,
      config,
      message: `Switched to ${activeTarget.name}`,
    });
  } catch (error) {
    console.error('Error updating site config:', error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
