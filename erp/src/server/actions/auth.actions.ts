"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { LOCKOUT_MS, MAX_FAILED_LOGINS } from "@/lib/auth/constants";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { db } from "@/server/db";
import { createSession, destroySession, requireActionUser } from "@/server/auth/session";

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

/**
 * Límite de intentos fallidos por IP (en memoria: el servicio corre en una sola
 * instancia). Frena la fuerza bruta contra muchos emails a la vez.
 */
const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_MAX_FAILED = 20;
const ipFailures = new Map<string, { count: number; since: number }>();

async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim();
}

function ipBlocked(ip: string) {
  const f = ipFailures.get(ip);
  if (!f || Date.now() - f.since > IP_WINDOW_MS) return false;
  return f.count >= IP_MAX_FAILED;
}

function registerIpFailure(ip: string) {
  const f = ipFailures.get(ip);
  if (!f || Date.now() - f.since > IP_WINDOW_MS) ipFailures.set(ip, { count: 1, since: Date.now() });
  else f.count++;
  if (ipFailures.size > 5000) ipFailures.clear();
}

const GENERIC_ERROR = "Email o contraseña incorrectos. Después de 5 intentos fallidos la cuenta se bloquea 15 minutos.";

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  const typedEmail = String(formData.get("email") ?? "").slice(0, 200);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", email: typedEmail };
  const { email, password, next } = parsed.data;
  const ip = await clientIp();
  if (ipBlocked(ip)) return { error: "Demasiados intentos fallidos desde esta conexión. Esperá 15 minutos.", email: typedEmail };

  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    dummyHash ??= hashPassword("coverline-dummy");
    await verifyPassword(password, await dummyHash);
    registerIpFailure(ip);
    return { error: GENERIC_ERROR, email: typedEmail };
  }
  // Cuenta bloqueada: mismo mensaje que una clave incorrecta (no revela qué emails existen).
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    registerIpFailure(ip);
    return { error: GENERIC_ERROR, email: typedEmail };
  }

  const valid = user.active && (await verifyPassword(password, user.passwordHash));
  if (!valid) {
    registerIpFailure(ip);
    // Incremento atómico: varios intentos en paralelo no pasan el tope.
    const updated = await db.user.update({ where: { id: user.id }, data: { failedLogins: { increment: 1 } }, select: { failedLogins: true } });
    if (updated.failedLogins >= MAX_FAILED_LOGINS) {
      await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MS) } });
    }
    return { error: GENERIC_ERROR, email: typedEmail };
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

const changePasswordSchema = z
  .object({
    current: z.string().min(1, "Ingresá tu contraseña actual").max(200),
    next: z.string().min(10, "La nueva contraseña debe tener al menos 10 caracteres").max(200),
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, { message: "Las contraseñas nuevas no coinciden", path: ["confirm"] })
  .refine((v) => v.next !== v.current, { message: "La nueva contraseña tiene que ser distinta de la actual", path: ["next"] });

export type ChangePasswordState = { error: string | null; done: boolean };

/** Cambio de la propia contraseña (obligatorio si la clave es la inicial). Cierra las otras sesiones. */
export async function changePasswordAction(_prev: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  const me = await requireActionUser().catch(() => null);
  if (!me) redirect("/login");
  const parsed = changePasswordSchema.safeParse({ current: formData.get("current"), next: formData.get("next"), confirm: formData.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", done: false };
  const user = await db.user.findUniqueOrThrow({ where: { id: me.id } });
  if (!(await verifyPassword(parsed.data.current, user.passwordHash))) return { error: "La contraseña actual no es correcta", done: false };
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(parsed.data.next), mustChangePassword: false } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.auditLog.create({ data: { userId: user.id, entity: "User", entityId: user.id, action: "PASSWORD_CHANGE" } });
  });
  await createSession(user.id);
  redirect("/");
}
