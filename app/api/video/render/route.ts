import { NextRequest, NextResponse } from 'next/server';
import { startRenderJob, getJob } from '../../../lib/videoJobs';

export async function POST(req: NextRequest) {
  const { emojiTitle, narration, media } = await req.json();
  if (!narration || !String(narration).trim()) {
    return NextResponse.json({ error: 'narration script is required' }, { status: 400 });
  }
  const jobId = startRenderJob({ emojiTitle: emojiTitle ?? '', narration, media: Array.isArray(media) ? media : [] });
  return NextResponse.json({ jobId });
}

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('jobId') ?? '';
  const job = getJob(jobId);
  if (!job) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(job);
}
