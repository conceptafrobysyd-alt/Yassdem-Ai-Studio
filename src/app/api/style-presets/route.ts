import { NextResponse } from 'next/server';
import { api, readJson } from '@/lib/http';
import { createStylePreset, listStylePresets } from '@/lib/style-presets';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  return api(request, async () =>
    NextResponse.json({ presets: await listStylePresets() }),
  );
}
export async function POST(request: Request) {
  return api(request, async () =>
    NextResponse.json(
      { preset: await createStylePreset(await readJson(request)) },
      { status: 201 },
    ),
  );
}
