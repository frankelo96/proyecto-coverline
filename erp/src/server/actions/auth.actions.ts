"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { LOCKOUT_MS, MAX_FAILED_LOGINS } from "@/lib/auth/constants";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { db } from "@/server/db";
import { createSession, destroySession } from "@/server/auth/session";

const loginSchema = z.object({
  email: z.email("Ingresá un email válido").transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1, "Ingresá la contraseña").max(200),
  next: z.string().optional(),
});

export type LoginState = { error: string | null; email: string };

/** Hash fijo para comparar cuando el usuario no existe y no revelar por tiempo de respuesta qué emails existen. */
let dummyHash: Promise<string> | null = null;

/** Solo rutas internas para evitar open redirects. */
function safeNext(next: string | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  const typedEmail = String(formData.get("email") ?? "").slice(0, 200);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", email: typedEmail };
  const { email, password, next } = parsed.data;

  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    dummyHash ??= hashPassword("coverline-dummy");
    await verifyPassword(password, await dummyHash);
    return { error: "Email o contraseña incorrectos", email: typedEmail };
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return { error: `Cuenta bloqueada por intentos fallidos. Probá de nuevo en ${minutes} min.`, email: typedEmail };
  }

  const valid = user.active && (await verifyPassword(password, user.passwordHash));
  if (!valid) {
    const failed = user.failedLogins + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLogins: failed >= MAX_FAILED_LOGINS ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MS) : null,
      },
    });
    return { error: "Email o contraseña incorrectos", email: typedEmail };
  }

  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  // Limpieza oportunista de sesiones vencidas del usuario.
  await db.session.deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date() } } });
  await createSession(user.id);
  redirect(safeNext(next));
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
