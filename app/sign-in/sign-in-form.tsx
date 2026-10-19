"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { InputField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { signInAction, type SignInState } from "./actions";

export function SignInForm() {
  const [state, formAction] = useActionState<SignInState, FormData>(signInAction, {});
  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <InputField
        name="email"
        label="Email address"
        type="email"
        autoComplete="username"
        required
        defaultValue={state.email}
        // Remount after each attempt so defaultValue applies.
        key={`email-${state.email ?? ""}`}
      />
      <InputField name="password" label="Password" type="password" autoComplete="current-password" required />
      <SubmitButton className="w-full" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
