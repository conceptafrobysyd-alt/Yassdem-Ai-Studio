import { api, ApiError } from '@/lib/http';
import { getSeoDocument, seoToCsv } from '@/lib/seo';
export const runtime = 'nodejs';
export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  return api(request, async () => {
    const id = (await context.params).projectId;
    const document = await getSeoDocument(id);
    if (!document) throw new ApiError(404, 'SEO_NOT_FOUND');
    const format = new URL(request.url).searchParams.get('format') ?? 'json';
    if (!['json', 'csv'].includes(format))
      throw new ApiError(400, 'SEO_INVALID_FORMAT');
    return new Response(
      format === 'csv' ? seoToCsv(document) : JSON.stringify(document, null, 2),
      {
        headers: {
          'Content-Type':
            format === 'csv'
              ? 'text/csv; charset=utf-8'
              : 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="yassdem-seo-${id.replace(/[^a-zA-Z0-9_-]/g, '')}.${format}"`,
        },
      },
    );
  });
}
