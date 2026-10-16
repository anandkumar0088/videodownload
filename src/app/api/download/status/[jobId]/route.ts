import { NextRequest, NextResponse } from 'next/server';
import { jobManager } from '@/lib/job-manager';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  const backendUrl = process.env.MEDIAVAULT_BACKEND_URL;
  if (backendUrl) {
    try {
      const targetUrl = `${backendUrl.replace(/\/+$/, '')}/api/download/status/${jobId}`;
      const res = await fetch(targetUrl, { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    } catch {
      // Fallback to local
    }
  }

  const job = jobManager.getJob(jobId);

  if (!job) {
    return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, job });
}
