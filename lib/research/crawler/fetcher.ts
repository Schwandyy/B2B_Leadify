import { CRAWLER_HEADERS } from "./userAgent";
import { awaitDomainSlot } from "./rateLimiter";
import { isAllowed } from "./robots";

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_BYTES = 1_500_000;

export type FetchOk = { ok: true; status: number; html: string; finalUrl: string };
export type FetchFail = { ok: false; reason: string; status?: number };
export type FetchOutcome = FetchOk | FetchFail;

export async function politeGet(url: string, opts: { skipRobots?: boolean; timeoutMs?: number } = {}): Promise<FetchOutcome> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "invalid-url" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "non-http" };
  }
  if (isPrivateHost(parsed.hostname)) {
    return { ok: false, reason: "private-host" };
  }

  if (!opts.skipRobots) {
    const allowed = await isAllowed(url);
    if (!allowed) return { ok: false, reason: "robots-disallowed" };
  }

  await awaitDomainSlot(parsed.host);

  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, { headers: CRAWLER_HEADERS, redirect: "follow", signal: controller.signal });
    if (!res.ok) {
      return { ok: false, reason: `http-${res.status}`, status: res.status };
    }
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!ct.includes("html") && !ct.includes("xml") && !ct.includes("text/plain")) {
      return { ok: false, reason: `non-html-${ct}`, status: res.status };
    }
    const html = await readLimited(res, MAX_BYTES);
    return { ok: true, status: res.status, html, finalUrl: res.url };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "fetch-failed" };
  } finally {
    clearTimeout(timer);
  }
}

function isPrivateHost(host: string): boolean {
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".local")) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  if (host === "0.0.0.0" || host === "::1") return true;
  return false;
}

async function readLimited(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return await res.text();
  const decoder = new TextDecoder("utf-8");
  let received = 0;
  let out = "";
  while (received < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    out += decoder.decode(value, { stream: true });
    if (received >= maxBytes) break;
  }
  out += decoder.decode();
  return out;
}
