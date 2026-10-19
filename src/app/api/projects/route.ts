import { NextResponse } from 'next/server';
import { api, readJson } from '@/lib/http';
import { createProject, listProjects } from '@/lib/projects';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  return api(request, async () =>
    NextResponse.json({ projects: await listProjects() }),
  );
}
export async function POST(request: Request) {
  return api(request, async () =>
    NextResponse.json(
      { project: await createProject(await readJson(request)) },
      { status: 201 },
    ),
  );
}
