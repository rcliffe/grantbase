import type { ZodType } from "zod";
import { emailSchema, nameSchema, newPasswordSchema } from "@/lib/validation";
import { askUntilValid, type Prompter } from "./prompt";

function fromZod<T>(schema: ZodType<T>) {
  return (raw: string) => {
    const parsed = schema.safeParse(raw);
    return parsed.success
      ? ({ ok: true, value: parsed.data } as const)
      : ({ ok: false, message: parsed.error.issues[0]?.message ?? "Invalid value." } as const);
  };
}

export function askName(p: Prompter): Promise<string> {
  return askUntilValid(() => p.ask("Full name: "), fromZod(nameSchema));
}

export function askEmail(p: Prompter): Promise<string> {
  return askUntilValid(() => p.ask("Email address: "), fromZod(emailSchema));
}

/** Asks for a new password twice (hidden) and validates it against the password policy. */
export async function askNewPassword(p: Prompter): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const password = await askUntilValid(() => p.askHidden("New password: "), fromZod(newPasswordSchema));
    const confirmation = await p.askHidden("Confirm password: ");
    if (password === confirmation) return password;
    console.error("  Passwords do not match. Try again.");
    if (!process.stdin.isTTY) break;
  }
  throw new Error("Passwords did not match.");
}
