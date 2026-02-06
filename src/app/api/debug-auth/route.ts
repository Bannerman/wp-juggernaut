import { NextResponse } from 'next/server';
import { getWpBaseUrl, getWpCredentials } from '@/lib/wp-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const baseUrl = getWpBaseUrl();
  const creds = getWpCredentials();

  // Show credentials (partially masked for security)
  const maskedPassword = creds.appPassword
    ? creds.appPassword.substring(0, 4) + '...' + creds.appPassword.substring(creds.appPassword.length - 4)
    : '(empty)';

  // Create auth header same way as wp-client
  const authHeader = 'Basic ' + Buffer.from(`${creds.username}:${creds.appPassword}`).toString('base64');

  // Test the actual WordPress API
  let wpResponse = null;
  let wpError = null;

  try {
    const res = await fetch(`${baseUrl}/wp-json/wp/v2/users/me`, {
      headers: { 'Authorization': authHeader },
    });
    wpResponse = {
      status: res.status,
      statusText: res.statusText,
      body: await res.text(),
    };
  } catch (e) {
    wpError = String(e);
  }

  return NextResponse.json({
    baseUrl,
    username: creds.username,
    passwordLength: creds.appPassword?.length || 0,
    passwordPreview: maskedPassword,
    passwordHasSpaces: creds.appPassword?.includes(' '),
    authHeaderLength: authHeader.length,
    wpResponse,
    wpError,
  });
}
