import { SubmitButton } from "@/components/ui/submit-button";
import { signOutAction } from "./sign-out-action";

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <SubmitButton variant="secondary" size="sm" pendingLabel="Signing out…">
        Sign out
      </SubmitButton>
    </form>
  );
}
