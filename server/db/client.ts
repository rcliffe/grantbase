import "server-only";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/server/env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Shared Prisma client. Created on first use (not at import) so builds don't need a
 * database, and cached on globalThis so dev hot-reloads don't exhaust connections.
 */
export function db(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const adapter = new PrismaMariaDb(env().DATABASE_URL);
    globalForPrisma.prisma = new PrismaClient({
      adapter,
      // Queries are never logged: parameters can include hashes and session tokens.
      log: ["warn", "error"],
    });
  }
  return globalForPrisma.prisma;
}
