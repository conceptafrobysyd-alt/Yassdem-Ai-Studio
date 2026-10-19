import { NextResponse } from 'next/server';
import { api, readJson } from '@/lib/http';
import { deleteMannequin, getMannequin, updateMannequin } from '@/lib/fashion';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return api(request, async () =>
    NextResponse.json({
      mannequin: await getMannequin((await context.params).id),
    }),
  );
}
export async function PATCH(request: Request, context: Context) {
  return api(request, async () =>
    NextResponse.json({
      mannequin: await updateMannequin(
        (await context.params).id,
        await readJson(request),
      ),
    }),
  );
}
export async function DELETE(request: Request, context: Context) {
  return api(request, async () => {
    await deleteMannequin((await context.params).id);
    return NextResponse.json({ ok: true });
  });
}
