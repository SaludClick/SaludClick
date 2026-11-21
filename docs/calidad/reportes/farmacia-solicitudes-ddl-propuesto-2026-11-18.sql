-- Propuesta para revisión. No ejecutar sin autorización explícita.
-- DDL extraído de 20261116180000_farmacia_operacion_autorizada.
-- Crea únicamente las tablas requeridas por Solicitudes, identidad, auditoría y sesión.
BEGIN;
CREATE TABLE farmacia_asignaciones (
 solicitud_id integer PRIMARY KEY REFERENCES solicitudes(id) ON DELETE RESTRICT,
 farmacia_id integer NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
 asignado_por integer NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
 asignada_at timestamptz NOT NULL DEFAULT now(),
 activa boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1 CHECK(version > 0)
);
CREATE INDEX farmacia_asignaciones_ambito_idx ON farmacia_asignaciones(farmacia_id,activa,solicitud_id);
CREATE TABLE farmacia_solicitud_eventos (
 id serial PRIMARY KEY,
 solicitud_id integer NOT NULL REFERENCES solicitudes(id) ON DELETE RESTRICT,
 farmacia_id integer NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
 actor_id integer NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
 estado_anterior varchar(20) NOT NULL,
 estado varchar(20) NOT NULL,
 clave uuid NOT NULL,
 huella char(64) NOT NULL,
 recepcion varchar(500),
 observaciones varchar(500),
 cantidades jsonb NOT NULL DEFAULT '[]',
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(farmacia_id,clave),
 CHECK ((estado_anterior='APROBADA' AND estado='PREPARANDO') OR
        (estado_anterior='PREPARANDO' AND estado='LISTA') OR
        (estado_anterior='LISTA' AND estado='ENTREGADA')),
 CHECK (estado <> 'ENTREGADA' OR (recepcion IS NOT NULL AND length(btrim(recepcion)) > 0)),
 CHECK (jsonb_typeof(cantidades)='array'),
 CHECK (estado <> 'ENTREGADA' OR jsonb_array_length(cantidades)>0)
);
CREATE INDEX farmacia_eventos_solicitud_idx ON farmacia_solicitud_eventos(solicitud_id,id);
CREATE INDEX farmacia_eventos_fecha_idx ON farmacia_solicitud_eventos(farmacia_id,created_at);
CREATE UNIQUE INDEX farmacia_evento_estado_key ON farmacia_solicitud_eventos(solicitud_id,estado);
CREATE TABLE farmacia_formulas_autorizadas (
 solicitud_id integer NOT NULL REFERENCES solicitudes(id) ON DELETE RESTRICT,
 formula_id integer NOT NULL REFERENCES formulas_medicas(id) ON DELETE RESTRICT,
 autorizado_por integer NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
 activa boolean NOT NULL DEFAULT true,
 permite_descarga boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(solicitud_id,formula_id)
);

CREATE TABLE farmacia_sesiones (
 usuario_id integer PRIMARY KEY REFERENCES usuarios(id) ON DELETE RESTRICT,
 revocadas_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE farmacia_autorizacion_eventos (
 id serial PRIMARY KEY,
 actor_id integer NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
 farmacia_id integer NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
 tipo varchar(30) NOT NULL,
 detalle jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE afiliado_cuentas_origen (
 usuario_id integer PRIMARY KEY REFERENCES usuarios(id) ON DELETE RESTRICT,
 afiliado_id text NOT NULL UNIQUE,
 eps_id text NOT NULL,
 verificado_por integer NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
 verificado_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
