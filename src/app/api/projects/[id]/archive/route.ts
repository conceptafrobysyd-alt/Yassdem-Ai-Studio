import { api } from '@/lib/http';
import { archiveProject } from '@/lib/projects';
export const runtime = 'nodejs';
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(request, async () => archiveProject((await context.params).id));
}
