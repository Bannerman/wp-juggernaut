import { NextResponse } from 'next/server';
import { getWpBaseUrl, WP_USERNAME, WP_APP_PASSWORD } from '@/lib/wp-client';

export async function GET() {
  const baseUrl = getWpBaseUrl();
  const authHeader = 'Basic ' + Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString('base64');

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
