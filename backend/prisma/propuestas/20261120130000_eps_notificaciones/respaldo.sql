-- psql -X -qAt -v ON_ERROR_STOP=1 -o <respaldo-privado.sql> -f respaldo.sql
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path TO public, pg_catalog;

DO $guard$
BEGIN
 IF current_database() <> 'neondb' THEN RAISE EXCEPTION 'Base distinta de la verificada'; END IF;
 IF to_regprocedure('public.eps_notify_request()') IS NULL
    OR to_regprocedure('public.eps_route_shared_notifications()') IS NULL
    OR to_regprocedure('public.eps_notify_pharmacy_link()') IS NOT NULL
    OR EXISTS (SELECT FROM pg_trigger WHERE tgrelid='public.eps_farmacias'::regclass
               AND tgname='eps_pharmacy_link_notifications' AND NOT tgisinternal) THEN
  RAISE EXCEPTION 'Funciones o disparador distintos al estado previo esperado';
 END IF;
 IF NOT EXISTS (SELECT FROM pg_trigger WHERE tgrelid='public.solicitudes'::regclass
         AND tgname='eps_request_events' AND tgfoid='public.eps_notify_request()'::regprocedure AND tgenabled='O')
    OR NOT EXISTS (SELECT FROM pg_trigger WHERE tgrelid='public.eps_eventos'::regclass
         AND tgname='eps_shared_event_notifications' AND tgfoid='public.eps_route_shared_notifications()'::regprocedure AND tgenabled='O') THEN
  RAISE EXCEPTION 'Faltan disparadores activos requeridos';
 END IF;
 IF (SELECT count(*) FROM pg_proc p
     JOIN (VALUES
         ('public.eps_notify_request()'::regprocedure, 'd956fddaafd09cd1ef81951f2b8d248a'),
         ('public.eps_route_shared_notifications()'::regprocedure, 'd56bca82fcb3a88087e5d720a416ad75')
     ) AS esperado(oid,huella) ON p.oid=esperado.oid
     WHERE md5(btrim(replace(p.prosrc, E'\r\n', E'\n'), E'\r\n\t '))=esperado.huella
       AND NOT p.prosecdef AND p.proconfig IS NULL AND pg_has_role(p.proowner,'USAGE')) <> 2 THEN
  RAISE EXCEPTION 'Las funciones vigentes difieren de las revisadas o el usuario no puede reemplazarlas';
 END IF;
 IF NOT EXISTS (SELECT FROM pg_index i WHERE i.indrelid='public.eps_notificaciones_compartidas'::regclass
       AND i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NULL
       AND pg_get_indexdef(i.indexrelid) LIKE '%(usuario_id, clave)%') THEN
  RAISE EXCEPTION 'Falta el índice único de deduplicación';
 END IF;
END
$guard$;

SELECT linea FROM (VALUES
    (1, 'BEGIN;'),
    (2, 'SET LOCAL lock_timeout = ''5s'';'),
    (3, 'SET LOCAL search_path TO public, pg_catalog;'),
    (4, 'DROP TRIGGER IF EXISTS eps_pharmacy_link_notifications ON public.eps_farmacias;'),
    (5, 'DROP FUNCTION IF EXISTS public.eps_notify_pharmacy_link();'),
    (6, pg_get_functiondef('public.eps_route_shared_notifications()'::regprocedure) || ';'),
    (7, pg_get_functiondef('public.eps_notify_request()'::regprocedure) || ';'),
    (8, 'COMMIT;')
) AS salida(paso,linea) ORDER BY paso;
COMMIT;
