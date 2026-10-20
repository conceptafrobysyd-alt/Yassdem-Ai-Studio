import { NextResponse } from 'next/server';
import { api, readJson } from '@/lib/http';
import { saveProductState } from '@/lib/product-state';
export const runtime = 'nodejs';
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(request, async () =>
    NextResponse.json({
      project: await saveProductState(
        (await context.params).id,
        await readJson(request),
      ),
    }),
  );
}
