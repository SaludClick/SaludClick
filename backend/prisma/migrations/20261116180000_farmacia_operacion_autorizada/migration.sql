-- Propuesta NUEVA. No reconstruye migraciones históricas ni asigna datos existentes.
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
CREATE TABLE farmacia_sesiones (
 usuario_id integer PRIMARY KEY REFERENCES usuarios(id) ON DELETE RESTRICT,
 revocadas_at timestamptz NOT NULL DEFAULT now()
);
-- Solo una política administrativa explícita puede enrutar nuevas solicitudes.
-- eps_id referencia lógica a la fuente EPS original, sin copiar sus pacientes.
CREATE TABLE farmacia_rutas_eps (
 eps_id text PRIMARY KEY,
 farmacia_id integer NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
 autorizado_por integer NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
 activa boolean NOT NULL DEFAULT true,
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
-- Quitar del historial personal no debe borrar pedidos asignados ni su auditoría.
CREATE TABLE solicitudes_ocultas_paciente (
 usuario_id integer NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
 solicitud_id integer NOT NULL REFERENCES solicitudes(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(usuario_id,solicitud_id)
);
