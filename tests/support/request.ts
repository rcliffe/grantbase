/** The simulated incoming request seen by mocked `next/headers` in tests. */
export const request = {
  headers: new Headers(),
  cookies(): Map<string, string> {
    const jar = new Map<string, string>();
    for (const pair of (this.headers.get("cookie") ?? "").split(";")) {
      const [name, ...rest] = pair.trim().split("=");
      if (name) jar.set(name, rest.join("="));
    }
    return jar;
  },
};

/** Builds request headers carrying `cookie` (may be empty) from client IP `ip`. */
export function requestHeaders(cookie = "", ip = "203.0.113.10"): Headers {
  const h = new Headers({ "x-forwarded-for": ip, "user-agent": "vitest" });
  if (cookie) h.set("cookie", cookie);
  return h;
}

/** Makes subsequent app code (guards, Server Actions) see this cookie. */
export function actAs(cookie: string | null, ip?: string): void {
  request.headers = requestHeaders(cookie ?? "", ip);
}
