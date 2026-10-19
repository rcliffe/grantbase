import type { ReactNode } from "react";
import { cn } from "./cn";

type Tone = "error" | "success" | "info" | "warning";

const tones: Record<Tone, string> = {
  error: "border-danger/40 bg-danger-soft text-danger",
  success: "border-success/40 bg-success-soft text-success",
  info: "border-accent/30 bg-accent-soft text-foreground",
  warning: "border-warning/40 bg-warning-soft text-warning",
};

/**
 * Inline message. Errors use role="alert" (announced immediately); everything else
 * uses role="status" (announced politely).
 */
export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("rounded-md border px-4 py-3 text-sm", tones[tone], className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title && "mt-1")}>{children}</div>}
    </div>
  );
}
