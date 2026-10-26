import { api, ApiError } from '@/lib/http';
import {
  creatorDraftSrt,
  creatorPublication,
  getCreatorDocument,
} from '@/lib/creator';
export const runtime = 'nodejs';
type Context = { params: Promise<{ projectId: string }> };
export async function GET(request: Request, context: Context) {
  return api(request, async () => {
    const format = new URL(request.url).searchParams.get('format') ?? 'json';
    if (!['json', 'srt', 'publication'].includes(format))
      throw new ApiError(400, 'CREATOR_INVALID_EXPORT');
    const { document } = await getCreatorDocument(
      (await context.params).projectId,
    );
    const content =
      format === 'json'
        ? JSON.stringify(document, null, 2)
        : format === 'srt'
          ? creatorDraftSrt(document)
          : creatorPublication(document);
    const name =
      format === 'srt'
        ? 'sous-titres-brouillon.srt'
        : format === 'json'
          ? 'scenario.json'
          : 'publication.txt';
    return new Response(content, {
      headers: {
        'Content-Type':
          format === 'json'
            ? 'application/json; charset=utf-8'
            : 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${name}"`,
      },
    });
  });
}
