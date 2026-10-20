import { NextResponse } from 'next/server';
import { api, readJson } from '@/lib/http';
import { createBrandPreset, listBrandPresets } from '@/lib/brand-presets';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  return api(request, async () =>
    NextResponse.json({ presets: await listBrandPresets() }),
  );
}
export async function POST(request: Request) {
  return api(request, async () =>
    NextResponse.json(
      { preset: await createBrandPreset(await readJson(request)) },
      { status: 201 },
    ),
  );
}
