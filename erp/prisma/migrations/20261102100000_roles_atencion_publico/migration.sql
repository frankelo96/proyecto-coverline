-- Puesto de atención al público (VENDEDOR): sin cobranzas ni informes; de caja solo ve el total del día en el POS.
UPDATE "roles"
SET "permissions" = array_remove("permissions", 'accounts:receivables:collect'),
    "description" = 'Atención al público: ventas, clientes y presupuestos. De caja solo ve el total vendido y gastado del día'
WHERE "name" = 'VENDEDOR';

-- Producción conserva el acceso a informes (stock, compras) con el nuevo permiso.
UPDATE "roles"
SET "permissions" = array_append("permissions", 'reports:read')
WHERE "name" = 'PRODUCCION' AND NOT ('reports:read' = ANY("permissions"));
