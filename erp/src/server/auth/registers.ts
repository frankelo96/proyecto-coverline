import "server-only";

import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { AuthorizationError, type CurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";

/**
 * Las cajas diarias se operan con permiso de turno; la caja negra y los bancos, con permiso de tesorería.
 * Quien tiene un local asignado solo opera las cajas de ese local.
 */
export async function requireForRegister(registerId: string, user: CurrentUser) {
  const register = await db.cashRegister.findUnique({ where: { id: registerId }, select: { kind: true, branchId: true, name: true } });
  if (!register) throw new AuthorizationError("Caja inexistente");
  const needed = register.kind === "CAJA_DIARIA" ? PERMISSIONS.cashSession : PERMISSIONS.cashManage;
  if (!hasPermission(user.permissions, needed)) throw new AuthorizationError();
  if (user.branchId && register.branchId && register.branchId !== user.branchId) {
    throw new AuthorizationError(`"${register.name}" es de otro local: solo podés operar las cajas de tu local`);
  }
  return register;
}
