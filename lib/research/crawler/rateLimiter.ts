/**
 * Per-domain rate limiter. Ensures we never hit the same host more than
 * once every N milliseconds. In-memory only — fine for single-process
 * dev/server. For multi-instance deployments this would move to Redis.
 */
const lastHit = new Map<string, number>();

export const PER_DOMAIN_GAP_MS = 1100;        // ~1 request per second per host
export const GLOBAL_GAP_MS = 80;              // soft cap across all hosts
let lastGlobal = 0;

export async function awaitDomainSlot(host: string, gapMs = PER_DOMAIN_GAP_MS) {
  // Global pacing first — never burst across hosts.
  const sinceGlobal = Date.now() - lastGlobal;
  if (sinceGlobal < GLOBAL_GAP_MS) {
    await sleep(GLOBAL_GAP_MS - sinceGlobal);
  }
  lastGlobal = Date.now();

  const last = lastHit.get(host) ?? 0;
  const wait = gapMs - (Date.now() - last);
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
