import { NextRequest } from 'next/server';
import { jobManager } from '@/lib/job-manager';
import { DownloadJob } from '@/lib/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const initialJob = jobManager.getJob(jobId);

  if (!initialJob) {
    return new Response(JSON.stringify({ error: 'Job not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (job: DownloadJob) => {
        try {
          const data = `data: ${JSON.stringify(job)}\n\n`;
          controller.enqueue(encoder.encode(data));

          if (
            job.status === 'completed' ||
            job.status === 'failed' ||
            job.status === 'cancelled'
          ) {
            setTimeout(() => {
              try {
                controller.close();
              } catch {
                // Ignore
              }
            }, 500);
          }
        } catch {
          // Controller might already be closed
        }
      };

      const unsubscribe = jobManager.subscribe(jobId, sendEvent);

      // Heartbeat ping every 15s to keep connection open
      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(interval);
        }
      }, 15000);

      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
        unsubscribe();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
