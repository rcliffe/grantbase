import { describe, expect, it } from "vitest";
import { normaliseEmail } from "@/lib/email";
import { navForRole } from "@/lib/navigation";
import { hasRole } from "@/lib/roles";
import { clientIp } from "@/server/auth/rate-limit";

describe("email normalisation", () => {
  it("trims, NFC-normalises and lower-cases", () => {
    expect(normaliseEmail("  Ada.Lovelace@Example.COM ")).toBe("ada.lovelace@example.com");
    // "é" as e + combining acute (NFD) equals the precomposed form after normalisation.
    expect(normaliseEmail("José@example.com")).toBe(normaliseEmail("JOSÉ@example.com"));
  });

  it("keeps provider-specific characters", () => {
    expect(normaliseEmail("first.last+tag@example.com")).toBe("first.last+tag@example.com");
  });
});

describe("role hierarchy", () => {
  it("ranks Administrator > Editor > Viewer", () => {
    expect(hasRole("ADMINISTRATOR", "EDITOR")).toBe(true);
    expect(hasRole("EDITOR", "VIEWER")).toBe(true);
    expect(hasRole("EDITOR", "ADMINISTRATOR")).toBe(false);
    expect(hasRole("VIEWER", "EDITOR")).toBe(false);
  });

  it("hides administration links from non-administrators (cosmetic only)", () => {
    const hrefs = (role: Parameters<typeof navForRole>[0]) => navForRole(role).flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs("VIEWER")).not.toContain("/admin/users");
    expect(hrefs("EDITOR")).not.toContain("/admin/users");
    expect(hrefs("ADMINISTRATOR")).toContain("/admin/users");
  });
});

describe("client IP for rate limiting", () => {
  const h = (xff?: string) => new Headers(xff ? { "x-forwarded-for": xff } : {});

  it("uses the entry appended by the outermost trusted proxy", () => {
    // Client spoofed "1.1.1.1"; the trusted proxy appended the real address.
    expect(clientIp(h("1.1.1.1, 203.0.113.7"), 1)).toBe("203.0.113.7");
    expect(clientIp(h("1.1.1.1, 203.0.113.7, 10.0.0.2"), 2)).toBe("203.0.113.7");
  });

  it("falls back sensibly", () => {
    expect(clientIp(h("203.0.113.7"), 0)).toBe("203.0.113.7");
    expect(clientIp(h(), 1)).toBe("unknown");
    expect(clientIp(h("203.0.113.7"), 3)).toBe("203.0.113.7");
  });
});
