import { NextResponse } from 'next/server';
import { api, readJson } from '@/lib/http';
import { createLook, listLooks } from '@/lib/fashion';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  return api(request, async () =>
    NextResponse.json({
      looks: await listLooks(
        new URL(request.url).searchParams.get('projectId') ?? undefined,
      ),
    }),
  );
}
export async function POST(request: Request) {
  return api(request, async () =>
    NextResponse.json(
      { look: await createLook(await readJson(request)) },
      { status: 201 },
    ),
  );
}
