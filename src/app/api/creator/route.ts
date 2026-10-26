import { NextResponse } from 'next/server';
import { api, readJson } from '@/lib/http';
import {
  createCreatorDocument,
  creatorCapabilities,
  listCreatorDocuments,
} from '@/lib/creator';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return api(request, async () => {
    const [projects, capabilities] = await Promise.all([
      listCreatorDocuments(),
      creatorCapabilities(),
    ]);
    return NextResponse.json({ projects, capabilities });
  });
}
export async function POST(request: Request) {
  return api(request, async () =>
    NextResponse.json(await createCreatorDocument(await readJson(request)), {
      status: 201,
    }),
  );
}
