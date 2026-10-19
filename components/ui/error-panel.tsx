"use client";

import { Button, LinkButton } from "./button";

/**
 * Generic error fallback. Shows no error details: in production Next.js replaces
 * server error messages with a digest, which is shown so support can find the log.
 */
export function ErrorPanel({ error, retry }: { error: unknown; retry: () => void }) {
  const digest =
    typeof error === "object" && error !== null && "digest" in error ? String((error as { digest: unknown }).digest) : undefined;
  return (
    <div role="alert" className="mx-auto max-w-lg rounded-lg border border-line bg-surface px-6 py-10 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">
        An unexpected error occurred. Try again, and if the problem continues, contact an administrator.
      </p>
      {digest && <p className="mt-3 font-mono text-xs text-muted">Reference: {digest}</p>}
      <div className="mt-6 flex justify-center gap-2">
        <Button onClick={() => retry()}>Try again</Button>
        <LinkButton href="/dashboard" variant="secondary">
          Go to dashboard
        </LinkButton>
      </div>
    </div>
  );
}
