import Link from "next/link";

export const APP_NAME = "Grantbase";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 rounded-md font-semibold tracking-tight">
      <span aria-hidden="true" className="grid size-7 place-items-center rounded-md bg-accent text-sm text-accent-foreground">
        G
      </span>
      <span>{APP_NAME}</span>
    </Link>
  );
}
