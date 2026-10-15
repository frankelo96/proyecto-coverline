"use client";

import { Pencil } from "lucide-react";
import { Fragment, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { UserForm, type UserFormValues } from "./user-form";

export interface UserRow extends UserFormValues {
  roleName: string;
  lastLoginAt: string | null;
  locked: boolean;
}

export function UsersTable({
  users,
  roles,
  branches,
}: {
  users: UserRow[];
  roles: { id: string; name: string; description: string | null }[];
  branches: { id: string; name: string }[];
}) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <Table className="min-w-[720px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-5">Nombre</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Último ingreso</TableHead>
            <TableHead className="pr-5 text-right">
              <span className="sr-only">Acciones</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <Fragment key={u.id}>
              <TableRow className={u.active ? undefined : "text-muted-foreground"}>
                <TableCell className="pl-5 font-medium">
                  {u.name} {!u.active && <Badge variant="outline">Inactivo</Badge>} {u.locked && <Badge variant="destructive">Bloqueado</Badge>}
                </TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  <Badge variant="outline">{u.roleName}</Badge>
                </TableCell>
                <TableCell>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "Nunca"}</TableCell>
                <TableCell className="pr-5 text-right">
                  <Button variant="ghost" size="sm" aria-expanded={editing === u.id} onClick={() => setEditing(editing === u.id ? null : u.id!)}>
                    <Pencil /> Editar
                  </Button>
                </TableCell>
              </TableRow>
              {editing === u.id && (
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableCell colSpan={5} className="px-5 py-4">
                    <UserForm initial={u} roles={roles} branches={branches} />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
