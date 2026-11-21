-- Fixture de prueba. El alcance corresponde a entidades ficticias de PGlite.
BEGIN ISOLATION LEVEL SERIALIZABLE;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

DO $revert$
DECLARE
    actor integer := nullif(current_setting('saludclick.actor_admin', true), '')::integer;
    vinculo integer := nullif(current_setting('saludclick.vinculo_id', true), '')::integer;
    version_esperada integer := nullif(current_setting('saludclick.vinculo_version', true), '')::integer;
BEGIN
    IF actor IS NULL OR vinculo IS NULL OR version_esperada IS NULL
        OR nullif(current_setting('saludclick.aprobacion_reversion', true), '') IS NULL
    THEN RAISE EXCEPTION 'Faltan actor, vínculo/version exactos o aprobación'; END IF;

    PERFORM id FROM public.usuarios WHERE id = ANY(ARRAY[actor, 904]) ORDER BY id FOR UPDATE;
    IF NOT EXISTS (
        SELECT 1 FROM public.usuarios WHERE id = actor AND rol_id = 1 AND estado = 'ACTIVO'
    ) THEN RAISE EXCEPTION 'Administrador no vigente'; END IF;

    UPDATE public.eps_farmacias SET activa = false, version = version + 1
    WHERE id = vinculo AND farmacia_id = 904 AND eps_id = 'EPS-FIXTURE-901'
        AND activa AND version = version_esperada;
    IF NOT FOUND THEN RAISE EXCEPTION 'El vínculo cambió; no sobrescribir su estado'; END IF;

    INSERT INTO public.administrative_audit(actor_id, accion, entidad, registro_id, resultado, campos)
    VALUES (actor, 'DESVINCULAR_EPS', 'FARMACIA', '904', 'EXITO', ARRAY['eps_id', 'activa']);
END $revert$;

SELECT id, eps_id, farmacia_id, activa, version FROM public.eps_farmacias WHERE farmacia_id = 904;
COMMIT;
