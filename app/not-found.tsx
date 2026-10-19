import { LinkButton } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold text-accent">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted">The page you were looking for doesn&apos;t exist or has moved.</p>
        <div className="mt-6">
          <LinkButton href="/">Go home</LinkButton>
        </div>
      </div>
    </main>
  );
}
