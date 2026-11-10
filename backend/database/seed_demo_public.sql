-- Optional synthetic catalog seed for isolated PostgreSQL demo environments.
-- Adds no user, administrator, patient, order, prescription, or payment rows.

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM roles WHERE id = 1 AND nombre <> 'ADMINISTRADOR')
       OR EXISTS (SELECT 1 FROM roles WHERE id = 2 AND nombre <> 'PACIENTE')
       OR EXISTS (
           SELECT 1 FROM roles
           WHERE id = 3
             AND nombre <> 'FARMACIA'
             AND NOT (
                 nombre ~ '^it_[0-9a-f]{12}$'
                 AND descripcion = 'PostgreSQL integration fixture'
             )
       )
       OR EXISTS (SELECT 1 FROM roles WHERE id = 4 AND nombre <> 'EPS') THEN
        RAISE EXCEPTION 'Conflicto: un ID canónico está asignado a otro rol.';
    END IF;

    IF EXISTS (SELECT 1 FROM roles WHERE upper(nombre) = 'ADMINISTRADOR' AND id <> 1)
       OR EXISTS (SELECT 1 FROM roles WHERE upper(nombre) = 'PACIENTE' AND id <> 2)
       OR EXISTS (SELECT 1 FROM roles WHERE upper(nombre) = 'FARMACIA' AND id <> 3)
       OR EXISTS (SELECT 1 FROM roles WHERE upper(nombre) = 'EPS' AND id <> 4) THEN
        RAISE EXCEPTION 'Conflicto: un nombre canónico está asignado a otro ID.';
    END IF;
END;
$$;

INSERT INTO roles (id, nombre, descripcion)
SELECT role.id, role.nombre, role.descripcion
FROM (VALUES
    (1, 'ADMINISTRADOR', 'Rol administrativo de SaludClick.'),
    (2, 'PACIENTE', 'Rol de paciente de SaludClick.'),
    (3, 'FARMACIA', 'Rol operativo de farmacia.'),
    (4, 'EPS', 'Rol operativo de entidad promotora de salud.')
) AS role(id, nombre, descripcion)
WHERE NOT EXISTS (
    SELECT 1 FROM roles existing_role WHERE existing_role.id = role.id
);

UPDATE roles
SET nombre = 'FARMACIA'
WHERE id = 3
  AND nombre ~ '^it_[0-9a-f]{12}$'
  AND descripcion = 'PostgreSQL integration fixture';

DO $$
DECLARE
    sequence_name text;
    sequence_last bigint;
    sequence_called boolean;
    max_role_id bigint;
    next_role_id bigint;
BEGIN
    sequence_name := pg_get_serial_sequence('public.roles', 'id');
    IF sequence_name IS NULL THEN
        RAISE EXCEPTION 'No se encontró la secuencia de roles.id.';
    END IF;

    EXECUTE format('SELECT last_value, is_called FROM %s', sequence_name::regclass)
        INTO sequence_last, sequence_called;
    SELECT COALESCE(MAX(id), 0) INTO max_role_id FROM roles;

    next_role_id := GREATEST(
        max_role_id + 1,
        sequence_last + CASE WHEN sequence_called THEN 1 ELSE 0 END
    );
    EXECUTE format(
        'ALTER SEQUENCE %s RESTART WITH %s',
        sequence_name::regclass,
        next_role_id
    );
END;
$$;

INSERT INTO categorias (nombre, descripcion)
SELECT 'Categoría de demostración', 'Categoría ficticia para pruebas locales.'
WHERE NOT EXISTS (
    SELECT 1 FROM categorias WHERE nombre = 'Categoría de demostración'
);

INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado)
SELECT 'Producto ficticio de demostración A',
       'Artículo sintético sin principio activo; no es un medicamento.',
       c.id, 1.00, 10, '/images/medicamentos/medicamento-generico.svg', 'DISPONIBLE'
FROM categorias c
WHERE c.nombre = 'Categoría de demostración'
  AND NOT EXISTS (
      SELECT 1 FROM medicamentos m WHERE m.nombre = 'Producto ficticio de demostración A'
  );

INSERT INTO medicamentos (nombre, descripcion, categoria_id, precio, stock, imagen, estado)
SELECT 'Producto ficticio de demostración B',
       'Artículo sintético sin principio activo; no es un medicamento.',
       c.id, 2.00, 5, '/images/medicamentos/medicamento-generico.svg', 'DISPONIBLE'
FROM categorias c
WHERE c.nombre = 'Categoría de demostración'
  AND NOT EXISTS (
      SELECT 1 FROM medicamentos m WHERE m.nombre = 'Producto ficticio de demostración B'
  );

COMMIT;
