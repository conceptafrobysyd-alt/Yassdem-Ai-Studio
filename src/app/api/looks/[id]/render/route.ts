import { NextResponse } from 'next/server';
import { api, ApiError, readJson } from '@/lib/http';
import { enqueueFashionJob } from '@/lib/fashion-jobs';
import { publicJob } from '@/lib/jobs-public';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  return api(request, async () => {
    const input = await readJson(request);
    if (
      Object.keys(input).some(
        (key) => !['mode', 'idempotencyKey'].includes(key),
      ) ||
      !['collage', 'fashion-image', 'try-on'].includes(input.mode as string)
    )
      throw new ApiError(400, 'INVALID_FASHION_MODE');
    const job = await enqueueFashionJob({
      lookId: (await context.params).id,
      mode: input.mode as 'collage' | 'fashion-image' | 'try-on',
      idempotencyKey: input.idempotencyKey as string,
    });
    return NextResponse.json({ job: publicJob(job) }, { status: 202 });
  });
}
