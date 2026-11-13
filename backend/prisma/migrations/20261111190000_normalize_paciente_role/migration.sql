-- Corrección puntual del rol utilizado por Crear cuenta; no cambia IDs ni usuarios.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM "roles" WHERE "id" = 2 AND "nombre" IN ('usuario', 'USUARIO', 'paciente', 'PACIENTE')) THEN
        RAISE EXCEPTION 'El rol 2 no coincide con el rol de paciente revisado; operación cancelada.';
    END IF;
    IF EXISTS (SELECT 1 FROM "roles" WHERE "nombre" = 'PACIENTE' AND "id" <> 2) THEN
        RAISE EXCEPTION 'PACIENTE ya está asociado a otro identificador; operación cancelada.';
    END IF;
    UPDATE "roles" SET "nombre" = 'PACIENTE' WHERE "id" = 2 AND "nombre" <> 'PACIENTE';
END;
$$;
