import { NextRequest, NextResponse } from 'next/server';
import { validateAndNormalizeUrl } from '@/lib/security';
import { jobManager } from '@/lib/job-manager';
import { isDownloadEngineAvailable } from '@/lib/engine';

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

    // 1. Check if external dedicated download worker is configured
    const backendUrl = process.env.MEDIAVAULT_BACKEND_URL;
    if (backendUrl) {
      const targetUrl = `${backendUrl.replace(/\/+$/, '')}/api/download/start`;
      try {
        const res = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10000),
        });
        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
      } catch (proxyErr: unknown) {
        return NextResponse.json(
          {
            success: false,
            error: `Failed to reach external download backend: ${(proxyErr as Error).message}`,
          },
          { status: 502 }
        );
      }
    }

    // 2. Check if local Python and FFmpeg are available
    if (!isDownloadEngineAvailable()) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Direct media downloading and stream multiplexing require a server environment with Python and FFmpeg installed. On Vercel serverless, video extraction and analysis are fully functional. To enable server-side video downloading on production, connect a dedicated backend worker via MEDIAVAULT_BACKEND_URL or run the application in a Docker/Node environment.',
          code: 'SERVERLESS_ENVIRONMENT_LIMITATION',
        },
        { status: 503 }
      );
    }

    // 3. Launch local background download job
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
