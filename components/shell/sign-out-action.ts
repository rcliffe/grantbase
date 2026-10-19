"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signOutSession } from "@/server/auth/service";

/**
 * Deletes the current session row and clears the cookie. Requires no prior check:
 * signing out without a session is a no-op. Cross-site invocation is blocked by the
 * Server Action Origin check.
 */
export async function signOutAction(): Promise<void> {
  await signOutSession(await headers());
  redirect("/sign-in?signed-out=1");
}
