import { NextResponse } from 'next/server';
import { getWpBaseUrl, getWpCredentials } from '@/lib/wp-client';

// Force dynamic - don't prerender
export const dynamic = 'force-dynamic';

export async function GET() {
  const baseUrl = getWpBaseUrl();
  const creds = getWpCredentials();
  const authHeader = 'Basic ' + Buffer.from(`${creds.username}:${creds.appPassword}`).toString('base64');

  console.log('[test-connection] Using credentials for:', creds.username);
  console.log('[test-connection] Password length:', creds.appPassword?.length || 0);

  const result = {
    success: false,
    baseUrl,
    apiReachable: false,
    authValid: false,
    resourceCount: undefined as number | undefined,
    error: undefined as string | undefined,
  };

  try {
    // Test API reachability
    const apiResponse = await fetch(`${baseUrl}/wp-json/wp/v2/`, {
      headers: { Authorization: authHeader },
    });

    result.apiReachable = apiResponse.ok;

    if (!apiResponse.ok) {
      result.error = `API returned ${apiResponse.status}`;
      return NextResponse.json(result);
    }

    // Test authentication by fetching resources
    const resourceResponse = await fetch(`${baseUrl}/wp-json/wp/v2/resource?per_page=1`, {
      headers: { Authorization: authHeader },
    });

    result.authValid = resourceResponse.ok;

    if (resourceResponse.ok) {
      const totalHeader = resourceResponse.headers.get('X-WP-Total');
      result.resourceCount = totalHeader ? parseInt(totalHeader, 10) : 0;
      result.success = true;
    } else {
      result.error = `Authentication failed: ${resourceResponse.status}`;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Connection test error:', error);
    result.error = String(error);
    return NextResponse.json(result);
  }
}
