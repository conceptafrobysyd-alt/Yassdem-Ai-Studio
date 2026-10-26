import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { api, ApiError } from '@/lib/http';
import { deleteMedia, resolveMediaPath } from '@/lib/media';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return api(request, async () => {
    const { id } = await context.params;
    const media = await db.media.findUnique({ where: { id } });
    if (!media) throw new ApiError(404, 'MEDIA_NOT_FOUND');
    const filePath = resolveMediaPath(media.path);
    const info = await stat(filePath).catch(() => null);
    if (!info) throw new ApiError(404, 'MEDIA_FILE_MISSING');
    const headers = new Headers({
      'Content-Type': media.mimeType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'Accept-Ranges': 'bytes',
      'Content-Disposition':
        media.mimeType === 'application/x-subrip'
          ? `attachment; filename="${media.id}.srt"`
          : `inline; filename="${media.id}.${media.mimeType === 'video/mp4' ? 'mp4' : media.mimeType.split('/')[1]}"`,
    });
    if (info.size === 0) {
      const ranged = request.headers.has('range');
      headers.set('Content-Length', '0');
      if (ranged) headers.set('Content-Range', 'bytes */0');
      return new Response(null, { status: ranged ? 416 : 200, headers });
    }
    let start = 0;
    let end = info.size - 1;
    let status = 200;
    const range = request.headers.get('range');
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2]))
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${info.size}` },
        });
      if (!match[1]) start = Math.max(0, info.size - Number(match[2]));
      else {
        start = Number(match[1]);
        if (match[2]) end = Math.min(end, Number(match[2]));
      }
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= info.size
      )
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${info.size}` },
        });
      headers.set('Content-Range', `bytes ${start}-${end}/${info.size}`);
      status = 206;
    }
    headers.set('Content-Length', String(end - start + 1));
    return new Response(
      Readable.toWeb(
        createReadStream(filePath, { start, end }),
      ) as ReadableStream,
      { headers, status },
    );
  });
}
export async function DELETE(request: Request, context: Context) {
  return api(request, async () => {
    await deleteMedia((await context.params).id);
    return NextResponse.json({ ok: true });
  });
}
