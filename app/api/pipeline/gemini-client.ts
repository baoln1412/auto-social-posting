import { GoogleGenerativeAI } from '@google/generative-ai';

export const BATCH_SIZE = 10;

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

export async function generateContent(systemPrompt: string, userMessage: string): Promise<string> {
  const model = getGenAI().getGenerativeModel({
    model: 'gemini-3.1-flash-lite-preview', // extremely stable on free tier
    systemInstruction: systemPrompt
  });

  const result = await model.generateContent(userMessage);
  return result.response.text();
}
