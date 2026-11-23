-- Fixture sintetica. Ejecutar solo en PGlite en memoria.
-- SOLO LECTURA. Después del DDL; no ejecutado contra Neon en esta preparación.
-- Parámetros obligatorios para las métricas: saludclick.desde, saludclick.hasta,
-- saludclick.afiliados_activos_json. Este último es la lista de IDs (texto)
-- REVALIDADA en la fuente EPS 901 y cruzada con la cuenta activa rol 2 mediante
-- tipo + numero documental unicos y afiliado_id verificado exacto (reglas del
-- servicio). No usar todos los afiliados activos ni aceptar IDs del cliente.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='20s';
SET LOCAL TIME ZONE 'UTC';
SELECT table_name,column_name,data_type,is_nullable,column_default
FROM information_schema.columns WHERE table_schema='public'
AND (table_name LIKE 'farmacia_%' OR table_name IN
 ('notificaciones_farmacia','afiliado_cuentas_origen','solicitudes_ocultas_paciente'))
ORDER BY table_name,ordinal_position;
SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public'
AND (tablename LIKE 'farmacia_%' OR tablename IN
 ('notificaciones_farmacia','afiliado_cuentas_origen','solicitudes_ocultas_paciente')
 OR indexname='eps_farmacias_una_eps_activa_key') ORDER BY tablename,indexname;
SELECT t.relname AS tabla,c.conname,c.contype,c.convalidated,pg_get_constraintdef(c.oid)
FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public'
AND (t.relname LIKE 'farmacia_%' OR t.relname IN
 ('notificaciones_farmacia','afiliado_cuentas_origen','solicitudes_ocultas_paciente'))
ORDER BY t.relname,c.conname;
SELECT id,eps_id,farmacia_id,activa,version FROM public.eps_farmacias WHERE farmacia_id=904;
SELECT farmacia_id,count(*) FROM public.eps_farmacias WHERE activa
GROUP BY farmacia_id HAVING count(*)>1; -- cero filas
SELECT fa.solicitud_id,fa.farmacia_id FROM public.farmacia_asignaciones fa
JOIN public.solicitudes s ON s.id=fa.solicitud_id
LEFT JOIN public.afiliado_cuentas_origen a ON a.usuario_id=s.usuario_id
WHERE fa.activa AND fa.farmacia_id=904 AND (a.usuario_id IS NULL OR a.verificado_at IS NULL
 OR NOT EXISTS(SELECT 1 FROM public.eps_farmacias ef JOIN public.eps_entidades e ON e.id=ef.eps_id
 WHERE ef.farmacia_id=904 AND ef.activa AND e.activa AND ef.eps_id=a.eps_id)); -- cero filas
SELECT solicitud_id,estado,count(*) FROM public.farmacia_solicitud_eventos
GROUP BY solicitud_id,estado HAVING count(*)>1; -- cero filas
SELECT solicitud_id,medicamento_id,tipo,count(*) FROM public.farmacia_stock_eventos
WHERE solicitud_id IS NOT NULL GROUP BY solicitud_id,medicamento_id,tipo
HAVING count(*)>1; -- cero filas
SELECT farmacia_id,lower(btrim(referencia)) AS recepcion,medicamento_id,count(*)
FROM public.farmacia_stock_eventos WHERE tipo='INGRESO'
GROUP BY farmacia_id,lower(btrim(referencia)),medicamento_id
HAVING count(*)>1; -- cero filas; no corregir automáticamente
WITH movimientos AS (
 SELECT farmacia_id,medicamento_id,
 coalesce(sum(cantidad) FILTER(WHERE tipo='INGRESO'),0) AS ingresos,
 coalesce(sum(cantidad) FILTER(WHERE tipo='RESERVA'),0) AS reservas,
 coalesce(sum(cantidad) FILTER(WHERE tipo='ENTREGA'),0) AS entregas
 FROM public.farmacia_stock_eventos GROUP BY farmacia_id,medicamento_id
)
SELECT x.farmacia_id,x.medicamento_id,x.cantidad,x.reservado,
 coalesce(m.ingresos,0)-coalesce(m.entregas,0) AS fisico_segun_eventos,
 coalesce(m.reservas,0)-coalesce(m.entregas,0) AS reservado_segun_eventos
