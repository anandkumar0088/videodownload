import { NextResponse } from 'next/server';
import { getAllHistory, clearAllHistory } from '@/lib/db';

export async function GET() {
  try {
    const history = getAllHistory();
    return NextResponse.json({ success: true, history });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to retrieve history.';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    clearAllHistory();
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to clear history.';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
