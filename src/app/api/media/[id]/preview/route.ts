import { api, readJson } from '@/lib/http';
import { previewImage } from '@/lib/image-export';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  return api(request, async () => {
    const preview = await previewImage(
      (await context.params).id,
      await readJson(request),
    );
    return new Response(new Uint8Array(preview.bytes), {
      headers: {
        'Content-Type': preview.mimeType,
        'Content-Length': String(preview.bytes.length),
        'X-Yassdem-Image-Preview': JSON.stringify(preview.metadata),
      },
    });
  });
}
