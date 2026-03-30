const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
const MODEL = 'gemini-3.1-flash-lite-preview';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Per-article timeout
const ARTICLE_TIMEOUT_MS = 30_000;

export function isAvailable(): boolean {
  return !!GEMINI_API_KEY;
}

/**
 * Generate text content using Google Gemini API directly.
 * Fast, reliable, no provider routing issues.
 */
export async function generateContent(systemPrompt: string, userMessage: string, _asJson: boolean = false): Promise<string> {
  const url = `${API_BASE}/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const contents = [];

  // Gemini uses a different format — system instruction is separate
  const body: Record<string, unknown> = {
    contents: [
      {
        role: 'user',
        parts: [{ text: userMessage }],
      },
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096,
    },
  };

  // Add system instruction if provided
  if (systemPrompt) {
    (body as any).systemInstruction = {
      parts: [{ text: systemPrompt }],
    };
  }

  console.log(`[gemini-client] Calling ${MODEL}...`);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(ARTICLE_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[gemini-client] ${MODEL} → HTTP ${res.status}:`, errText.slice(0, 300));
    throw new Error(`Gemini API Error: ${res.status} - ${errText.slice(0, 100)}`);
  }

  const data = await res.json();

  // Extract text from Gemini response format
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  if (!content || content.trim().length < 20) {
    console.warn(`[gemini-client] ${MODEL} → too short (${content.length} chars)`);
    throw new Error('Gemini returned empty/too-short response');
  }

  console.log(`[gemini-client] ✅ ${MODEL} → ${content.length} chars`);
  return content;
}

/**
 * Image generation — temporarily disabled.
 */
export async function generateImage(prompt: string): Promise<string | null> {
  console.log('[gemini-client] Image generation temporarily disabled.');
  return null;
}
