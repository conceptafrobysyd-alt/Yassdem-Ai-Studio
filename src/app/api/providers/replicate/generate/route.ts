import { NextResponse } from 'next/server';
import { api, readJson } from '@/lib/http';
import { publicJob } from '@/lib/jobs-public';
import { enqueueReplicateJob } from '@/lib/replicate-jobs';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  return api(request, async () => {
    const input = await readJson(request);
    const job = await enqueueReplicateJob(
      input as unknown as Parameters<typeof enqueueReplicateJob>[0],
    );
    return NextResponse.json({ job: publicJob(job) }, { status: 201 });
  });
}
