import Link from "next/link";
import type { ReactNode } from "react";
import { PAGE_SIZES, type PageSize } from "@/lib/pagination";
import { LinkButton } from "./button";
import { cn } from "./cn";

/**
 * The bar under a paged list: a summary, a rows-per-page choice (when there are more
 * rows than the smallest size) and Previous/Next links.
 */
export function Pagination({
  summary,
  total,
  page,
  pageCount,
  pageSize,
  href,
}: {
  summary?: ReactNode;
  total: number;
  page: number;
  pageCount: number;
  pageSize: PageSize;
  /** The list's URL for a page and size. */
  href: (page: number, size: PageSize) => string;
}) {
  const choosable = total > PAGE_SIZES[0];
  if (!summary && !choosable && pageCount <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
      <p>{summary}</p>
      <div className="flex flex-wrap items-center gap-4">
        {choosable && (
          <div className="flex items-center gap-1">
            <span className="mr-1">Per page</span>
            {PAGE_SIZES.map((size) => (
              <Link
                key={size}
                href={href(1, size)}
                aria-current={size === pageSize ? "true" : undefined}
                aria-label={`Show ${size} per page`}
                className={cn(
                  "rounded-md px-2 py-1 tabular-nums",
                  size === pageSize ? "bg-surface-muted font-semibold text-foreground" : "hover:bg-surface-muted hover:text-foreground",
                )}
              >
                {size}
              </Link>
            ))}
          </div>
        )}
        {pageCount > 1 && (
          <div className="flex gap-2">
            {page > 1 && (
              <LinkButton href={href(page - 1, pageSize)} variant="secondary" size="sm">
                Previous
              </LinkButton>
            )}
            {page < pageCount && (
              <LinkButton href={href(page + 1, pageSize)} variant="secondary" size="sm">
                Next
              </LinkButton>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
