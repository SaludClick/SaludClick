-- Preparada para revisión. Sin copiar stock global ni asignar existencias reales.
CREATE TABLE farmacia_existencias (
 farmacia_id integer NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
 medicamento_id integer NOT NULL REFERENCES medicamentos(id) ON DELETE RESTRICT,
 cantidad integer NOT NULL DEFAULT 0 CHECK(cantidad >= 0),
 reservado integer NOT NULL DEFAULT 0 CHECK(reservado >= 0 AND reservado <= cantidad),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(farmacia_id,medicamento_id)
);
CREATE TABLE farmacia_stock_eventos (
 id serial PRIMARY KEY,
 farmacia_id integer NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
 medicamento_id integer NOT NULL REFERENCES medicamentos(id) ON DELETE RESTRICT,
 solicitud_id integer REFERENCES solicitudes(id) ON DELETE RESTRICT,
 actor_id integer NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
 tipo varchar(12) NOT NULL CHECK(tipo IN ('INGRESO','RESERVA','ENTREGA')),
 cantidad integer NOT NULL CHECK(cantidad > 0),
 clave uuid NOT NULL,
 huella char(64) NOT NULL,
 referencia varchar(200) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((tipo='INGRESO' AND solicitud_id IS NULL) OR (tipo IN ('RESERVA','ENTREGA') AND solicitud_id IS NOT NULL)),
 UNIQUE(farmacia_id,clave,medicamento_id),
 UNIQUE(solicitud_id,medicamento_id,tipo),
 FOREIGN KEY(farmacia_id,medicamento_id) REFERENCES farmacia_existencias(farmacia_id,medicamento_id) ON DELETE RESTRICT
);
CREATE INDEX farmacia_stock_eventos_fecha_idx ON farmacia_stock_eventos(farmacia_id,created_at);
