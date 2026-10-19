import { NextResponse } from 'next/server';
import { api, readJson } from '@/lib/http';
import { getSettings, updateSettings } from '@/lib/settings';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  return api(request, async () =>
    NextResponse.json({ settings: await getSettings() }),
  );
}
export async function PATCH(request: Request) {
  return api(request, async () =>
    NextResponse.json({
      settings: await updateSettings(await readJson(request)),
    }),
  );
}
