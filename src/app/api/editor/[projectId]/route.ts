import { NextResponse } from 'next/server';
import { api, readJson } from '@/lib/http';
import { getEditorTimeline, saveEditorTimeline } from '@/lib/editor-jobs';
export const runtime = 'nodejs';
type Context = { params: Promise<{ projectId: string }> };
export async function GET(request: Request, context: Context) {
  return api(request, async () =>
    NextResponse.json({
      timeline: await getEditorTimeline((await context.params).projectId),
    }),
  );
}
export async function PUT(request: Request, context: Context) {
  return api(request, async () => {
    const input = await readJson(request);
    return NextResponse.json({
      timeline: await saveEditorTimeline(
        (await context.params).projectId,
        input.timeline,
      ),
    });
  });
}
