import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/auth/facebook
 * Redirects the user to Facebook's OAuth dialog.
 * Expects ?pageId=xxx to pass as state param for the callback.
 */
export async function GET(request: NextRequest) {
  const appId = process.env.FACEBOOK_APP_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectUri = `${appUrl}/api/auth/facebook/callback`;

  const { searchParams } = new URL(request.url);
  const pageId = searchParams.get('pageId') || '';

  if (!appId) {
    return NextResponse.json({ error: 'FACEBOOK_APP_ID not configured' }, { status: 500 });
  }

  const scopes = ['pages_manage_posts', 'pages_show_list', 'pages_read_engagement'].join(',');

  const oauthUrl = new URL('https://www.facebook.com/v20.0/dialog/oauth');
  oauthUrl.searchParams.set('client_id', appId);
  oauthUrl.searchParams.set('redirect_uri', redirectUri);
  oauthUrl.searchParams.set('scope', scopes);
  oauthUrl.searchParams.set('response_type', 'code');
  oauthUrl.searchParams.set('state', pageId);

  return NextResponse.redirect(oauthUrl.toString());
}
