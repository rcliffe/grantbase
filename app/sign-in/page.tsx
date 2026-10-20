import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Brand } from "@/components/shell/brand";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody } from "@/components/ui/card";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { getOptionalUser } from "@/server/authz/guards";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <main id="main" className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Brand />
        </div>
        <Card>
          <CardBody className="space-y-5 py-6">
            <div>
              <h1 className="text-xl font-semibold">Sign in</h1>
              <p className="mt-1 text-sm text-muted">Use the account your administrator created for you.</p>
            </div>
            <Suspense fallback={null}>
              <SignedOutNotice searchParams={searchParams} />
              <RedirectIfSignedIn />
            </Suspense>
            <SignInForm />
          </CardBody>
        </Card>
        <p className="mt-4 text-center text-xs text-muted">
          Forgotten your password? Ask an administrator to reset it.
        </p>
        <div className="mt-6 flex justify-center">
          <ThemeSwitcher />
        </div>
      </div>
    </main>
  );
}

async function SignedOutNotice({ searchParams }: { searchParams: PageProps<"/sign-in">["searchParams"] }) {
  const params = await searchParams;
  if (params["signed-out"] !== "1") return null;
  return <Alert tone="success">You have been signed out.</Alert>;
}

async function RedirectIfSignedIn() {
  if (await getOptionalUser()) redirect("/dashboard");
  return null;
}
