/**
 * Administrator password reset (no email delivery yet).
 *
 *   npm run admin:reset-password
 *   npm run admin:reset-password -- user@example.com
 *
 * Sets a new password and revokes every session the user has. The password is read
 * without echo and never printed or logged.
 */
import "dotenv/config";
import { emailSchema } from "@/lib/validation";
import { db } from "@/server/db/client";
import { countActiveSessions, findUserByEmail, resetUserPassword } from "@/server/users/service";
import { Prompter } from "./lib/prompt";
import { askEmail, askNewPassword } from "./lib/questions";

async function main(): Promise<number> {
  const p = new Prompter();
  try {
    console.log("Reset a user's password\n");

    const arg = process.argv[2];
    let email: string;
    if (arg) {
      const parsed = emailSchema.safeParse(arg);
      if (!parsed.success) {
        console.error(parsed.error.issues[0]?.message ?? "Invalid email address.");
        return 1;
      }
      email = parsed.data;
    } else {
      email = await askEmail(p);
    }

    const user = await findUserByEmail(email);
    if (!user) {
      console.error(`No user found with the email ${email}.`);
      return 1;
    }
    console.log(`User: ${user.name} <${user.email}>${user.active ? "" : " (deactivated)"}`);

    const password = await askNewPassword(p);
    const sessions = await countActiveSessions(user.id);
    await resetUserPassword(user.id, password);

    console.log(`\nPassword updated. ${sessions} active session${sessions === 1 ? "" : "s"} revoked.`);
    if (!user.active) console.log("Note: the account is still deactivated. Reactivate it in User management.");
    return 0;
  } finally {
    p.close();
    await db().$disconnect();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(`Failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  },
);
