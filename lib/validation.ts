import { z } from "zod";
import { normaliseEmail } from "./email";
import { ROLES } from "./roles";

export const PASSWORD_MIN_LENGTH = 12;
/** Upper bound protects the server from hashing arbitrarily large inputs. */
export const PASSWORD_MAX_LENGTH = 128;

export const emailSchema = z
  .string({ error: "Enter an email address." })
  .trim()
  .min(1, "Enter an email address.")
  .max(320, "Email address is too long.")
  .pipe(z.email("Enter a valid email address."))
  .transform(normaliseEmail);

export const newPasswordSchema = z
  .string({ error: "Enter a password." })
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters.`);

export const nameSchema = z
  .string({ error: "Enter a name." })
  .trim()
  .min(1, "Enter a name.")
  .max(200, "Name is too long.");

export const roleSchema = z.enum(ROLES, { error: "Choose a role." });

export const signInSchema = z.object({
  email: emailSchema,
  // No strength rules at sign-in: just bound the size before hashing.
  password: z.string().min(1, "Enter your password.").max(PASSWORD_MAX_LENGTH, "Invalid password."),
});

export const createUserSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    role: roleSchema,
    password: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(PASSWORD_MAX_LENGTH),
    newPassword: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ["newPassword"],
    message: "Choose a password different from your current one.",
  });

export const userIdSchema = z.string().min(1).max(36);

/** Field-level errors keyed by input name, suitable for rendering next to inputs. */
export type FieldErrors = Partial<Record<string, string>>;

export function fieldErrorsFrom(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
