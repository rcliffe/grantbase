import { z } from "zod";
import { GRANT_STAGES, type GrantStage } from "./grant-process";
import type { Role } from "./roles";

/**
 * Grant categories and grant statuses: short reference lists maintained by
 * administrators. Both kinds have the same fields and share one service and UI.
 */

export const LOOKUP_KINDS = ["category", "status"] as const;

/** Longest category or status name (the column is VARCHAR(255)). */
export const LOOKUP_NAME_MAX_LENGTH = 255;
export type LookupKind = (typeof LOOKUP_KINDS)[number];

export const LOOKUP_PERMISSIONS = {
  manage: "ADMINISTRATOR",
} as const satisfies Record<string, Role>;

export const LOOKUP_CONFIG = {
  category: {
    singular: "category",
    plural: "categories",
    title: "Grant categories",
    description: "The kinds of grant, used to group and report on grants.",
    basePath: "/settings/grant-categories",
  },
  status: {
    singular: "status",
    plural: "statuses",
    title: "Grant statuses",
    description: "The stages a grant moves through, in order.",
    basePath: "/settings/grant-statuses",
  },
} as const satisfies Record<LookupKind, { singular: string; plural: string; title: string; description: string; basePath: string }>;

/** Badge colours (see Badge in components/ui/misc.tsx). */
export const LOOKUP_TONES = ["neutral", "accent", "success", "warning", "danger"] as const;
export type LookupTone = (typeof LOOKUP_TONES)[number];

export const LOOKUP_TONE_LABELS: Record<LookupTone, string> = {
  neutral: "Grey",
  accent: "Blue",
  success: "Green",
  warning: "Amber",
  danger: "Red",
};

export function isLookupTone(value: unknown): value is LookupTone {
  return typeof value === "string" && (LOOKUP_TONES as readonly string[]).includes(value);
}

/** A starting set offered when the status list is empty. */
export const STANDARD_GRANT_STATUSES: { name: string; description: string; tone: LookupTone; stage: GrantStage | null }[] = [
  { name: "Draft", description: "Being prepared; not yet submitted.", tone: "neutral", stage: null },
  { name: "Submitted", description: "Application received.", tone: "accent", stage: "SUBMITTED" },
  { name: "Under review", description: "Being assessed.", tone: "warning", stage: "SUBMITTED" },
  { name: "Awarded", description: "Approved for funding.", tone: "success", stage: "APPROVED" },
  { name: "Paid", description: "Funds sent to the charity.", tone: "success", stage: "PAID" },
  { name: "Declined", description: "Not approved.", tone: "danger", stage: "REJECTED" },
  { name: "Withdrawn", description: "Withdrawn by the applicant.", tone: "neutral", stage: null },
  { name: "Closed", description: "Complete; no further action.", tone: "neutral", stage: null },
];

export const lookupKindSchema = z.enum(LOOKUP_KINDS);

export const lookupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name.")
    .max(LOOKUP_NAME_MAX_LENGTH, `Name must be at most ${LOOKUP_NAME_MAX_LENGTH} characters.`),
  description: z
    .string()
    .trim()
    .max(500, "Description must be at most 500 characters.")
    .transform((v) => (v === "" ? null : v)),
  tone: z.enum(LOOKUP_TONES, { error: "Choose a colour." }),
  /** Statuses only: where the status sits in the grant process. Blank = none. */
  stage: z
    .union([z.enum(GRANT_STAGES), z.literal("")], { error: "Choose a stage." })
    .optional()
    .transform((v) => v || null),
  // Checkbox: present ("on") when ticked, absent when not.
  active: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true"),
});

export type LookupInput = z.infer<typeof lookupSchema>;

export const LOOKUP_FIELDS = ["name", "description", "tone", "stage", "active"] as const satisfies readonly (keyof LookupInput)[];
