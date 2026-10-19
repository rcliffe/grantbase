"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";
import { Button } from "./button";
import { Spinner } from "./spinner";

/** Submit button that disables itself and shows progress while its form is pending. */
export function SubmitButton({
  children,
  pendingLabel,
  disabled,
  ...props
}: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} aria-disabled={pending || disabled} {...props}>
      {pending && <Spinner />}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
