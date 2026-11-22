import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogoMark } from "@/components/app/logo";
import { authSettings, safeNextPath } from "@/server/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(typeof next === "string" ? next : null);
  // Local vaults without a password have nothing to sign in to.
  if (!authSettings().password) redirect(nextPath);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <LogoMark className="size-9" />
          <h1 className="text-heading font-semibold tracking-tight">Design Vault</h1>
          <p className="text-meta text-muted-foreground">Enter your vault password to continue.</p>
        </div>
        <LoginForm nextPath={nextPath} />
      </div>
    </main>
  );
}
