import { NextResponse } from 'next/server';
import { api, readJson } from '@/lib/http';
import { approveCreatorDocument } from '@/lib/creator';
export const runtime = 'nodejs';
type Context = { params: Promise<{ projectId: string }> };
export async function POST(request: Request, context: Context) {
  return api(request, async () =>
    NextResponse.json(
      await approveCreatorDocument(
        (await context.params).projectId,
        await readJson(request),
      ),
    ),
  );
}
