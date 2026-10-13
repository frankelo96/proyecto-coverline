import { Shirt } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
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
          <span className="flex size-12 items-center justify-center rounded-lg bg-ink">
            <Shirt aria-hidden="true" className="size-6 text-accent" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Coverline ERP</h1>
            <p className="text-sm text-muted-foreground">Ingresá con tu usuario de la empresa</p>
          </div>
        </div>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
