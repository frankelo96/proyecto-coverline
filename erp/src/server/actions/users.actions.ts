"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/lib/action-result";
import { hashPassword } from "@/lib/auth/password";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { userSchema } from "@/lib/validations/users";
import { AuthorizationError, requireActionUser } from "@/server/auth/session";
import { db } from "@/server/db";

export async function saveUserAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await requireActionUser(PERMISSIONS.usersManage);
    const input = userSchema.parse(raw);
    const role = await db.role.findUnique({ where: { id: input.roleId } });
    if (!role) return { ok: false, error: "Rol inexistente" };
    // Nadie puede otorgar más permisos de los que tiene (solo un administrador total crea administradores).
    if (role.permissions.some((p) => !hasPermission(me.permissions, p))) return { ok: false, error: "No podés asignar un rol con más permisos que el tuyo" };
    if (input.id === me.id && !input.active) return { ok: false, error: "No podés desactivar tu propio usuario" };
    // Tampoco se puede editar (ni cambiarle la clave) a alguien con más permisos.
    if (input.id) {
      const current = await db.user.findUnique({ where: { id: input.id }, include: { role: true } });
      if (current && current.role.permissions.some((p) => !hasPermission(me.permissions, p))) return { ok: false, error: "No podés modificar a un usuario con más permisos que el tuyo" };
    }

    const data = {
      name: input.name,
      email: input.email,
      roleId: input.roleId,
      active: input.active,
      branchId: input.branchId || null,
      // La clave que pone un administrador es provisoria: la persona la cambia al ingresar.
      ...(input.password ? { passwordHash: await hashPassword(input.password), failedLogins: 0, lockedUntil: null, mustChangePassword: input.id !== me.id } : {}),
    };
    const user = await db.$transaction(async (tx) => {
      const u = input.id
        ? await tx.user.update({ where: { id: input.id }, data })
        : await tx.user.create({ data: { ...data, passwordHash: data.passwordHash ?? (await hashPassword(input.password)), mustChangePassword: true } });
      // Al desactivar o cambiar la contraseña se cierran sus sesiones abiertas.
      if (input.id && (!input.active || input.password)) await tx.session.deleteMany({ where: { userId: u.id } });
      await tx.auditLog.create({
        data: { userId: me.id, entity: "User", entityId: u.id, action: input.id ? "UPDATE" : "CREATE", data: { email: u.email, role: role.name, active: u.active, passwordChanged: !!input.password } },
      });
      return u;
    });
    revalidatePath("/maestros/usuarios");
    return { ok: true, data: { id: user.id }, message: input.id ? "Usuario actualizado" : `Usuario ${user.email} creado` };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos" };
    if (e instanceof AuthorizationError) return { ok: false, error: e.message };
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") return { ok: false, error: "Ya existe un usuario con ese email" };
    console.error("[users.actions]", e);
    return { ok: false, error: "No se pudo guardar el usuario" };
  }
}
