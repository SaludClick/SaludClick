-- Fixture sintetica. Ejecutar solo en PGlite en memoria.
-- SOLO LECTURA. Ejecutar en EPS_DATABASE_URL, nunca asumir que la tabla local
-- afiliados del destino es la fuente original. Esquema comprobado: public.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='20s';
SHOW transaction_read_only;
SELECT id,nombre,estado FROM public.eps WHERE id=901;
SELECT eps_id,count(*) AS total,
 count(*) FILTER(WHERE lower(btrim(estado::text))='activo') AS activos,
 count(DISTINCT id) AS ids_unicos,count(DISTINCT documento) AS documentos_unicos
FROM public.afiliados GROUP BY eps_id;
SELECT id,count(*) FROM public.afiliados GROUP BY id HAVING count(*)>1;
SELECT count(*) AS documentos_duplicados FROM (
 SELECT documento FROM public.afiliados GROUP BY documento HAVING count(*)>1
) d;
SELECT has_schema_privilege('public','USAGE') AS uso,
 has_table_privilege('public.afiliados','SELECT') AS lectura,
 has_table_privilege('public.afiliados','INSERT') AS insercion,
 has_table_privilege('public.afiliados','UPDATE') AS actualizacion,
 has_table_privilege('public.afiliados','DELETE') AS borrado;
-- Para comparar identidad cuenta/afiliado entre conexiones sin publicar
-- documentos se usa farmacia-audit-activacion-readonly.cjs. Ningún INSERT aquí.
ROLLBACK;
