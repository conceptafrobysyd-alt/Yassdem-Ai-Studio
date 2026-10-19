import { NextResponse } from 'next/server';
import { api, ApiError, readJson } from '@/lib/http';
import {
  checkLoginLimit,
  getAuthSettings,
  setSession,
  verifyPassword,
} from '@/lib/auth';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  return api(
    request,
    async () => {
      checkLoginLimit();
      const { password } = await readJson(request);
      const settings = await getAuthSettings();
      if (!settings.passwordHash) throw new ApiError(409, 'SETUP_REQUIRED');
      if (
        typeof password !== 'string' ||
        password.length > 256 ||
        !(await verifyPassword(password, settings.passwordHash))
      ) {
        throw new ApiError(
          401,
          'INVALID_CREDENTIALS',
          'Mot de passe incorrect.',
        );
      }
      const response = NextResponse.json({ ok: true });
      await setSession(response, request, settings.passwordHash);
      return response;
    },
    { public: true },
  );
}
