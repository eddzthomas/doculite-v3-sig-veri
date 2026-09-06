/**
 * Doculite worker entry point. M0 scaffold only — the real worker process
 * (Redis-backed job transport, retries, idempotency) is implemented in M1
 * per docs/delivery/roadmap.md Phase 1.
 */
export interface WorkerInfo {
  name: 'doculite-worker'
  version: string
}

export const workerInfo: WorkerInfo = {
  name: 'doculite-worker',
  version: '0.0.0',
}
