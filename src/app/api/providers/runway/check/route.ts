import { NextResponse } from 'next/server';
import { api, ApiError } from '@/lib/http';
import { RunwayProvider } from '@/lib/providers/runway';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return api(request, async () => {
    const result = await new RunwayProvider().checkConnection();
    if (!result.ok)
      throw new ApiError(502, result.code || 'RUNWAY_REQUEST_FAILED');
    return NextResponse.json({ ok: true });
  });
}
