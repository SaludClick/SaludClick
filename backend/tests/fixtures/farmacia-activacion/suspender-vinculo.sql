-- Fixture sintetica. Ejecutar solo en PGlite en memoria.
-- OPCIONAL TRAS APROBAR CONTENCIÓN, no es un borrado ni una restauración.
-- Antes: retirar tráfico y deshabilitar JUNTAS las tres banderas globales.
-- No modifica existencias, pacientes, asignaciones o auditoría histórica.
-- Usar ID y versión registrados al crear el vínculo; ningún valor por defecto.
BEGIN ISOLATION LEVEL SERIALIZABLE;
SET LOCAL lock_timeout='3s';
DO $suspend$
DECLARE actor integer:=nullif(current_setting('saludclick.actor_admin',true),'')::integer;
 enlace integer:=nullif(current_setting('saludclick.vinculo_id',true),'')::integer;
 version_aprobada integer:=nullif(current_setting('saludclick.vinculo_version',true),'')::integer;
 afectados integer;
BEGIN
 IF actor IS NULL OR enlace IS NULL OR version_aprobada IS NULL
 OR nullif(current_setting('saludclick.aprobacion_suspension',true),'') IS NULL
 THEN RAISE EXCEPTION 'Faltan actor, ID, versión o aprobación de suspensión'; END IF;
 PERFORM id FROM public.usuarios WHERE id=ANY(ARRAY[actor,904]) ORDER BY id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=actor AND rol_id=1 AND estado='ACTIVO')
 THEN RAISE EXCEPTION 'Administrador no vigente'; END IF;
 UPDATE public.eps_farmacias SET activa=false,version=version+1
 WHERE id=enlace AND farmacia_id=904 AND eps_id='901' AND activa AND version=version_aprobada;
 GET DIAGNOSTICS afectados=ROW_COUNT;
 IF afectados<>1 THEN RAISE EXCEPTION 'El vínculo cambió o no coincide; no sobrescribir'; END IF;
 INSERT INTO public.administrative_audit(actor_id,accion,entidad,registro_id,resultado,campos)
 VALUES(actor,'SUSPENDER_VINCULO_EPS','FARMACIA','904','EXITO',ARRAY['activa','version']);
END $suspend$;
SELECT id,eps_id,farmacia_id,activa,version FROM public.eps_farmacias WHERE farmacia_id=904;
COMMIT;
