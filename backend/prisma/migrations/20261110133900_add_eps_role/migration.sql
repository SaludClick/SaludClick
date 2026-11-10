BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM roles
        WHERE id = 4 AND nombre <> 'EPS'
    ) THEN
        RAISE EXCEPTION 'Role id 4 is already assigned to a different role.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM roles
        WHERE nombre = 'EPS' AND id <> 4
    ) THEN
        RAISE EXCEPTION 'EPS role already exists with a different id.';
    END IF;

    INSERT INTO roles (id, nombre, descripcion)
    VALUES (4, 'EPS', 'Rol operativo de entidad promotora de salud.')
    ON CONFLICT (id) DO NOTHING;
END;
$$;

SELECT setval(
    pg_get_serial_sequence('roles', 'id'),
    GREATEST(
        COALESCE((SELECT MAX(id) FROM roles), 1),
        (SELECT last_value FROM roles_id_seq)
    ),
    true
);

COMMIT;
