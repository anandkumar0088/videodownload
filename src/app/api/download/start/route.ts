import { NextRequest, NextResponse } from 'next/server';
import { validateAndNormalizeUrl } from '@/lib/security';
import { jobManager } from '@/lib/job-manager';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, title, thumbnail, formatId, ext, quality, uploader, duration } = body;

    const validation = validateAndNormalizeUrl(url);
    if (!validation.valid || !validation.url) {
      return NextResponse.json(
        { success: false, error: validation.error || 'Invalid video URL.' },
        { status: 400 }
      );
    }

    if (!formatId || !title) {
      return NextResponse.json(
        { success: false, error: 'Missing format selection or video title.' },
        { status: 400 }
      );
    }

    const job = jobManager.createJob({
      url: validation.url,
      title,
      thumbnail,
      formatId,
      ext: ext || 'mp4',
      quality: quality || 'Best',
      uploader,
      duration,
    });

    return NextResponse.json({
      success: true,
      jobId: job.jobId,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to initialize download job.';
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
