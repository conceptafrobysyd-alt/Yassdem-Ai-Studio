import { NextResponse } from 'next/server';
import { api, readJson } from '@/lib/http';
import {
  deleteStylePreset,
  getStylePreset,
  updateStylePreset,
} from '@/lib/style-presets';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return api(request, async () =>
    NextResponse.json({
      preset: await getStylePreset((await context.params).id),
    }),
  );
}
export async function PATCH(request: Request, context: Context) {
  return api(request, async () =>
    NextResponse.json({
      preset: await updateStylePreset(
        (await context.params).id,
        await readJson(request),
      ),
    }),
  );
}
export async function DELETE(request: Request, context: Context) {
  return api(request, async () => {
    await deleteStylePreset((await context.params).id);
    return NextResponse.json({ ok: true });
  });
}
