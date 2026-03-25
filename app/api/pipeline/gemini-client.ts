import { GoogleGenerativeAI } from '@google/generative-ai';
import { getSupabaseServer } from '@/app/lib/supabase';

export const BATCH_SIZE = 5;

export function isAvailable(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

// Lazy initialization so it doesn't crash on import if key is missing
let genAI: GoogleGenerativeAI | null = null;
function getGenAI() {
  if (!genAI) {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is missing');
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

/**
 * Generate text content using Gemini 2.5 Flash.
 */
export async function generateContent(systemPrompt: string, userMessage: string, asJson: boolean = false): Promise<string> {
  const model = getGenAI().getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: systemPrompt,
    ...(asJson ? { generationConfig: { responseMimeType: 'application/json' } } : {})
  });

  const result = await model.generateContent(userMessage);
  return result.response.text();
}

/**
 * Generate an image using Imagen 4.0 Fast (requires paid API key).
 * Uploads to Supabase Storage and returns the public URL.
 * Returns null if the API key doesn't support image generation.
 */
export async function generateImage(prompt: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict?key=${apiKey}`;
    const body = {
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio: '16:9' },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      // Don't log as error if it's a plan limitation — it's expected on free tier
      if (errText.includes('paid plan')) {
        console.log('[gemini-client] Image generation skipped: requires paid plan.');
      } else {
        console.error('[gemini-client] Image generation failed:', res.status, errText.substring(0, 200));
      }
      return null;
    }

    const data = await res.json();
    if (!data.predictions || data.predictions.length === 0) return null;

    const prediction = data.predictions[0];
    const base64Data = prediction.bytesBase64Encoded;
    const mimeType = prediction.mimeType || 'image/png';

    if (!base64Data) return null;

    // Upload to Supabase Storage
    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const buffer = Buffer.from(base64Data, 'base64');
    const supabase = getSupabaseServer();

    const { error } = await supabase.storage
      .from('post-images')
      .upload(fileName, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (error) {
      console.error('[gemini-client] Failed to upload image:', error);
      return null;
    }

    const { data: publicUrlData } = supabase.storage
      .from('post-images')
      .getPublicUrl(fileName);

    console.log(`[gemini-client] Image uploaded: ${publicUrlData.publicUrl}`);
    return publicUrlData.publicUrl;
  } catch (err) {
    console.error('[gemini-client] Image generation error:', err);
    return null;
  }
}
