/**
 * Which render job a run is currently waiting on.
 *
 * A step row is only written once run() returns, and a reel takes minutes — so without this
 * the run page has nothing to show between "Tiếp tục" and the finished MP4. In-memory, like
 * videoJobs.ts itself: one long-running Next server, and a lost job id after a restart is
 * recoverable by re-running the step.
 */
const jobs = new Map<string, string>();

export function setRunJob(runId: string, jobId: string): void {
  jobs.set(runId, jobId);
}

export function runJob(runId: string): string | undefined {
  return jobs.get(runId);
}
