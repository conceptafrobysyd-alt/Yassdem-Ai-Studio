import { NextResponse } from 'next/server';
import { api } from '@/lib/http';
import { getComfyUIStatus } from '@/lib/providers/comfyui';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return api(request, async () => NextResponse.json(await getComfyUIStatus()));
}
