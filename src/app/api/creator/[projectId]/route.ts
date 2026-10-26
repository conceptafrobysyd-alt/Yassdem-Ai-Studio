import { NextResponse } from 'next/server';
import { api, readJson } from '@/lib/http';
import { getCreatorDocument, updateCreatorDocument } from '@/lib/creator';
export const runtime = 'nodejs';
type Context = { params: Promise<{ projectId: string }> };
export async function GET(request: Request, context: Context) {
  return api(request, async () =>
    NextResponse.json(
      await getCreatorDocument((await context.params).projectId),
    ),
  );
}
export async function PUT(request: Request, context: Context) {
  return api(request, async () =>
    NextResponse.json(
      await updateCreatorDocument(
        (await context.params).projectId,
        await readJson(request),
      ),
    ),
  );
}
