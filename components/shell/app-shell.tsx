import { Suspense, type ReactNode } from "react";
import { Badge, Skeleton } from "@/components/ui/misc";
import { navForRole } from "@/lib/navigation";
import { ROLE_LABELS } from "@/lib/roles";
import { getOptionalUser } from "@/server/authz/guards";
import { Brand } from "./brand";
import { SidebarNav } from "./sidebar-nav";
import { SignOutButton } from "./sign-out-button";

/**
 * Shared chrome for signed-in pages. The frame is static (prerendered); the parts that
 * depend on the session stream in behind their own Suspense boundaries. The shell
 * only DISPLAYS user info — each page enforces authentication itself.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between gap-4 px-4 lg:px-6">
          <Brand href="/dashboard" />
          <Suspense fallback={<Skeleton className="h-8 w-48" />}>
            <UserMenu />
          </Suspense>
        </div>
      </header>
      <div className="flex flex-1 flex-col lg:flex-row">
        <aside className="border-b border-line bg-surface px-2 py-2 lg:w-60 lg:shrink-0 lg:border-r lg:border-b-0 lg:px-3 lg:py-6">
          <Suspense fallback={<NavSkeleton />}>
            <Navigation />
          </Suspense>
        </aside>
        <main id="main" tabIndex={-1} className="flex-1 px-4 py-6 focus:outline-none lg:px-8 lg:py-8">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

async function UserMenu() {
  const user = await getOptionalUser();
  if (!user) return null;
  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right sm:block">
        <p className="text-sm leading-tight font-medium">{user.name}</p>
        <p className="text-xs leading-tight text-muted">{user.email}</p>
      </div>
      <Badge tone={user.role === "ADMINISTRATOR" ? "accent" : "neutral"}>{ROLE_LABELS[user.role]}</Badge>
      <SignOutButton />
    </div>
  );
}

async function Navigation() {
  const user = await getOptionalUser();
  if (!user) return null;
  return <SidebarNav sections={navForRole(user.role)} />;
}

function NavSkeleton() {
  return (
    <div className="flex gap-2 lg:flex-col">
      <Skeleton className="h-9 w-28 lg:w-full" />
      <Skeleton className="h-9 w-28 lg:w-full" />
    </div>
  );
}
