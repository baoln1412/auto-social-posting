import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/app/lib/supabase';

/**
 * GET /api/auth/facebook/callback
 *
 * Facebook redirects here after the user grants permissions.
 * Flow: code → short-lived → long-lived → page tokens → page_channels
 *
 * Expects state param = pageId (content page to associate channels with)
 */
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectUri = `${appUrl}/api/auth/facebook/callback`;

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const errorParam = searchParams.get('error');
  const pageId = searchParams.get('state'); // content page ID

  if (errorParam) {
    const reason = searchParams.get('error_description') || 'Permission denied';
    return NextResponse.redirect(`${appUrl}?fb_error=${encodeURIComponent(reason)}`);
  }

  if (!code) {
    return NextResponse.redirect(`${appUrl}?fb_error=${encodeURIComponent('No authorization code received')}`);
  }

  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;

  if (!appId || !appSecret) {
    return NextResponse.redirect(`${appUrl}?fb_error=${encodeURIComponent('FACEBOOK_APP_ID or FACEBOOK_APP_SECRET not configured')}`);
  }

  try {
    // Step 1: Exchange code → short-lived user token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v20.0/oauth/access_token?` +
        `client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `client_secret=${appSecret}&code=${code}`,
    );
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return NextResponse.redirect(`${appUrl}?fb_error=${encodeURIComponent(tokenData.error.message)}`);
    }

    const shortLivedToken = tokenData.access_token;

    // Step 2: Exchange → long-lived user token
    const longLivedRes = await fetch(
      `https://graph.facebook.com/v20.0/oauth/access_token?` +
        `grant_type=fb_exchange_token&client_id=${appId}&` +
        `client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`,
    );
    const longLivedData = await longLivedRes.json();

    if (longLivedData.error) {
      return NextResponse.redirect(`${appUrl}?fb_error=${encodeURIComponent(longLivedData.error.message)}`);
    }

    const longLivedUserToken = longLivedData.access_token;

    // Step 3: Get page tokens via /me/accounts
    const accountsRes = await fetch(
      `https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token&access_token=${longLivedUserToken}`,
    );
    const accountsData = await accountsRes.json();

    if (!accountsData.data || accountsData.data.length === 0) {
      return NextResponse.redirect(`${appUrl}?fb_error=${encodeURIComponent('No Facebook Pages found.')}`);
    }

    // Step 4: Store each page token in page_channels
    const supabase = getSupabaseServer();
    const pages = accountsData.data;

    for (const page of pages) {
      const { error: upsertError } = await supabase
        .from('page_channels')
        .upsert(
          {
            page_id: pageId || null,
            platform: 'facebook',
            platform_page_id: page.id,
            platform_page_name: page.name,
            access_token: page.access_token,
            connected_at: new Date().toISOString(),
          },
          { onConflict: 'page_id,platform,platform_page_id' },
        );

      if (upsertError) {
        console.error('[facebook-oauth] Upsert error for page', page.name, ':', upsertError);
      } else {
        console.log(`[facebook-oauth] Stored token for page "${page.name}" (${page.id})`);
      }
    }

    const pageNames = pages.map((p: any) => p.name).join(', ');
    return NextResponse.redirect(`${appUrl}?fb_success=${encodeURIComponent(`Connected: ${pageNames}`)}`);
  } catch (err) {
    console.error('[facebook-oauth] Error:', err);
    return NextResponse.redirect(`${appUrl}?fb_error=${encodeURIComponent(err instanceof Error ? err.message : 'Unknown error')}`);
  }
}
