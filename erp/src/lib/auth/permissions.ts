/**
 * Permisos con formato "modulo:accion" (o "modulo:sub:accion").
 * Comodines admitidos en los permisos del rol:
 *   "*"           → todo
 *   "production:*" → cualquier acción que empiece con "production:"
 */
export const PERMISSIONS = {
  productionRead: "production:read",
  productionWrite: "production:write",
  productionCostWrite: "production:cost:write",
  workshopsRead: "production:workshops:read",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export function hasPermission(granted: readonly string[], required: string): boolean {
  for (const g of granted) {
    if (g === "*" || g === required) return true;
    if (g.endsWith(":*") && required.startsWith(g.slice(0, -1))) return true;
  }
  return false;
}
