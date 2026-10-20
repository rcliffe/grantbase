/**
 * The grant process: submitted grants are approved or rejected, and approved grants
 * are paid. Which statuses mean what is configured per status (its "stage", set in
 * Settings → Grant statuses), so organisations keep their own status names.
 */
export const GRANT_STAGES = ["SUBMITTED", "APPROVED", "REJECTED", "PAID"] as const;
export type GrantStage = (typeof GRANT_STAGES)[number];

export const GRANT_STAGE_LABELS: Record<GrantStage, string> = {
  SUBMITTED: "Awaiting decision",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PAID: "Paid",
};

export const GRANT_STAGE_HELP: Record<GrantStage, string> = {
  SUBMITTED: "Listed under Decisions, ready to approve or reject.",
  APPROVED: "Where approving moves a grant; listed under Payments until paid.",
  REJECTED: "Where rejecting moves a grant.",
  PAID: "Where marking as paid moves a grant.",
};

export function isGrantStage(value: unknown): value is GrantStage {
  return typeof value === "string" && (GRANT_STAGES as readonly string[]).includes(value);
}

/** Today's date (YYYY-MM-DD) in the UK, for default decision and payment dates. */
export function todayInUk(now = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
