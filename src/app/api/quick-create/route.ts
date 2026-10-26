import { NextResponse } from 'next/server';
import { api, readJson } from '@/lib/http';
import { quickCreate, quickCreateCapabilities } from '@/lib/quick-create';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return api(request, async () =>
    NextResponse.json(await quickCreateCapabilities()),
  );
}
export async function POST(request: Request) {
  return api(request, async () =>
    NextResponse.json(await quickCreate(await readJson(request)), {
      status: 202,
    }),
  );
}
