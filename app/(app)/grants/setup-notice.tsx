import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { LOOKUP_CONFIG, LOOKUP_PERMISSIONS } from "@/lib/grant-lookups";
import { hasRole, type Role } from "@/lib/roles";

/** Shown instead of the grant form until there is at least one active category and status. */
export function GrantSetupNotice({ role, missing }: { role: Role; missing: ("category" | "status")[] }) {
  const canManage = hasRole(role, LOOKUP_PERMISSIONS.manage);
  return (
    <Alert tone="warning" title="Grants can't be recorded yet">
      There {missing.length > 1 ? "are" : "is"} no active grant {missing.map((k) => LOOKUP_CONFIG[k].plural).join(" or ")}.{" "}
      {canManage ? (
        <>
          Add them under Settings:{" "}
          {missing.map((k, i) => (
            <span key={k}>
              {i > 0 && " and "}
              <Link href={LOOKUP_CONFIG[k].basePath} className="underline">
                {LOOKUP_CONFIG[k].title.toLowerCase()}
              </Link>
            </span>
          ))}
          .
        </>
      ) : (
        "Ask an administrator to set them up under Settings."
      )}
    </Alert>
  );
}
