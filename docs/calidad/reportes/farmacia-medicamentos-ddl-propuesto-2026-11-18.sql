-- Propuesta para revisión de Medicamentos. Requiere autorización antes de ejecutar en Neon.
-- Subconjunto de 20261116180000_farmacia_operacion_autorizada. No modifica filas ni activa permisos.
BEGIN;
CREATE TABLE farmacia_catalogo_autorizaciones (
 farmacia_id integer PRIMARY KEY REFERENCES usuarios(id) ON DELETE RESTRICT,
 autorizado_por integer NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
 puede_crear boolean NOT NULL DEFAULT false,
 activa boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE farmacia_catalogo_ambitos (
 medicamento_id integer PRIMARY KEY REFERENCES medicamentos(id) ON DELETE RESTRICT,
 farmacia_id integer NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
 autorizado_por integer NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 activa boolean NOT NULL DEFAULT true
);
CREATE INDEX farmacia_catalogo_ambito_idx ON farmacia_catalogo_ambitos(farmacia_id,activa);
CREATE TABLE farmacia_catalogo_auditoria (
 id serial PRIMARY KEY,
 farmacia_id integer NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
 medicamento_id integer NOT NULL REFERENCES medicamentos(id) ON DELETE RESTRICT,
 accion varchar(20) NOT NULL CHECK(accion IN ('CREAR','EDITAR')),
 campos text[] NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE farmacia_autorizacion_eventos (
 id serial PRIMARY KEY,
 actor_id integer NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
 farmacia_id integer NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
 tipo varchar(30) NOT NULL,
 detalle jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
