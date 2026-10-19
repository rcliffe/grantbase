import { vi } from "vitest";
import { loadTestEnv } from "./test-env";
import { request } from "./request";

loadTestEnv();

// Stand-ins for the Next.js request APIs used by app code (not by Better Auth, which
// is loaded natively and falls back gracefully outside a Next.js request).
vi.mock("next/headers", () => ({
  headers: async () => request.headers,
  cookies: async () => ({
    get: (name: string) => {
      const value = request.cookies().get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: () => {},
    delete: () => {},
  }),
}));

vi.mock("next/cache", () => ({
  refresh: vi.fn(),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));
