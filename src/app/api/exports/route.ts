import { NextResponse } from 'next/server';
import { api, readJson, boundedString } from '@/lib/http';
import { enqueueJob } from '@/lib/jobs';
import { publicJob } from '@/lib/jobs-public';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return api(request, async () => {
    const input = await readJson(request);
    const sourceMediaId = boundedString(
      input.inputVideoId,
      'inputVideoId',
      100,
    );
    const job = await enqueueJob({
      ...input,
      kind: 'export',
      provider: 'local',
      sourceMediaId,
    } as unknown as Parameters<typeof enqueueJob>[0]);
    return NextResponse.json({ job: publicJob(job) }, { status: 201 });
  });
}
