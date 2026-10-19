import { z } from "zod";
import { emailSchema } from "./validation";
import type { Role } from "./roles";

/**
 * Minimum role for each charity operation. Pages and actions enforce these on the
 * server via requireRole(); the UI uses them only to decide which buttons to show.
 */
export const CHARITY_PERMISSIONS = {
  view: "VIEWER",
  edit: "EDITOR",
  delete: "ADMINISTRATOR",
} as const satisfies Record<string, Role>;

export const CHARITY_PAGE_SIZE = 25;

/** Optional free text: trimmed, length-limited, empty becomes null. */
function optionalText(max: number, label: string) {
  return z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters.`)
    .transform((v) => (v === "" ? null : v));
}

/**
 * Registration numbers are stored upper-case without spaces, so "sc 012345" and
 * "SC012345" are the same charity (and collide on the unique index).
 */
export function normaliseRegistrationNumber(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

const registrationNumberSchema = z
  .string()
  .transform(normaliseRegistrationNumber)
  .pipe(
    z.union([
      z.literal("").transform(() => null),
      z
        .string()
        .max(20, "Registration number must be at most 20 characters.")
        .regex(/^[A-Z0-9-]+$/, "Use letters, numbers and hyphens only."),
    ]),
  );

/**
 * Websites are stored as absolute http(s) URLs. A missing scheme defaults to https://.
 * Anything else (javascript:, data:, mailto: …) is rejected, which also makes the
 * value safe to render as a link.
 */
export function normaliseWebsite(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname.includes(".")) return null;
  const href = url.toString();
  // Drop the bare trailing slash URL adds to a domain-only address.
  return url.pathname === "/" && !url.search && !url.hash ? href.slice(0, -1) : href;
}

const websiteSchema = z
  .string()
  .trim()
  .max(500, "Website must be at most 500 characters.")
  .transform((value, ctx) => {
    if (value === "") return null;
    const normalised = normaliseWebsite(value);
    if (!normalised) {
      ctx.addIssue({ code: "custom", message: "Enter a valid website address, e.g. https://example.org." });
      return z.NEVER;
    }
    return normalised;
  });

const contactEmailSchema = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(emailSchema.nullable());

export const charitySchema = z.object({
  name: z.string().trim().min(1, "Enter the charity's name.").max(200, "Name must be at most 200 characters."),
  registrationNumber: registrationNumberSchema,
  addressLine1: optionalText(200, "Address line 1"),
  addressLine2: optionalText(200, "Address line 2"),
  town: optionalText(100, "Town or city"),
  county: optionalText(100, "County"),
  postcode: optionalText(20, "Postcode").transform((v) => v?.toUpperCase() ?? null),
  country: optionalText(100, "Country"),
  contactEmail: contactEmailSchema,
  website: websiteSchema,
});

export type CharityInput = z.infer<typeof charitySchema>;

export const CHARITY_FIELDS = [
  "name",
  "registrationNumber",
  "addressLine1",
  "addressLine2",
  "town",
  "county",
  "postcode",
  "country",
  "contactEmail",
  "website",
] as const satisfies readonly (keyof CharityInput)[];

/** Address as display lines, skipping blanks. */
export function addressLines(c: Pick<CharityInput, "addressLine1" | "addressLine2" | "town" | "county" | "postcode" | "country">): string[] {
  return [c.addressLine1, c.addressLine2, c.town, c.county, c.postcode, c.country].filter(
    (line): line is string => Boolean(line),
  );
}
