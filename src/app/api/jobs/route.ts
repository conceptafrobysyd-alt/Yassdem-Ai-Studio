import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { api, readJson } from '@/lib/http';
import { enqueueJob } from '@/lib/jobs';
import { publicJob } from '@/lib/jobs-public';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  return api(request, async () =>
    NextResponse.json({
      jobs: (await db.job.findMany({ orderBy: { createdAt: 'desc' } })).map(
        publicJob,
      ),
    }),
  );
}
export async function POST(request: Request) {
  return api(request, async () => {
    const input = await readJson(request);
    const job = await enqueueJob(
      input as unknown as Parameters<typeof enqueueJob>[0],
    );
    return NextResponse.json({ job: publicJob(job) }, { status: 201 });
  });
}
