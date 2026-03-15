/**
 * Gemini API client for the crime news pipeline.
 *
 * Uses the Google Generative AI SDK with Gemini 3.1 Flash Lite.
 * Free tier limits: 15 RPM, 250K TPM, 20 RPD.
 *
 * To stay within 20 RPD, articles are batched (5 per call):
 *   25 articles ÷ 5 per batch = 5 API calls per run
 *   → leaves 15 calls/day for retries or additional runs
 *
 * Requires the GEMINI_API_KEY environment variable.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_NAME = 'gemini-3.1-flash-lite-preview';
const BATCH_SIZE = 5; // Articles per API call (25 articles → 5 calls → fits 20 RPD)

let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is not set');
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

/**
 * Check if the Gemini API is available (API key is configured).
 */
export function isAvailable(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

/**
 * Generate content using Gemini for a single prompt.
 * Returns the raw text response.
 */
export async function generateContent(prompt: string): Promise<string> {
  const client = getClient();
  const model = client.getGenerativeModel({ model: MODEL_NAME });

  const result = await model.generateContent(prompt);
  const response = result.response;
  return response.text();
}

export { BATCH_SIZE };
