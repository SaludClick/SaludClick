BEGIN;

ALTER TABLE usuarios ADD COLUMN correo_verificado_at timestamptz;
ALTER TABLE usuarios ADD COLUMN alta_diferenciada boolean NOT NULL DEFAULT false;
INSERT INTO roles (id, nombre, descripcion)
VALUES (5, 'DOMICILIARIO', 'Cuenta reservada para futuras asignaciones de entrega');
SELECT setval(pg_get_serial_sequence('roles', 'id'), GREATEST(5, (SELECT max(id) FROM roles)));

COMMIT;
