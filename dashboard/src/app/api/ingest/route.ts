import { NextResponse } from 'next/server';
import { runIngest } from '@/lib/ingest';

export async function POST() {
  try {
    const result = await runIngest();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
