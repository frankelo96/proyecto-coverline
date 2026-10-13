import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { BrandLogo } from "@/components/documents/brand-logo";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Ingresar" };

type Props = { searchParams: Promise<{ next?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandLogo className="h-16 w-auto" priority />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Sistema de gestión</h1>
            <p className="text-sm text-muted-foreground">Ingresá con tu usuario de la empresa</p>
          </div>
        </div>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
