import { NextResponse } from 'next/server';
import { api, readJson } from '@/lib/http';
import { createSeoDocument, editSeoDocument, getSeoDocument } from '@/lib/seo';
export const runtime = 'nodejs';
type Context = { params: Promise<{ projectId: string }> };
export async function GET(request: Request, context: Context) {
  return api(request, async () =>
    NextResponse.json({
      document: await getSeoDocument((await context.params).projectId),
    }),
  );
}
export async function POST(request: Request, context: Context) {
  return api(request, async () =>
    NextResponse.json({
      document: await createSeoDocument(
        (await context.params).projectId,
        await readJson(request),
      ),
    }),
  );
}
export async function PATCH(request: Request, context: Context) {
  return api(request, async () =>
    NextResponse.json({
      document: await editSeoDocument(
        (await context.params).projectId,
        await readJson(request),
      ),
    }),
  );
}
