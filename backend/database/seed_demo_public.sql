-- Optional synthetic catalog seed for isolated PostgreSQL demo environments.
-- Adds no user, administrator, patient, order, prescription, or payment rows.

BEGIN;

INSERT INTO roles (id, nombre, descripcion) VALUES
    (1, 'Administrador', 'Rol administrativo de SaludClick.'),
    (2, 'Usuario', 'Rol de usuario estándar.'),
    (3, 'Farmacia', 'Rol operativo de farmacia.')
ON CONFLICT DO NOTHING;

SELECT setval(
    pg_get_serial_sequence('roles', 'id'),
    GREATEST(COALESCE(MAX(id), 1), 1)
)
FROM roles;

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
