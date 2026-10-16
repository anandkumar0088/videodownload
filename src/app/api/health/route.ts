import { NextRequest, NextResponse } from 'next/server';
import { findPythonBinary, getFfmpegPath, isDownloadEngineAvailable } from '@/lib/engine';

export const maxDuration = 15;

export async function GET(req: NextRequest) {
  const pythonCmd = findPythonBinary();
  const ffmpegPath = getFfmpegPath();
  const downloadAvailable = isDownloadEngineAvailable();
  const backendUrl = process.env.MEDIAVAULT_BACKEND_URL || null;

  // Test Python extraction function availability
  let pythonFunctionStatus = 'untested';
  let pythonFunctionDetails = null;

  try {
    const originUrl = req.nextUrl.origin;
    const testEndpoint = `${originUrl}/api/extract`;
    const res = await fetch(testEndpoint, {
      method: 'GET',
      headers: {
        'x-vercel-protection-bypass':
          req.headers.get('x-vercel-protection-bypass') ||
          process.env.VERCEL_AUTOMATION_BYPASS_SECRET ||
          '',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const data = await res.json();
      pythonFunctionStatus = 'reachable';
      pythonFunctionDetails = data;
    } else {
      pythonFunctionStatus = `error_status_${res.status}`;
    }
  } catch (err: unknown) {
    pythonFunctionStatus = `unreachable: ${(err as Error).message}`;
  }

  return NextResponse.json({
    success: true,
    status: 'operational',
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      isVercel: Boolean(process.env.VERCEL),
    },
    engines: {
      localPython: {
        available: pythonCmd !== null,
        binary: pythonCmd,
      },
      ffmpeg: {
        available: ffmpegPath !== null,
        path: ffmpegPath,
      },
      vercelPythonExtractor: {
        status: pythonFunctionStatus,
        details: pythonFunctionDetails,
      },
      downloadWorker: {
        mode: backendUrl ? 'external_worker' : downloadAvailable ? 'local_process' : 'serverless_restricted',
        available: Boolean(backendUrl || downloadAvailable),
        backendUrlConfigured: Boolean(backendUrl),
        description: backendUrl
          ? 'Routing download jobs to dedicated external worker service.'
          : downloadAvailable
          ? 'Executing downloads with local host Python and FFmpeg engine.'
          : 'Serverless deployment mode: direct DASH multiplexing requires a dedicated background worker.',
      },
    },
  });
}
