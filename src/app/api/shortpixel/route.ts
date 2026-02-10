import { NextRequest, NextResponse } from 'next/server';
import { getShortpixelApiKey } from '@/lib/site-config';

export async function POST(request: NextRequest) {
  try {
    const apiKey = getShortpixelApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Shortpixel API Key not configured' },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const lossy = formData.get('lossy') || '1'; // Default to Lossy (1)

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Prepare upload to Shortpixel
    const uploadData = new FormData();
    uploadData.append('key', apiKey);
    uploadData.append('lossy', lossy.toString());
    // Use a generic key 'file' for the upload to avoid issues with special characters in filenames
    uploadData.append('file_paths', JSON.stringify({ file: file.name }));
    uploadData.append('file', file);

    console.log(`[Shortpixel] Uploading ${file.name} (${file.size} bytes)`);

    const response = await fetch('https://api.shortpixel.com/v2/post-reducer.php', {
      method: 'POST',
      body: uploadData,
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[Shortpixel] API Error:', text);
      return NextResponse.json(
        { error: `Shortpixel API error: ${response.status}` },
        { status: response.status }
      );
    }

    const result = await response.json();
    console.log('[Shortpixel] Response:', JSON.stringify(result, null, 2));

    // Shortpixel returns an array of results or an object if single file?
    // Usually it's a list for bulk, but let's check the structure.
    // Based on docs, it might be an array or object depending on input.
    // For post-reducer, it's often a single object or array with one item.

    const item = Array.isArray(result) ? result[0] : result;

    if (!item || !item.Status) {
       return NextResponse.json(
        { error: 'Invalid response from Shortpixel' },
        { status: 502 }
      );
    }

    if (item.Status.Code !== 2) {
       return NextResponse.json(
        { error: `Shortpixel error: ${item.Status.Message}` },
        { status: 500 }
      );
    }

    const compressedUrl = item.LossyUrl;
    if (!compressedUrl) {
       return NextResponse.json(
        { error: 'No compressed URL returned' },
        { status: 500 }
      );
    }

    console.log(`[Shortpixel] Downloading compressed image from ${compressedUrl}`);

    // Download the compressed image
    const imageResponse = await fetch(compressedUrl);
    if (!imageResponse.ok) {
       return NextResponse.json(
        { error: 'Failed to download compressed image' },
        { status: 502 }
      );
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const headers = new Headers();
    headers.set('Content-Type', file.type);
    headers.set('Content-Length', imageBuffer.byteLength.toString());
    headers.set('X-Original-Size', item.OriginalSize);
    headers.set('X-Compressed-Size', item.LossySize);
    headers.set('X-Optimization-Percent', item.PercentImprovement);

    return new NextResponse(imageBuffer, {
      status: 200,
      headers,
    });

  } catch (error) {
    console.error('[Shortpixel] Internal Error:', error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
