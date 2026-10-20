import { NextResponse } from 'next/server';
import { api } from '@/lib/http';
import { getAuthSettings } from '@/lib/auth';
import { getProviderCatalog } from '@/lib/provider-catalog';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  return api(request, async () => {
    const settings = await getAuthSettings();
    return NextResponse.json(
      await getProviderCatalog({ usdToEur: settings.usdToEur }),
    );
  });
}
