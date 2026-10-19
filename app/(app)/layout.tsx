import { AppShell } from "@/components/shell/app-shell";

/**
 * Layout for signed-in pages. It does NOT enforce authentication: layouts don't
 * re-render on every navigation and aren't a security boundary. Each page calls
 * requireUser()/requireRole() itself.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
