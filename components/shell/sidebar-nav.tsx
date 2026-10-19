"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";
import type { NavSection } from "@/lib/navigation";

/**
 * Renders the navigation the server computed for the user's role. Hiding links here
 * is purely cosmetic; every page enforces its own access rules.
 */
export function SidebarNav({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-5 lg:overflow-visible">
      {sections.map((section, i) => (
        <div key={section.label ?? i} className="flex gap-1 lg:flex-col">
          {section.label && (
            <p className="hidden px-3 pb-1 text-xs font-semibold tracking-wide text-muted uppercase lg:block">
              {section.label}
            </p>
          )}
          <ul className="flex gap-1 lg:flex-col">
            {section.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors",
                      active
                        ? "bg-accent-soft font-medium text-accent"
                        : "text-muted hover:bg-surface-muted hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
