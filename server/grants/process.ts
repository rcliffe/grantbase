import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { GRANT_STAGE_LABELS, type GrantStage } from "@/lib/grant-process";
import { grantSchema, toDateInput } from "@/lib/grants";
import { db } from "@/server/db/client";
import { findGrants, type GrantItem } from "./service";

/**
 * The grant process. Grants whose status has the SUBMITTED stage await a decision;
 * approving or rejecting moves them to the first active status with the APPROVED or
 * REJECTED stage. Approved grants without a payment date await payment; marking one
 * as paid records the date and moves it to the PAID status, if one is set up.
 *
 * Each step re-validates the whole grant with the form's rules, and only applies if
 * the grant is still where the user saw it, so two people can't process it twice.
 * Callers must authorise first (GRANT_PERMISSIONS.process).
 */

export type ProcessErrorField = "amountAgreed" | "decisionDate" | "paymentDate";

export class ProcessError extends Error {
  constructor(
    message: string,
    public readonly field?: ProcessErrorField,
  ) {
    super(message);
    this.name = "ProcessError";
  }
}

/** Grants awaiting a decision, oldest submission first. */
export function listAwaitingDecision(): Promise<GrantItem[]> {
  return findGrants({ status: { stage: "SUBMITTED" } }, [{ dateSubmitted: "asc" }, { createdAt: "asc" }, { id: "asc" }]);
}

/** Approved grants not yet paid, oldest decision first. */
export function listAwaitingPayment(): Promise<GrantItem[]> {
  return findGrants({ status: { stage: "APPROVED" }, paymentDate: null }, [{ decisionDate: "asc" }, { dateSubmitted: "asc" }, { id: "asc" }]);
}

/** The status a step moves grants to: the first active one with that stage. */
async function statusForStage(tx: Prisma.TransactionClient, stage: GrantStage) {
  return tx.grantStatus.findFirst({ where: { stage, active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } });
}

const grantForProcess = {
  id: true,
  charityId: true,
  categoryId: true,
  statusId: true,
  purpose: true,
  dateSubmitted: true,
  amountRequested: true,
  amountAgreed: true,
  decisionDate: true,
  paymentDate: true,
  status: { select: { name: true, stage: true } },
} satisfies Prisma.GrantSelect;
type ProcessGrant = Prisma.GrantGetPayload<{ select: typeof grantForProcess }>;

/** Validates the grant as it will be after the step, with the grant form's rules. */
function validate(grant: ProcessGrant, changes: { statusId: string; amountAgreed?: string; decisionDate?: string; paymentDate?: string }) {
  const parsed = grantSchema.safeParse({
    charityId: grant.charityId,
    categoryId: grant.categoryId,
    statusId: changes.statusId,
    purpose: grant.purpose ?? "",
    dateSubmitted: toDateInput(grant.dateSubmitted),
    amountRequested: grant.amountRequested.toFixed(2),
    amountAgreed: changes.amountAgreed ?? grant.amountAgreed?.toFixed(2) ?? "",
    decisionDate: changes.decisionDate ?? toDateInput(grant.decisionDate),
    paymentDate: changes.paymentDate ?? toDateInput(grant.paymentDate),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = String(issue.path[0]);
    throw new ProcessError(issue.message, ["amountAgreed", "decisionDate", "paymentDate"].includes(field) ? (field as ProcessErrorField) : undefined);
  }
  return parsed.data;
}

const toDate = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`) : null);

async function loadGrant(tx: Prisma.TransactionClient, id: string): Promise<ProcessGrant> {
  const grant = await tx.grant.findUnique({ where: { id }, select: grantForProcess });
  if (!grant) throw new ProcessError("This grant no longer exists.");
  return grant;
}

/** Applies `data` only if the grant still has `statusId` and its payment date is unchanged. */
async function applyIfUnchanged(tx: Prisma.TransactionClient, grant: ProcessGrant, data: Prisma.GrantUncheckedUpdateManyInput) {
  const { count } = await tx.grant.updateMany({ where: { id: grant.id, statusId: grant.statusId, paymentDate: grant.paymentDate }, data });
  if (count === 0) throw new ProcessError("Someone else updated this grant at the same time. Reload the page and try again.");
}

export async function decideGrant(
  id: string,
  decision: "approve" | "reject",
  input: { amountAgreed: string; decisionDate: string },
  actorId: string,
): Promise<{ statusName: string }> {
  return db().$transaction(async (tx) => {
    const grant = await loadGrant(tx, id);
    if (grant.status.stage !== "SUBMITTED") {
      throw new ProcessError(`This grant has already been decided: its status is now “${grant.status.name}”.`);
    }
    const stage = decision === "approve" ? "APPROVED" : "REJECTED";
    const target = await statusForStage(tx, stage);
    if (!target) {
      throw new ProcessError(`No active status has the “${GRANT_STAGE_LABELS[stage]}” stage. An administrator can set one under Settings → Grant statuses.`);
    }

    const data = validate(grant, {
      statusId: target.id,
      amountAgreed: decision === "approve" ? input.amountAgreed : "0",
      decisionDate: input.decisionDate,
    });
    if (decision === "approve" && (data.amountAgreed === null || data.amountAgreed === "0.00")) {
      throw new ProcessError("Enter the amount agreed. To turn the grant down, reject it instead.", "amountAgreed");
    }
    await applyIfUnchanged(tx, grant, {
      statusId: target.id,
      amountAgreed: data.amountAgreed,
      decisionDate: toDate(data.decisionDate),
      updatedById: actorId,
    });
    return { statusName: target.name };
  });
}

export async function markGrantPaid(id: string, input: { paymentDate: string }, actorId: string): Promise<{ statusName: string }> {
  return db().$transaction(async (tx) => {
    const grant = await loadGrant(tx, id);
    if (grant.paymentDate) throw new ProcessError("This grant has already been marked as paid.");
    if (grant.status.stage !== "APPROVED") {
      throw new ProcessError(`Only approved grants can be paid: this grant's status is “${grant.status.name}”.`);
    }
    // Without a status for the PAID stage, the payment date is recorded and the status kept.
    const target = (await statusForStage(tx, "PAID")) ?? { id: grant.statusId, name: grant.status.name };

    const data = validate(grant, { statusId: target.id, paymentDate: input.paymentDate });
    if (!data.paymentDate) throw new ProcessError("Enter the payment date.", "paymentDate");
    await applyIfUnchanged(tx, grant, { statusId: target.id, paymentDate: toDate(data.paymentDate), updatedById: actorId });
    return { statusName: target.name };
  });
}
