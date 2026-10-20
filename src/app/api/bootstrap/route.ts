import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { api } from '@/lib/http';
import { getAuthSettings, isAuthenticated } from '@/lib/auth';
import { publicSettings } from '@/lib/settings';
import { listProjects } from '@/lib/projects';
import { listMedia } from '@/lib/media';
import { publicJob } from '@/lib/jobs-public';
import { getBudget } from '@/lib/jobs';
import { getProviderRegistry } from '@/lib/providers/registry';
import {
  RunwayProvider,
  RUNWAY_MODEL,
  estimateRunwayCost,
} from '@/lib/providers/runway';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const exec = promisify(execFile);
let localCheck: Promise<boolean> | undefined;
function localAvailable() {
  localCheck ??= Promise.all([
    exec(process.env.FFMPEG_PATH || 'ffmpeg', ['-version'], {
      timeout: 3000,
      maxBuffer: 65536,
    }),
    exec(process.env.FFPROBE_PATH || 'ffprobe', ['-version'], {
      timeout: 3000,
      maxBuffer: 65536,
    }),
  ]).then(
    () => true,
    () => false,
  );
  return localCheck;
}
export async function GET(request: Request) {
  return api(
    request,
    async () => {
      const settings = await getAuthSettings();
      const authenticated = await isAuthenticated(
        request,
        settings.passwordHash,
      );
      if (!authenticated)
        return NextResponse.json({
          needsSetup: !settings.passwordHash,
          authenticated: false,
        });
      const [projects, media, jobs, budget, available, providerStatuses] =
        await Promise.all([
          listProjects(),
          listMedia(),
          db.job.findMany({ orderBy: { createdAt: 'desc' } }),
          getBudget(),
          localAvailable(),
          getProviderRegistry(),
        ]);
      return NextResponse.json({
        needsSetup: false,
        authenticated: true,
        settings: publicSettings(settings),
        projects,
        media,
        jobs: jobs.map(publicJob),
        budget,
        providers: {
          runway: {
            configured: new RunwayProvider().configured,
            enabled: settings.providerEnabled,
            models: [RUNWAY_MODEL],
            nativeResolutions: ['1280×720', '720×1280', '960×960'],
            costs: {
              '5': estimateRunwayCost(5, settings.usdToEur),
              '10': estimateRunwayCost(10, settings.usdToEur),
            },
          },
          local: { available, costCents: 0, ai: false },
          replicate: {
            ...providerStatuses.find((provider) => provider.id === 'replicate'),
            enabled: settings.replicateEnabled,
          },
        },
      });
    },
    { public: true },
  );
}
