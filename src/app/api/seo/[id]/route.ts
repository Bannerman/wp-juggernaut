import { NextRequest, NextResponse } from 'next/server';

const WP_BASE_URL = process.env.WP_BASE_URL || 'https://plexkits.com';
const WP_USERNAME = process.env.WP_USERNAME || '';
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD || '';

const authHeader = 'Basic ' + Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString('base64');

export interface SEOData {
  title: string;
  description: string;
  canonical: string;
  targetKeywords: string;
  og: {
    title: string;
    description: string;
    image: string;
    attachment_id: string;
    image_width: string;
    image_height: string;
  };
  twitter: {
    title: string;
    description: string;
    image: string;
    attachment_id: string;
    image_width: string;
    image_height: string;
  };
  robots: {
    noindex: boolean;
    nofollow: boolean;
    nosnippet: boolean;
    noimageindex: boolean;
  };
}

// GET /api/seo/[id] - Fetch SEO data for a resource
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const postId = params.id;

    const response = await fetch(`${WP_BASE_URL}/wp-json/seopress/v1/posts/${postId}`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      // If SEOPress returns 404 or error, return empty SEO data
      if (response.status === 404) {
        return NextResponse.json({
          seo: {
            title: '',
            description: '',
            canonical: '',
            targetKeywords: '',
            og: { title: '', description: '', image: '', attachment_id: '', image_width: '', image_height: '' },
            twitter: { title: '', description: '', image: '', attachment_id: '', image_width: '', image_height: '' },
            robots: { noindex: false, nofollow: false, nosnippet: false, noimageindex: false },
          }
        });
      }
      throw new Error(`SEOPress API error: ${response.status}`);
    }

    const data = await response.json();

    // Transform SEOPress response to our format
    const seo: SEOData = {
      title: data.title || '',
      description: data.description || '',
      canonical: data.canonical || '',
      targetKeywords: data.target_kw || '',
      og: {
        title: data.og?.title || '',
        description: data.og?.description || '',
        image: data.og?.image || '',
        attachment_id: data.og?.attachment_id || '',
        image_width: data.og?.image_width || '',
        image_height: data.og?.image_height || '',
      },
      twitter: {
        title: data.twitter?.title || '',
        description: data.twitter?.description || '',
        image: data.twitter?.image || '',
        attachment_id: data.twitter?.attachment_id || '',
        image_width: data.twitter?.image_width || '',
        image_height: data.twitter?.image_height || '',
      },
      robots: {
        noindex: data.robots?.noindex || false,
        nofollow: data.robots?.nofollow || false,
        nosnippet: data.robots?.nosnippet || false,
        noimageindex: data.robots?.noimageindex || false,
      },
    };

    return NextResponse.json({ seo });
  } catch (error) {
    console.error('Error fetching SEO data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SEO data' },
      { status: 500 }
    );
  }
}

// PATCH /api/seo/[id] - Update SEO data for a resource
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const postId = params.id;
    const body = await request.json();
    const results: { endpoint: string; success: boolean; error?: string }[] = [];

    // Update title and description
    if (body.title !== undefined || body.description !== undefined) {
      const titleDescPayload: Record<string, string> = {};
      if (body.title !== undefined) titleDescPayload.title = body.title;
      if (body.description !== undefined) titleDescPayload.description = body.description;

      const res = await fetch(`${WP_BASE_URL}/wp-json/seopress/v1/posts/${postId}/title-description-metas`, {
        method: 'PUT',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(titleDescPayload),
      });

      results.push({
        endpoint: 'title-description-metas',
        success: res.ok,
        error: res.ok ? undefined : await res.text(),
      });
    }

    // Update target keywords
    if (body.targetKeywords !== undefined) {
      const res = await fetch(`${WP_BASE_URL}/wp-json/seopress/v1/posts/${postId}/target-keywords`, {
        method: 'PUT',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          '_seopress_analysis_target_kw': body.targetKeywords,
        }),
      });

      results.push({
        endpoint: 'target-keywords',
        success: res.ok,
        error: res.ok ? undefined : await res.text(),
      });
    }

    // Update social settings
    if (body.og || body.twitter) {
      const socialPayload: Record<string, string> = {};

      if (body.og) {
        if (body.og.title !== undefined) socialPayload['_seopress_social_fb_title'] = body.og.title;
        if (body.og.description !== undefined) socialPayload['_seopress_social_fb_desc'] = body.og.description;
        if (body.og.image !== undefined) socialPayload['_seopress_social_fb_img'] = body.og.image;
      }

      if (body.twitter) {
        if (body.twitter.title !== undefined) socialPayload['_seopress_social_twitter_title'] = body.twitter.title;
        if (body.twitter.description !== undefined) socialPayload['_seopress_social_twitter_desc'] = body.twitter.description;
        if (body.twitter.image !== undefined) socialPayload['_seopress_social_twitter_img'] = body.twitter.image;
      }

      if (Object.keys(socialPayload).length > 0) {
        const res = await fetch(`${WP_BASE_URL}/wp-json/seopress/v1/posts/${postId}/social-settings`, {
          method: 'PUT',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(socialPayload),
        });

        results.push({
          endpoint: 'social-settings',
          success: res.ok,
          error: res.ok ? undefined : await res.text(),
        });
      }
    }

    // Update meta robots
    if (body.robots) {
      const robotsPayload: Record<string, string> = {};

      // SEOPress uses "yes" for enabling these settings (which means DO index/follow)
      // noindex: true means we want to NOT index, so we send "no" to _seopress_robots_index
      if (body.robots.noindex !== undefined) {
        robotsPayload['_seopress_robots_index'] = body.robots.noindex ? 'no' : 'yes';
      }
      if (body.robots.nofollow !== undefined) {
        robotsPayload['_seopress_robots_follow'] = body.robots.nofollow ? 'no' : 'yes';
      }
      if (body.robots.nosnippet !== undefined) {
        robotsPayload['_seopress_robots_snippet'] = body.robots.nosnippet ? 'no' : 'yes';
      }
      if (body.robots.noimageindex !== undefined) {
        robotsPayload['_seopress_robots_imageindex'] = body.robots.noimageindex ? 'no' : 'yes';
      }
      if (body.canonical !== undefined) {
        robotsPayload['_seopress_robots_canonical'] = body.canonical;
      }

      if (Object.keys(robotsPayload).length > 0) {
        const res = await fetch(`${WP_BASE_URL}/wp-json/seopress/v1/posts/${postId}/meta-robot-settings`, {
          method: 'PUT',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(robotsPayload),
        });

        results.push({
          endpoint: 'meta-robot-settings',
          success: res.ok,
          error: res.ok ? undefined : await res.text(),
        });
      }
    }

    const allSuccess = results.every(r => r.success);
    const failedEndpoints = results.filter(r => !r.success);

    if (!allSuccess) {
      console.error('Some SEO updates failed:', failedEndpoints);
      return NextResponse.json({
        success: false,
        results,
        error: `Failed endpoints: ${failedEndpoints.map(f => f.endpoint).join(', ')}`,
      }, { status: 207 });
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('Error updating SEO data:', error);
    return NextResponse.json(
      { error: 'Failed to update SEO data' },
      { status: 500 }
    );
  }
}
