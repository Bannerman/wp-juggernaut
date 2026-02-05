import { NextRequest, NextResponse } from 'next/server';
import { getWpBaseUrl, WP_USERNAME, WP_APP_PASSWORD } from '@/lib/wp-client';

export async function POST(request: NextRequest) {
  try {
    // Check auth credentials
    if (!WP_USERNAME || !WP_APP_PASSWORD) {
      return NextResponse.json(
        { error: 'WordPress credentials not configured' },
        { status: 500 }
      );
    }

    // Parse the multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const filename = formData.get('filename') as string;
    const title = formData.get('title') as string;
    const altText = formData.get('alt_text') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Prepare WordPress media endpoint
    const url = `${getWpBaseUrl()}/wp-json/wp/v2/media`;
    
    // Create auth header
    const credentials = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString('base64');
    const authHeader = `Basic ${credentials}`;

    // Upload to WordPress
    const wpResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Disposition': `attachment; filename="${filename || file.name}"`,
        'Content-Type': file.type,
      },
      body: buffer,
    });

    if (!wpResponse.ok) {
      const errorText = await wpResponse.text();
      console.error('WordPress upload error:', errorText);
      return NextResponse.json(
        { error: `WordPress upload failed: ${wpResponse.status}` },
        { status: wpResponse.status }
      );
    }

    const mediaData = await wpResponse.json();
    console.log('[upload] WordPress media response:', JSON.stringify(mediaData, null, 2));

    // Update media metadata if title or alt text provided
    if (title || altText) {
      const metaResponse = await fetch(`${url}/${mediaData.id}`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title || filename || file.name,
          alt_text: altText || '',
        }),
      });
      console.log('[upload] Media metadata update status:', metaResponse.status);
    }

    // Get the URL - prefer source_url, fall back to guid.rendered
    const imageUrl = mediaData.source_url || mediaData.guid?.rendered;

    if (!imageUrl) {
      console.error('[upload] No URL found in WordPress response. Keys:', Object.keys(mediaData));
      return NextResponse.json(
        { error: 'WordPress did not return an image URL' },
        { status: 500 }
      );
    }

    console.log('[upload] Returning: id=%d, url=%s', mediaData.id, imageUrl);

    return NextResponse.json({
      id: mediaData.id,
      url: imageUrl,
      filename: filename || file.name,
      title: title || filename || file.name,
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: `Upload failed: ${String(error)}` },
      { status: 500 }
    );
  }
}
