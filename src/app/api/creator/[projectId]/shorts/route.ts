import { NextResponse } from 'next/server';
import { api, readJson } from '@/lib/http';
import { createCreatorShort } from '@/lib/creator';
export const runtime = 'nodejs';
type Context = { params: Promise<{ projectId: string }> };
export async function POST(request: Request, context: Context) {
  return api(request, async () =>
    NextResponse.json(
      await createCreatorShort(
        (await context.params).projectId,
        await readJson(request),
      ),
      { status: 201 },
    ),
  );
}
