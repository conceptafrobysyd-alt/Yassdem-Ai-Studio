import { NextResponse } from 'next/server';
import { api } from '@/lib/http';
import { listMedia, uploadMedia } from '@/lib/media';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  return api(request, async () =>
    NextResponse.json({ media: await listMedia() }),
  );
}
export async function POST(request: Request) {
  return api(request, async () =>
    NextResponse.json({ media: await uploadMedia(request) }, { status: 201 }),
  );
}
