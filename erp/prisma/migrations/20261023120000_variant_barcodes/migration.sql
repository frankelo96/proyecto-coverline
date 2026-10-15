-- Códigos de barras internos (EAN-13 con prefijo 20: rango de GS1 para uso dentro del comercio).
CREATE SEQUENCE IF NOT EXISTS "barcode_seq" START 1;

CREATE OR REPLACE FUNCTION next_internal_ean() RETURNS text AS $$
DECLARE
  body text;
  s int := 0;
  i int;
BEGIN
  LOOP
    body := '20' || lpad(nextval('barcode_seq')::text, 10, '0');
    s := 0;
    FOR i IN 1..12 LOOP
      s := s + substr(body, i, 1)::int * CASE WHEN i % 2 = 0 THEN 3 ELSE 1 END;
    END LOOP;
    body := body || ((10 - s % 10) % 10)::text;
    -- Salta los que ya se hayan cargado a mano.
    EXIT WHEN NOT EXISTS (SELECT 1 FROM "product_variants" WHERE "barcode" = body);
  END LOOP;
  RETURN body;
END
$$ LANGUAGE plpgsql VOLATILE;

ALTER TABLE "product_variants" ALTER COLUMN "barcode" SET DEFAULT next_internal_ean();

-- Las variantes existentes sin código reciben uno.
UPDATE "product_variants" SET "barcode" = next_internal_ean() WHERE "barcode" IS NULL OR "barcode" = '';
