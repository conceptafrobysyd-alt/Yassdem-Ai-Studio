import { NextResponse } from 'next/server';
import { api, readJson } from '@/lib/http';
import { deleteProject, getProject, updateProject } from '@/lib/projects';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return api(request, async () =>
    NextResponse.json({ project: await getProject((await context.params).id) }),
  );
}
export async function PATCH(request: Request, context: Context) {
  return api(request, async () =>
    NextResponse.json({
      project: await updateProject(
        (await context.params).id,
        await readJson(request),
      ),
    }),
  );
}
export async function DELETE(request: Request, context: Context) {
  return api(request, async () => {
    await deleteProject((await context.params).id);
    return NextResponse.json({ ok: true });
  });
}
