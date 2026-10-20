import { Suspense } from "react";
import { APP_NAME, Brand } from "@/components/shell/brand";
import { LinkButton } from "@/components/ui/button";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { getOptionalUser } from "@/server/authz/guards";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center justify-between border-b border-line bg-surface px-4 lg:px-6">
        <Brand />
        <div className="flex items-center gap-3">
          <ThemeSwitcher />
          <Suspense fallback={<SignInLink />}>
            <HeaderAction />
          </Suspense>
        </div>
      </header>
      <main id="main" className="flex flex-1 items-center px-4 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{APP_NAME}</h1>
          <p className="mt-4 text-lg text-muted">
            A secure workspace for your team. Accounts are created by an administrator. There is no
            public registration.
          </p>
          <div className="mt-8 flex justify-center">
            <Suspense fallback={<SignInLink />}>
              <HeroAction />
            </Suspense>
          </div>
        </div>
      </main>
      <footer className="border-t border-line px-4 py-6 text-center text-xs text-muted">
        {APP_NAME}
      </footer>
    </div>
  );
}

function SignInLink() {
  return <LinkButton href="/sign-in">Sign in</LinkButton>;
}

async function HeaderAction() {
  const user = await getOptionalUser();
  return user ? (
    <LinkButton href="/dashboard" variant="secondary" size="sm">
      Dashboard
    </LinkButton>
  ) : (
    <LinkButton href="/sign-in" variant="secondary" size="sm">
      Sign in
    </LinkButton>
  );
}

async function HeroAction() {
  const user = await getOptionalUser();
  return user ? <LinkButton href="/dashboard">Go to your dashboard</LinkButton> : <SignInLink />;
}
