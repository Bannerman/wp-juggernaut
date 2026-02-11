import { NextRequest, NextResponse } from 'next/server';
import { getConfig, setActiveTarget, getActiveTarget, getSiteTargets, getCredentials, setCredentials, getAllCredentialsStatus } from '@/lib/site-config';

// GET /api/site-config - Get current config and available targets
export async function GET() {
  try {
    const config = getConfig();
    const activeTarget = getActiveTarget();
    const credentials = getCredentials();
    const targets = getSiteTargets();

    // Use helper to get status securely (handles both Electron secure storage and local fallback)
    const siteCredentialStatus = getAllCredentialsStatus();

    return NextResponse.json({
      activeTarget,
      targets,
      config: { activeTarget: config.activeTarget },
      hasCredentials: Boolean(credentials),
      username: credentials?.username || '',
      siteCredentialStatus,
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

    // Handle credential update (saves for the currently active target)
    if (credentials) {
      if (process.env.JUGGERNAUT_ELECTRON === '1') {
        return NextResponse.json(
          { error: 'Credential updates must be done via the desktop app' },
          { status: 403 }
        );
      }

      const { username, appPassword } = credentials;
      if (!username || !appPassword) {
        return NextResponse.json(
          { error: 'Both username and appPassword are required' },
          { status: 400 }
        );
      }
      setCredentials(username, appPassword);
      const activeTarget = getActiveTarget();
      return NextResponse.json({
        message: `Credentials saved for ${activeTarget.name}`,
        hasCredentials: true,
        username,
      });
    }

    // Handle target switch
    if (targetId) {
      setActiveTarget(targetId);
      const activeTarget = getActiveTarget();
      const credentials = getCredentials();

      return NextResponse.json({
        activeTarget,
        hasCredentials: Boolean(credentials),
        username: credentials?.username || '',
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
