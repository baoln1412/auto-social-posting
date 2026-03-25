import { getSupabaseServer } from '@/app/lib/supabase';

export const BATCH_SIZE = 5;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? '';

export function isAvailable(): boolean {
  return !!OPENROUTER_API_KEY;
}

/**
 * Generate text content using OpenRouter (nvidia/nemotron-3-super-120b-a12b:free).
 */
export async function generateContent(systemPrompt: string, userMessage: string, asJson: boolean = false): Promise<string> {
  const model = 'stepfun/step-3.5-flash:free';

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: userMessage });

  const body: any = {
    model,
    messages,
  };

  if (asJson) {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/baoln1412/auto-social-posting', 
      'X-Title': 'Auto Social Posting',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[openrouter-client] Request failed with ${res.status}:`, errText);
    throw new Error(`OpenRouter API Error: ${res.status}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Generate an image using Imagen 4.0 Fast (requires paid API key).
 * Temporarily returning null to disable image generation.
 */
export async function generateImage(prompt: string): Promise<string | null> {
  console.log('[openrouter-client] Image generation temporarily disabled.');
  return null;
}
