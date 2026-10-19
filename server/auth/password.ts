import "server-only";
import { hash, verify, type Options } from "@node-rs/argon2";

/**
 * Argon2id with the OWASP Password Storage Cheat Sheet baseline (m=19 MiB, t=2, p=1).
 * Parameters are encoded in each hash, so they can be raised later without breaking
 * existing hashes.
 */
const ARGON2ID_OPTIONS: Options = {
  algorithm: 2, // Algorithm.Argon2id (const enum, inlined for isolatedModules)
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2ID_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    // Malformed or non-Argon2 hash: treat as a mismatch rather than surfacing details.
    return false;
  }
}
