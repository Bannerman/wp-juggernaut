import { NextRequest, NextResponse } from 'next/server';
import { getConfig, setActiveTarget, getActiveTarget, SITE_TARGETS, getCredentials, setCredentials } from '@/lib/site-config';

// GET /api/site-config - Get current config and available targets
export async function GET() {
  try {
    const config = getConfig();
    const activeTarget = getActiveTarget();
    const credentials = getCredentials();

    return NextResponse.json({
      activeTarget,
      targets: SITE_TARGETS,
      config,
      // Only return whether credentials exist, not the actual values for security
      hasCredentials: Boolean(credentials),
      username: credentials?.username || '',
    });
  } catch (error) {
    console.error('Error getting site config:', error);
    return NextResponse.json(
      { error: 'Failed to get site config' },
      { status: 500 }
    );
  }
}

// PATCH /api/site-config - Update active target or credentials
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { targetId, credentials } = body;

    // Handle credential update
    if (credentials) {
      const { username, appPassword } = credentials;
      if (!username || !appPassword) {
        return NextResponse.json(
          { error: 'Both username and appPassword are required' },
          { status: 400 }
        );
      }
      setCredentials(username, appPassword);
      return NextResponse.json({
        message: 'Credentials saved successfully',
        hasCredentials: true,
        username,
      });
    }

    // Handle target switch
    if (targetId) {
      const config = setActiveTarget(targetId);
      const activeTarget = getActiveTarget();

      return NextResponse.json({
        activeTarget,
        config,
        message: `Switched to ${activeTarget.name}`,
      });
    }

    return NextResponse.json(
      { error: 'Either targetId or credentials is required' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error updating site config:', error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
