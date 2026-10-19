import "server-only";
import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().regex(/^(mysql|mariadb):\/\//, "DATABASE_URL must be a mysql:// or mariadb:// URL"),
    BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
    BETTER_AUTH_URL: z.url("BETTER_AUTH_URL must be an absolute URL"),
    TRUSTED_PROXY_COUNT: z.coerce.number().int().min(0).max(10).default(0),
  })
  .superRefine((env, ctx) => {
    // http://localhost is allowed so a production build can be tried locally;
    // browsers treat localhost as a secure context and accept Secure cookies there.
    const { protocol, hostname } = new URL(env.BETTER_AUTH_URL);
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
    if (env.NODE_ENV === "production" && protocol !== "https:" && !isLocalhost) {
      ctx.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_URL"],
        message: "BETTER_AUTH_URL must use https:// in production",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Validated server environment. Evaluated lazily so `next build` can run without
 * runtime secrets. Error messages name the variable but never echo its value.
 */
export function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid server environment:\n${problems}`);
  }
  cached = parsed.data;
  return cached;
}
