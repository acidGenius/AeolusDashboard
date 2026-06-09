import { NextResponse } from 'next/server';
import { signToken, validatePassword, cookieOptions } from '@/lib/auth';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { password } = body as { password?: string };

  if (!password || !validatePassword(password)) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const token = await signToken({ sub: 'admin', role: 'admin' });
  const opts = cookieOptions();

  const res = NextResponse.json({ ok: true });
  res.cookies.set(opts.name, token, opts);
  return res;
}
