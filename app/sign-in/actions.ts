"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signInSchema } from "@/lib/validation";
import { signInWithPassword } from "@/server/auth/service";

export type SignInState = {
  error?: string;
  /** Echoed back so the field stays filled. The password never is. */
  email?: string;
};

const GENERIC_ERROR = "The email address or password is incorrect.";

export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "");
  const parsed = signInSchema.safeParse({ email, password: formData.get("password") });
  if (!parsed.success) {
    // Format problems only; says nothing about whether an account exists.
    return { error: "Enter a valid email address and your password.", email };
  }

  const result = await signInWithPassword(parsed.data, await headers());
  if (!result.ok) {
    if (result.reason === "rate_limited") {
      const minutes = Math.max(1, Math.ceil(result.retryAfterSeconds / 60));
      return {
        error: `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        email,
      };
    }
    return { error: GENERIC_ERROR, email };
  }

  redirect("/dashboard");
}
