import { NextResponse } from 'next/server';
import { api } from '@/lib/http';
import { getProviderRegistry } from '@/lib/providers/registry';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  return api(request, async () =>
    NextResponse.json({
      providers: await getProviderRegistry({
        checkConnections:
          new URL(request.url).searchParams.get('check') === '1',
      }),
    }),
  );
}
