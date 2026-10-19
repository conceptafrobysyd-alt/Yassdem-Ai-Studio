import { NextResponse } from 'next/server';
import { api } from '@/lib/http';
import { duplicateLook } from '@/lib/fashion';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  return api(request, async () =>
    NextResponse.json(
      { look: await duplicateLook((await context.params).id) },
      { status: 201 },
    ),
  );
}
