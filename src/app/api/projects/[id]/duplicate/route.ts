import { NextResponse } from 'next/server';
import { api } from '@/lib/http';
import { duplicateProject } from '@/lib/projects';
export const runtime = 'nodejs';
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(request, async () =>
    NextResponse.json(
      { project: await duplicateProject((await context.params).id) },
      { status: 201 },
    ),
  );
}
