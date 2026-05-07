import { CRAWLER_HEADERS, CRAWLER_USER_AGENT } from "./userAgent";
import { awaitDomainSlot } from "./rateLimiter";

/**
 * Minimal robots.txt parser + cache. We support User-agent + Disallow rules
 * matching either our specific UA or the wildcard. Sitemap and Allow are
 * intentionally ignored — we only ever read public pages, no aggressive
 * traversal, so the simple "is this path Disallowed for me?" check is enough.
 */

type RobotsRule = { allowAll: boolean; disallowed: string[] };
type CacheEntry = { rule: RobotsRule; fetchedAt: number };

const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 60 * 60 * 1000; // 1h

export async function isAllowed(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const host = parsed.host;
  const cached = CACHE.get(host);
  let rule: RobotsRule;
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    rule = cached.rule;
  } else {
    rule = await loadRobots(parsed.origin);
    CACHE.set(host, { rule, fetchedAt: Date.now() });
  }
  if (rule.allowAll) return true;
  const path = parsed.pathname || "/";
  for (const dis of rule.disallowed) {
    if (!dis) continue;
    if (path === dis || path.startsWith(dis)) return false;
  }
  return true;
}

async function loadRobots(origin: string): Promise<RobotsRule> {
  const url = `${origin}/robots.txt`;
  try {
    await awaitDomainSlot(new URL(url).host);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { headers: CRAWLER_HEADERS, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      // No robots.txt or 4xx — treat as allow.
      return { allowAll: true, disallowed: [] };
    }
    const text = await res.text();
    return parseRobots(text);
  } catch {
    // Network error: be conservative and allow (this is not crawler-aggressive).
    return { allowAll: true, disallowed: [] };
  }
}

function parseRobots(text: string): RobotsRule {
  const lines = text.split(/\r?\n/);
  const ourUA = CRAWLER_USER_AGENT.split("/")[0]?.toLowerCase() ?? "product2leadai-researcher";

  type Group = { agents: string[]; disallow: string[] };
  const groups: Group[] = [];
  let current: Group | null = null;

  for (const raw of lines) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const directive = m[1].toLowerCase();
    const value = m[2].trim();

    if (directive === "user-agent") {
      if (!current || current.disallow.length > 0) {
        current = { agents: [value.toLowerCase()], disallow: [] };
        groups.push(current);
      } else {
        current.agents.push(value.toLowerCase());
      }
    } else if (directive === "disallow" && current) {
      current.disallow.push(value);
    }
  }

  // Pick the group that targets our UA most specifically; otherwise the wildcard.
  let chosen: Group | undefined = groups.find((g) =>
    g.agents.some((a) => a === ourUA || ourUA.includes(a)),
  );
  if (!chosen) chosen = groups.find((g) => g.agents.includes("*"));
  if (!chosen) return { allowAll: true, disallowed: [] };

  if (chosen.disallow.length === 0 || chosen.disallow.every((d) => d === "")) {
    return { allowAll: true, disallowed: [] };
  }
  return { allowAll: false, disallowed: chosen.disallow };
}
