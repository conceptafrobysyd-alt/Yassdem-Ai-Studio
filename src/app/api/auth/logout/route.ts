import { NextResponse } from 'next/server';
import { api } from '@/lib/http';
import { SESSION_COOKIE } from '@/lib/auth';

export async function POST(request: Request) {
  return api(request, async () => {
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, '', {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 0,
    });
    return response;
  });
}
