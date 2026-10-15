import { NextRequest, NextResponse } from 'next/server';
import { jobManager } from '@/lib/job-manager';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const success = jobManager.cancelJob(jobId);

  return NextResponse.json({ success });
}
