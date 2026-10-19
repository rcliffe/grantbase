import type { ReactNode } from "react";
import { cn } from "./cn";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-lg border border-line bg-surface shadow-sm", className)}>{children}</section>;
}

export function CardHeader({
  title,
  description,
  actions,
  headingLevel: Heading = "h2",
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  headingLevel?: "h2" | "h3";
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div>
        <Heading className="text-base font-semibold">{title}</Heading>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}
