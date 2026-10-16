import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { isPathSafe } from '@/lib/security';
import { jobManager } from '@/lib/job-manager';

const TEMP_DIR = path.resolve(process.cwd(), 'temp_downloads');

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  if (!jobId || !/^[0-9a-fA-F-]+$/.test(jobId)) {
    return NextResponse.json({ error: 'Invalid Job ID' }, { status: 400 });
  }

  // 1. If dedicated external backend is configured and file is not local, redirect directly
  const backendUrl = process.env.MEDIAVAULT_BACKEND_URL;

  // 2. Find corresponding file locally if present
  const job = jobManager.getJob(jobId);
  let targetPath = job?.filePath;

  if ((!targetPath || !fs.existsSync(/*turbopackIgnore: true*/ targetPath)) && fs.existsSync(/*turbopackIgnore: true*/ TEMP_DIR)) {
    try {
      const candidates = fs.readdirSync(TEMP_DIR).filter((f) => f.startsWith(jobId));
      const finalFile = candidates.find((f) => !f.endsWith('.part') && !f.endsWith('.ytdl'));
      if (finalFile) {
        targetPath = path.join(TEMP_DIR, finalFile);
      }
    } catch {
      // Ignore read error
    }
  }

  if (!targetPath || !fs.existsSync(/*turbopackIgnore: true*/ targetPath)) {
    if (backendUrl) {
      return NextResponse.redirect(`${backendUrl.replace(/\/+$/, '')}/api/download/file/${jobId}`, 307);
    }
    return NextResponse.json({ error: 'Requested media file not found or expired.' }, { status: 404 });
  }

  if (!isPathSafe(TEMP_DIR, path.basename(targetPath))) {
    return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  }

  const stat = fs.statSync(/*turbopackIgnore: true*/ targetPath);
  const ext = path.extname(targetPath).toLowerCase();

  let contentType = 'application/octet-stream';
  if (ext === '.mp4') contentType = 'video/mp4';
  else if (ext === '.webm') contentType = 'video/webm';
  else if (ext === '.mp3') contentType = 'audio/mpeg';
  else if (ext === '.m4a') contentType = 'audio/mp4';

  const rawFilename = path.basename(targetPath).replace(`${jobId}_`, '');
  const downloadFilename = encodeURIComponent(rawFilename || `video${ext}`);

  // Node stream to web stream
  const nodeStream = fs.createReadStream(/*turbopackIgnore: true*/ targetPath);
  const webStream = new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk) => controller.enqueue(chunk));
      nodeStream.on('end', () => controller.close());
      nodeStream.on('error', (err) => controller.error(err));
    },
    cancel() {
      nodeStream.destroy();
    },
  });

  return new Response(webStream, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': stat.size.toString(),
      'Content-Disposition': `attachment; filename="${downloadFilename}"; filename*=UTF-8''${downloadFilename}`,
      'Cache-Control': 'no-cache',
    },
  });
}
