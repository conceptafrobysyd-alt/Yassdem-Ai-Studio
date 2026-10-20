import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { api, ApiError } from '@/lib/http';
import { cancelJob } from '@/lib/jobs';
import { cancelReplicateJob } from '@/lib/replicate-jobs';
import { publicJob } from '@/lib/jobs-public';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return api(request, async () => {
    const job = await db.job.findUnique({
      where: { id: (await context.params).id },
    });
    if (!job) throw new ApiError(404, 'JOB_NOT_FOUND');
    return NextResponse.json({ job: publicJob(job) });
  });
}
export async function DELETE(request: Request, context: Context) {
  return api(request, async () => {
    const id = (await context.params).id;
    const current = await db.job.findUnique({ where: { id } });
    if (!current) throw new ApiError(404, 'JOB_NOT_FOUND');
    const job =
      current.provider === 'replicate'
        ? await cancelReplicateJob(id)
        : await cancelJob(id);
    return NextResponse.json({ job: publicJob(job) });
  });
}