FROM public.farmacia_existencias x LEFT JOIN movimientos m USING(farmacia_id,medicamento_id)
WHERE x.cantidad<>coalesce(m.ingresos,0)-coalesce(m.entregas,0)
 OR x.reservado<>coalesce(m.reservas,0)-coalesce(m.entregas,0); -- cero filas
SELECT s.id FROM public.solicitudes s JOIN public.farmacia_asignaciones fa ON fa.solicitud_id=s.id
WHERE fa.farmacia_id=904 AND fa.activa AND s.estado IN ('PREPARANDO','LISTA')
AND NOT EXISTS(SELECT 1 FROM public.farmacia_stock_eventos e
 WHERE e.solicitud_id=s.id AND e.farmacia_id=904 AND e.tipo='RESERVA'); -- cero filas
DO $params$
BEGIN
 IF nullif(current_setting('saludclick.desde',true),'') IS NULL
 OR nullif(current_setting('saludclick.hasta',true),'') IS NULL
 OR nullif(current_setting('saludclick.afiliados_activos_json',true),'') IS NULL
 THEN RAISE EXCEPTION 'Falta periodo/lista de afiliados revalidada; no certificar estadísticas'; END IF;
 IF jsonb_typeof(current_setting('saludclick.afiliados_activos_json')::jsonb)<>'array'
 THEN RAISE EXCEPTION 'La lista de afiliados debe ser un array de IDs de texto'; END IF;
 IF current_setting('saludclick.desde')::date>current_setting('saludclick.hasta')::date
 THEN RAISE EXCEPTION 'Periodo inválido'; END IF;
END $params$;
WITH ambito AS (
 SELECT s.id,s.usuario_id,s.fecha,s.estado
 FROM public.solicitudes s JOIN public.farmacia_asignaciones fa ON fa.solicitud_id=s.id
 WHERE fa.farmacia_id=904 AND fa.activa
 AND (SELECT count(*) FROM public.eps_farmacias WHERE farmacia_id=904 AND activa)=1
 AND EXISTS(SELECT 1 FROM public.usuarios WHERE id=904 AND rol_id=3 AND estado='ACTIVO')
 AND EXISTS(SELECT 1 FROM public.eps_farmacias ef JOIN public.eps_entidades ee ON ee.id=ef.eps_id
 JOIN public.afiliado_cuentas_origen a ON a.eps_id=ef.eps_id AND a.usuario_id=s.usuario_id
 WHERE ef.farmacia_id=904 AND ef.activa AND ee.activa AND a.verificado_at IS NOT NULL
 AND a.afiliado_id IN(SELECT jsonb_array_elements_text(current_setting('saludclick.afiliados_activos_json')::jsonb)))
), entregas AS (
 SELECT a.usuario_id,e.cantidades FROM ambito a JOIN public.farmacia_solicitud_eventos e ON e.solicitud_id=a.id
 WHERE e.farmacia_id=904 AND e.estado='ENTREGADA'
 AND e.created_at>=current_setting('saludclick.desde')::date
 AND e.created_at<current_setting('saludclick.hasta')::date+interval '1 day'
)
SELECT (SELECT count(DISTINCT usuario_id) FROM entregas) AS pacientes_atendidos,
 (SELECT count(*) FROM entregas) AS solicitudes_completadas,
 (SELECT coalesce(sum((i->>'cantidad')::integer),0) FROM entregas CROSS JOIN LATERAL jsonb_array_elements(cantidades) i) AS unidades_entregadas,
 (SELECT count(*) FROM ambito WHERE estado IN('PENDIENTE','APROBADA','PREPARANDO','LISTA')
 AND fecha>=current_setting('saludclick.desde')::date AND fecha<current_setting('saludclick.hasta')::date+interval '1 day') AS solicitudes_pendientes,
 (SELECT count(*) FROM public.farmacia_existencias x JOIN public.medicamentos m ON m.id=x.medicamento_id
 WHERE x.farmacia_id=904 AND m.estado IS NOT NULL AND m.estado<>'INACTIVO' AND x.cantidad>x.reservado) AS referencias_disponibles;
SELECT destinatario_id,count(*) AS total,count(*) FILTER(WHERE leida_at IS NULL) AS no_leidas
FROM public.notificaciones_farmacia GROUP BY destinatario_id;
ROLLBACK;
