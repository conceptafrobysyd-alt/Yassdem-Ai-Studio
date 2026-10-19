import { NextResponse } from 'next/server';
import { api, readJson } from '@/lib/http';
import { createMannequin, listMannequins } from '@/lib/fashion';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  return api(request, async () =>
    NextResponse.json({ mannequins: await listMannequins() }),
  );
}
export async function POST(request: Request) {
  return api(request, async () =>
    NextResponse.json(
      { mannequin: await createMannequin(await readJson(request)) },
      { status: 201 },
    ),
  );
}
