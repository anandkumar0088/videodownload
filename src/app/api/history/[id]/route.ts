import { NextRequest, NextResponse } from 'next/server';
import { deleteHistoryItem } from '@/lib/db';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = deleteHistoryItem(id);
    return NextResponse.json({ success: deleted });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to delete record.';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
