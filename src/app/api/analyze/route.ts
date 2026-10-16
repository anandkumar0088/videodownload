import { NextRequest, NextResponse } from 'next/server';
import { validateAndNormalizeUrl } from '@/lib/security';
import { extractMetadata } from '@/lib/engine';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url } = body;

    const validation = validateAndNormalizeUrl(url);
    if (!validation.valid || !validation.url) {
      return NextResponse.json(
        { success: false, error: validation.error || 'Invalid URL provided.' },
        { status: 400 }
      );
    }

    const originUrl = req.nextUrl.origin;
    const metadata = await extractMetadata(validation.url, originUrl);

    return NextResponse.json({
      success: true,
      data: metadata,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to analyze video.';
    console.error('[MediaVault API] Analyze error:', msg);
    return NextResponse.json(
      { success: false, error: msg },
      { status: 422 }
    );
  }
}
