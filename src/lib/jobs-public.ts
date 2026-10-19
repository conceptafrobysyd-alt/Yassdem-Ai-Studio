import type { Job } from '@prisma/client';
export function publicJob(job: Job) {
  let parameters: unknown = {};
  try {
    parameters = JSON.parse(job.parameters);
  } catch {
    /* Keep old history readable. */
  }
  return { ...job, parameters };
}
