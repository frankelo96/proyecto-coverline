import type { Metadata } from "next";

import { UserForm } from "@/components/admin/user-form";
import { UsersTable } from "@/components/admin/users-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePageUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { BRANCH_ORDER } from "@/server/services/stock.service";

export const metadata: Metadata = { title: "Usuarios" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await requirePageUser(PERMISSIONS.usersManage);
  const [users, roles, branches] = await Promise.all([
    db.user.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], include: { role: { select: { name: true } } } }),
    db.role.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, description: true } }),
    db.branch.findMany({ where: { active: true, kind: "LOCAL" }, orderBy: BRANCH_ORDER, select: { id: true, name: true } }),
  ]);
  const now = new Date();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-3xl font-bold tracking-tight">Usuarios</h1>
        <p className="text-sm text-muted-foreground">
          El rol define qué módulos ve cada persona. Al desactivar un usuario o cambiarle la contraseña se cierran sus sesiones abiertas.
        </p>
      </div>
      <UsersTable
        roles={roles}
        branches={branches}
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          roleId: u.roleId,
          roleName: u.role.name,
          active: u.active,
          branchId: u.branchId,
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
          locked: !!u.lockedUntil && u.lockedUntil > now,
        }))}
      />
      <Card>
        <CardHeader>
          <CardTitle>Nuevo usuario</CardTitle>
          <CardDescription>Compartile el email y la contraseña inicial: es provisoria, el sistema le pide cambiarla la primera vez que ingresa.</CardDescription>
        </CardHeader>
        <CardContent>
          <UserForm initial={{ id: null, name: "", email: "", roleId: "", active: true, branchId: null }} roles={roles} branches={branches} />
        </CardContent>
      </Card>
    </div>
  );
}
