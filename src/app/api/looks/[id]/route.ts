import { NextResponse } from 'next/server';
import { api, readJson } from '@/lib/http';
import { deleteLook, getLook, updateLook } from '@/lib/fashion';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return api(request, async () =>
    NextResponse.json({ look: await getLook((await context.params).id) }),
  );
}
export async function PATCH(request: Request, context: Context) {
  return api(request, async () =>
    NextResponse.json({
      look: await updateLook(
        (await context.params).id,
        await readJson(request),
      ),
    }),
  );
}
export async function DELETE(request: Request, context: Context) {
  return api(request, async () => {
    await deleteLook((await context.params).id);
    return NextResponse.json({ ok: true });
  });
}
