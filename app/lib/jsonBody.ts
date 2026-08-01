/**
 * Parsing for request bodies that a Claude Code CLI agent hand-writes.
 *
 * The pipeline's silver/gold steps are POSTed by an agent that composes JSON
 * containing long Vietnamese prose. When that prose carries an unescaped `"` or a
 * raw newline the body fails to parse, and the bare V8 message ("Expected ',' or
 * '}' after property value in JSON at position 1112") tells the agent nothing about
 * WHICH character broke it — so it retries blind. Every retry re-runs generation.
 *
 * So: report the offending offset with the surrounding text, and answer 400 rather
 * than 500 — a 5xx reads as "server is broken, resend as-is", which is the opposite
 * of what the agent should do.
 *
 * Deliberately does NOT try to repair the JSON. Unescaped quotes are ambiguous, and
 * a wrong guess would silently alter text that gets published.
 */

export type ParsedBody = { ok: true; data: any } | { ok: false; error: string };

const WINDOW = 80;

export async function parseJsonBody(request: Request): Promise<ParsedBody> {
  const raw = await request.text();
  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const at = Number(/position (\d+)/.exec(msg)?.[1] ?? NaN);
    let where = '';
    if (Number.isFinite(at)) {
      // Mark the exact offset so the agent can see the character it must escape.
      const before = raw.slice(Math.max(0, at - WINDOW), at);
      const after = raw.slice(at, at + WINDOW);
      where = ` Near offset ${at}: ...${before}<<<HERE>>>${after}...`;
    }
    return {
      ok: false,
      error:
        `Request body is not valid JSON: ${msg}.${where} ` +
        'Usually an unescaped " or a raw newline inside a string value — serialise the ' +
        'payload with a JSON encoder instead of writing it by hand, then resend.',
    };
  }
}
