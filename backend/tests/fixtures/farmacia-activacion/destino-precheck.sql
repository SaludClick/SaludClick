-- Fixture sintetica. Ejecutar solo en PGlite en memoria.
-- SOLO LECTURA. Ejecutar en la conexión de destino previamente identificada.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='20s';
SHOW transaction_read_only;
SELECT migration_name,checksum,finished_at,rolled_back_at,applied_steps_count
FROM public._prisma_migrations ORDER BY started_at;
SELECT u.id,u.nombre,u.apellido,u.rol_id,r.nombre AS rol,u.estado,
       u.cedula IS NOT NULL AND length(btrim(u.cedula))>0 AS documento_registrado
FROM public.usuarios u JOIN public.roles r ON r.id=u.rol_id WHERE u.id=904;
SELECT id,nombre,activa FROM public.eps_entidades WHERE id='901';
SELECT id,eps_id,farmacia_id,activa,version,vinculada_at
FROM public.eps_farmacias WHERE farmacia_id=904;
SELECT farmacia_id,count(*) FROM public.eps_farmacias WHERE activa
GROUP BY farmacia_id HAVING count(*)>1; -- debe devolver cero filas
SELECT indexname,indexdef FROM pg_indexes
WHERE schemaname='public' AND tablename='eps_farmacias';
SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default
FROM information_schema.columns WHERE table_schema='public'
AND table_name IN ('usuarios','eps_entidades','eps_farmacias','afiliados',
 'solicitudes','detalle_solicitud','pagos','medicamentos','formulas_medicas','administrative_audit')
ORDER BY table_name,ordinal_position;
SELECT c.relname AS tabla,x.conname,pg_get_constraintdef(x.oid) AS definicion,x.convalidated
FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('usuarios','eps_entidades','eps_farmacias',
 'solicitudes','detalle_solicitud','pagos','medicamentos','formulas_medicas')
ORDER BY c.relname,x.conname;
SELECT estado,simulacion,count(*) AS pagos FROM public.pagos GROUP BY estado,simulacion;
SELECT count(*) AS medicamentos,
 count(*) FILTER(WHERE requiere_formula IS NULL) AS requisito_desconocido,
 count(*) FILTER(WHERE requiere_formula=true) AS requieren_formula,
 count(*) FILTER(WHERE requiere_formula=false) AS no_requieren_formula
FROM public.medicamentos;
SELECT estado,count(*) AS solicitudes FROM public.solicitudes GROUP BY estado;
ROLLBACK;
