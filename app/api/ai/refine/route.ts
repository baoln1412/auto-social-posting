import { NextResponse } from 'next/server';
import { generateContent } from '../../pipeline/gemini-client';

/**
 * AI Draft Refinement endpoint.
 * Takes the current draft + user instruction, returns an improved version via Gemini.
 */
export async function POST(request: Request) {
  try {
    const { draft, instruction } = await request.json();

    if (!draft || !instruction) {
      return NextResponse.json(
        { error: 'Both draft and instruction are required' },
        { status: 400 },
      );
    }

    const systemPrompt =
      'You are a Vietnamese football social media editor. ' +
      'The user will give you a Facebook post draft and an instruction to improve it. ' +
      'Return ONLY the improved draft text (no explanations, no markdown, no quotes). ' +
      'Keep it in Vietnamese, 1000-1500 characters, 3-4 paragraphs separated by blank lines. ' +
      'Preserve the "Nguồn:" line at the end if it exists.';

    const userMessage = `--- CURRENT DRAFT ---\n${draft}\n\n--- INSTRUCTION ---\n${instruction}`;

    const refined = await generateContent(systemPrompt, userMessage);

    return NextResponse.json({ success: true, refined: refined.trim() });
  } catch (error) {
    console.error('[ai/refine] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'AI refinement failed' },
      { status: 500 },
    );
  }
}
