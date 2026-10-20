import { NextResponse } from 'next/server';
import { api, readJson } from '@/lib/http';
import { enqueueEditorJob } from '@/lib/editor-jobs';
import { publicJob } from '@/lib/jobs-public';
export const runtime = 'nodejs';
type Context = { params: Promise<{ projectId: string }> };
export async function POST(request: Request, context: Context) {
  return api(request, async () =>
    NextResponse.json(
      {
        job: publicJob(
          await enqueueEditorJob(
            (await context.params).projectId,
            await readJson(request),
          ),
        ),
      },
      { status: 201 },
    ),
  );
}
