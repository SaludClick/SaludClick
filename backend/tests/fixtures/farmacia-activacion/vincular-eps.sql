-- Fixture sintetica. Ejecutar solo en PGlite en memoria.
-- ALTERNATIVA AL ENDPOINT EXISTENTE, nunca ejecutar ambas por costumbre.
-- Requiere autorización del vínculo y de su actor. Conserva auditoría.
-- Parámetros de sesión obligatorios que el operador debe preparar SOLO tras
-- aprobación: saludclick.aprobacion_vinculo, saludclick.actor_admin,
-- saludclick.identidad_farmacia_confirmada='904:901'. No son banderas de la app.
-- No se asigna un actor ficticio ni se establece uno por defecto.
BEGIN ISOLATION LEVEL SERIALIZABLE;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $link$
DECLARE actor integer:=nullif(current_setting('saludclick.actor_admin',true),'')::integer;
        nuevo_id integer;
BEGIN
 IF actor IS NULL OR nullif(current_setting('saludclick.aprobacion_vinculo',true),'') IS NULL
 OR current_setting('saludclick.identidad_farmacia_confirmada',true) IS DISTINCT FROM '904:901'
 THEN RAISE EXCEPTION 'Falta aprobación del actor y de la identidad institucional Farmacia 904 / EPS 901'; END IF;
 PERFORM id FROM public.usuarios WHERE id=ANY(ARRAY[actor,904]) ORDER BY id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=actor AND rol_id=1 AND estado='ACTIVO')
 OR NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=904 AND rol_id=3 AND estado='ACTIVO')
 THEN RAISE EXCEPTION 'Actor o farmacia no vigentes'; END IF;
 PERFORM id FROM public.eps_entidades WHERE id='901' AND nombre='EPS Sintetica' AND activa FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'La EPS propuesta ya no coincide con la auditada'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_index i WHERE i.indexrelid=to_regclass('public.eps_farmacias_una_eps_activa_key')
 AND i.indrelid='public.eps_farmacias'::regclass AND i.indisunique AND i.indisvalid AND i.indisready
 AND i.indnkeyatts=1 AND i.indnatts=1
 AND i.indkey[0]=(SELECT attnum FROM pg_attribute WHERE attrelid=i.indrelid AND attname='farmacia_id')
 AND pg_get_expr(i.indpred,i.indrelid) IN ('activa','(activa = true)'))
 THEN RAISE EXCEPTION 'Falta protección única vigente'; END IF;
 IF EXISTS(SELECT 1 FROM public.eps_farmacias WHERE farmacia_id=904) THEN RAISE EXCEPTION 'El estado inicial cambió: consultar versión y usar el flujo existente, sin sobrescribir vínculos'; END IF;
 INSERT INTO public.eps_farmacias(eps_id,farmacia_id,activa,version,vinculada_at)
 VALUES('901',904,true,1,now()) RETURNING id INTO nuevo_id;
 INSERT INTO public.administrative_audit(actor_id,accion,entidad,registro_id,resultado,campos)
 VALUES(actor,'VINCULAR_EPS','FARMACIA','904','EXITO',ARRAY['eps_id','activa']);
 RAISE NOTICE 'Vínculo creado, id=%, version=1. Registrar en el acta de cambio.',nuevo_id;
END $link$;
SELECT id,eps_id,farmacia_id,activa,version FROM public.eps_farmacias WHERE farmacia_id=904;
COMMIT;
