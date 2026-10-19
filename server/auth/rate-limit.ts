import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/server/db/client";

export type RateLimitRule = {
  /** Maximum attempts allowed within the window. */
  limit: number;
  windowSeconds: number;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

/** Buckets are hashed so the table never holds raw emails or IP addresses. */
function bucketKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Records one attempt against `key` and reports whether it is within the limit.
 *
 * Fixed-window counter stored in MariaDB, so the limit holds across any number of
 * app instances. The upsert is a single atomic statement and all time comparisons
 * use the database clock, so instance clock skew doesn't matter.
 */
export async function consumeRateLimit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
  const hashed = bucketKey(key);
  const prisma = db();

  // `count` is assigned before `resetAt`, so both IF()s see the pre-update resetAt.
  await prisma.$executeRaw`
    INSERT INTO rate_limits (\`key\`, count, resetAt)
    VALUES (${hashed}, 1, NOW(3) + INTERVAL ${rule.windowSeconds} SECOND)
    ON DUPLICATE KEY UPDATE
      count = IF(resetAt <= NOW(3), 1, count + 1),
      resetAt = IF(resetAt <= NOW(3), NOW(3) + INTERVAL ${rule.windowSeconds} SECOND, resetAt)`;

  const rows = await prisma.$queryRaw<{ count: number | bigint; retryAfter: number | bigint }[]>`
    SELECT count, GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(3), resetAt)) AS retryAfter
    FROM rate_limits WHERE \`key\` = ${hashed}`;

  const count = Number(rows[0]?.count ?? 0);
  const retryAfterSeconds = Number(rows[0]?.retryAfter ?? 0);
  return { allowed: count <= rule.limit, retryAfterSeconds: count <= rule.limit ? 0 : retryAfterSeconds };
}

export async function resetRateLimit(key: string): Promise<void> {
  await db().rateLimit.deleteMany({ where: { key: bucketKey(key) } });
}

/** Removes rate-limit rows whose window ended more than a day ago. */
export async function pruneRateLimits(): Promise<void> {
  await db().$executeRaw`DELETE FROM rate_limits WHERE resetAt < NOW(3) - INTERVAL 1 DAY`;
}

/**
 * Best-effort client IP for rate limiting.
 *
 * With N trusted proxies, each appends the address it received the request from, so
 * the real client is the Nth entry from the right; anything further left is
 * client-controlled. With 0 (direct exposure, e.g. development) the header can be
 * spoofed, which is why sign-in is also limited per email address.
 */
export function clientIp(headers: Headers, trustedProxyCount: number): string {
  const chain = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (chain.length === 0) return "unknown";
  if (trustedProxyCount === 0) return chain[0];
  return chain[Math.max(0, chain.length - trustedProxyCount)];
}
