import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { api, ApiError, readJson } from '@/lib/http';
import {
  getAuthSettings,
  hashPassword,
  setSession,
  validatePassword,
} from '@/lib/auth';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  return api(
    request,
    async () => {
      if (
        !['localhost', '127.0.0.1', '[::1]'].includes(
          // api() has already validated Origin against Host. NextRequest's URL
          // may describe the local listener even for a configured public origin.
          new URL(request.headers.get('origin') || request.url).hostname,
        )
      )
        throw new ApiError(
          403,
          'SETUP_LOCAL_ONLY',
          'Configurez le mot de passe en local avant le déploiement.',
        );
      const password = validatePassword((await readJson(request)).password);
      const settings = await getAuthSettings();
      if (settings.passwordHash) throw new ApiError(409, 'ALREADY_CONFIGURED');
      const passwordHash = await hashPassword(password);
      const result = await db.settings.updateMany({
        where: { id: 'default', passwordHash: null },
        data: { passwordHash },
      });
      if (result.count !== 1) throw new ApiError(409, 'ALREADY_CONFIGURED');
      const response = NextResponse.json({ ok: true });
      await setSession(response, request, passwordHash);
      return response;
    },
    { public: true },
  );
}
