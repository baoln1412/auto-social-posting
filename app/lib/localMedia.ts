/**
 * Uploaded media is served by this same Next server, but the drawer records each file as
 * an absolute URL built from whatever hostname the page was opened on. On
 * posting.desoul.dev that hostname sits behind Cloudflare Access, so when the renderer
 * fetches it server-side — with no Access session — it gets the Access sign-in page back,
 * HTTP 200, instead of the image. make-reel.py then tried to decode that page as a JPEG.
 * Route our own uploads over loopback, where nothing sits in front of the server.
 */
const UPLOAD_PATH = '/api/image/upload';

export function localizeMediaUrl(url: string): string {
  if (!url) return url;
  const origin = `http://127.0.0.1:${process.env.PORT ?? '3000'}`;
  if (url.startsWith(UPLOAD_PATH)) return origin + url;
  try {
    const u = new URL(url);
    return u.pathname === UPLOAD_PATH ? origin + u.pathname + u.search : url;
  } catch {
    return url; // not a URL we can parse — leave it for the fetcher to reject
  }
}
