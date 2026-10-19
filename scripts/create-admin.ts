/**
 * Creates an administrator account interactively.
 *
 *   npm run admin:create
 *
 * Intended for bootstrapping the first administrator; creating further administrators
 * here requires explicit confirmation (normally they are created in the app).
 * The password is read without echo and never printed or logged.
 */
import "dotenv/config";
import { db } from "@/server/db/client";
import { countActiveAdministrators, createUser, findUserByEmail, UserManagementError } from "@/server/users/service";
import { Prompter } from "./lib/prompt";
import { askEmail, askName, askNewPassword } from "./lib/questions";

async function main(): Promise<number> {
  const p = new Prompter();
  try {
    console.log("Create an administrator account\n");

    const existingAdmins = await countActiveAdministrators();
    if (existingAdmins > 0) {
      console.log(`There ${existingAdmins === 1 ? "is already 1 active administrator" : `are already ${existingAdmins} active administrators`}.`);
      if (!(await p.confirm("Create another administrator anyway?"))) {
        console.log("Cancelled.");
        return 1;
      }
    }

    const name = await askName(p);
    const email = await askEmail(p);
    if (await findUserByEmail(email)) {
      console.error(`A user with the email ${email} already exists. Use npm run admin:reset-password to reset their password.`);
      return 1;
    }
    const password = await askNewPassword(p);

    const user = await createUser({ name, email, role: "ADMINISTRATOR", password });
    console.log(`\nAdministrator created: ${user.name} <${user.email}>`);
    return 0;
  } catch (error) {
    if (error instanceof UserManagementError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  } finally {
    p.close();
    await db().$disconnect();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    // Print only the message: stack traces from the DB driver can include connection details.
    console.error(`Failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  },
);
