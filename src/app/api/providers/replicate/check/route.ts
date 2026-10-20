import { NextResponse } from 'next/server';
import { api, ApiError } from '@/lib/http';
import {
  readReplicateConfiguration,
  ReplicateProvider,
} from '@/lib/providers/replicate';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  return api(request, async () => {
    readReplicateConfiguration();
    const result = await new ReplicateProvider().checkConnection();
    if (!result.ok)
      throw new ApiError(502, result.code ?? 'REPLICATE_REQUEST_FAILED');
    return NextResponse.json({ ok: true });
  });
}
