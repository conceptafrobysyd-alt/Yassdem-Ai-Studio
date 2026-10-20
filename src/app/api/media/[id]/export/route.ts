import { NextResponse } from 'next/server';
import { api, readJson } from '@/lib/http';
import { exportImage } from '@/lib/image-export';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  return api(request, async () =>
    NextResponse.json(
      await exportImage((await context.params).id, await readJson(request)),
      { status: 201 },
    ),
  );
}
