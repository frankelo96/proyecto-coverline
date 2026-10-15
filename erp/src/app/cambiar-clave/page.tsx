import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { BrandLogo } from "@/components/documents/brand-logo";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Cambiar contraseña" };
export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandLogo className="h-12 w-auto" priority />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Cambiar contraseña</h1>
            <p className="text-sm text-muted-foreground">
              {user.mustChangePassword
                ? `${user.name}, antes de seguir elegí una contraseña propia: la actual es provisoria.`
                : `${user.name} · ${user.email}`}
            </p>
          </div>
        </div>
        <ChangePasswordForm />
        {!user.mustChangePassword && (
          <Link href="/" className="text-center text-sm text-muted-foreground hover:text-foreground">
            Volver al sistema
          </Link>
        )}
      </div>
    </main>
  );
}
