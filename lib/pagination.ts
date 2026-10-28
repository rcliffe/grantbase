/** Rows per page a list can show; the choice is kept in the URL as `size`. */
export const PAGE_SIZES = [10, 25, 50] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 25;

/** A requested page size, or the default when it isn't one of PAGE_SIZES. */
export function pageSize(value: string | number | undefined): PageSize {
  const n = typeof value === "number" ? value : Number.parseInt(value ?? "", 10);
  return PAGE_SIZES.find((s) => s === n) ?? DEFAULT_PAGE_SIZE;
}

/** The page to show: `requested` clamped to 1…pageCount. */
export function clampPage(requested: number | undefined, total: number, size: PageSize) {
  const pageCount = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(1, Math.floor(requested ?? 1) || 1), pageCount);
  return { page, pageCount, skip: (page - 1) * size };
}
