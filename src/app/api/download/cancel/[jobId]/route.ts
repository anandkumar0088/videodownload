import { NextRequest, NextResponse } from 'next/server';
import { jobManager } from '@/lib/job-manager';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  const backendUrl = process.env.MEDIAVAULT_BACKEND_URL;
  if (backendUrl) {
    try {
      const targetUrl = `${backendUrl.replace(/\/+$/, '')}/api/download/cancel/${jobId}`;
      const res = await fetch(targetUrl, { method: 'POST', signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    } catch {
      // Fallback to local
    }
  }

  const success = jobManager.cancelJob(jobId);
  return NextResponse.json({ success });
}
