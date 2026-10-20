import { NextResponse } from 'next/server';
import { api, readJson } from '@/lib/http';
import {
  deleteBrandPreset,
  getBrandPreset,
  updateBrandPreset,
} from '@/lib/brand-presets';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return api(request, async () =>
    NextResponse.json({
      preset: await getBrandPreset((await context.params).id),
    }),
  );
}
export async function PATCH(request: Request, context: Context) {
  return api(request, async () =>
    NextResponse.json({
      preset: await updateBrandPreset(
        (await context.params).id,
        await readJson(request),
      ),
    }),
  );
}
export async function DELETE(request: Request, context: Context) {
  return api(request, async () => {
    await deleteBrandPreset((await context.params).id);
    return NextResponse.json({ ok: true });
  });
}
