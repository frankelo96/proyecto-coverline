import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { SESSION_COOKIE, SESSION_RENEW_AFTER_MS, SESSION_TTL_MS } from "@/lib/auth/constants";
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "@/server/db";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  roleName: string;
  permissions: string[];
  /** Tiene que cambiar la contraseña antes de seguir (clave inicial o reseteada) */
  mustChangePassword: boolean;
  /** Local asignado: solo opera las cajas de ese local (null = todos) */
  branchId: string | null;
}

export class AuthorizationError extends Error {
  constructor(message = "No tenés permiso para realizar esta acción") {
    super(message);
    this.name = "AuthorizationError";
  }
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Crea la sesión en la base y setea la cookie. Solo desde Server Actions o Route Handlers. */
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const h = await headers();
  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    },
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Usuario de la request actual (memoizado por request). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { role: true } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  // Vencimiento deslizante: quien usa el sistema todos los días no queda deslogueado a los 7 días.
  const renewed = Date.now() + SESSION_TTL_MS;
  if (renewed - session.expiresAt.getTime() > SESSION_RENEW_AFTER_MS) {
    await db.session.update({ where: { id: session.id }, data: { expiresAt: new Date(renewed) } }).catch(() => undefined);
  }
  const { user } = session;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roleName: user.role.name,
    permissions: user.role.permissions,
    mustChangePassword: user.mustChangePassword,
    branchId: user.branchId,
  };
});

/** Para páginas: redirige a /login sin sesión y a /sin-acceso sin permiso. */
export async function requirePageUser(permission?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (permission && !hasPermission(user.permissions, permission)) redirect("/sin-acceso");
  return user;
}

/** Para Server Actions: lanza AuthorizationError (se convierte en ActionResult de error). */
export async function requireActionUser(permission?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthorizationError("Tu sesión expiró. Volvé a ingresar.");
  if (permission && !hasPermission(user.permissions, permission)) throw new AuthorizationError();
  return user;
}
