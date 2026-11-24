BEGIN;

ALTER TABLE ips_accesos ADD COLUMN responsable boolean NOT NULL DEFAULT false;
ALTER TABLE ips_accesos ADD COLUMN clinico boolean NOT NULL DEFAULT false;

CREATE TABLE farmacia_personal_dispensacion (
    usuario_id integer PRIMARY KEY REFERENCES usuarios(id),
    farmacia_id integer NOT NULL REFERENCES usuarios(id),
    perfil text NOT NULL CHECK (perfil IN ('RESPONSABLE','OPERATIVO','DOMICILIARIO')),
    activo boolean NOT NULL DEFAULT true
);
CREATE TRIGGER farmacia_personal_version AFTER INSERT OR UPDATE OR DELETE ON farmacia_personal_dispensacion
FOR EACH ROW EXECUTE FUNCTION revocar_sesion_membresia();

CREATE FUNCTION revocar_sesiones_equipo_farmacia() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE usuarios SET session_version=session_version + 1
    WHERE id IN (SELECT usuario_id FROM farmacia_personal_dispensacion WHERE farmacia_id=NEW.id AND usuario_id<>NEW.id);
    RETURN NULL;
END
$$;
CREATE TRIGGER farmacia_equipo_version AFTER UPDATE OF estado,rol_id ON usuarios
FOR EACH ROW WHEN ((OLD.rol_id=3 OR NEW.rol_id=3) AND (OLD.estado,OLD.rol_id) IS DISTINCT FROM (NEW.estado,NEW.rol_id))
EXECUTE FUNCTION revocar_sesiones_equipo_farmacia();

CREATE FUNCTION revocar_equipo_por_responsable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE usuarios SET session_version=session_version + 1
    WHERE id IN (SELECT usuario_id FROM farmacia_personal_dispensacion
        WHERE farmacia_id=OLD.usuario_id AND usuario_id<>OLD.usuario_id);
    RETURN NULL;
END
$$;
CREATE TRIGGER farmacia_responsable_version AFTER UPDATE OR DELETE ON farmacia_personal_dispensacion
FOR EACH ROW WHEN (OLD.perfil='RESPONSABLE') EXECUTE FUNCTION revocar_equipo_por_responsable();

CREATE TABLE dispensacion_habilitaciones (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id integer NOT NULL REFERENCES usuarios(id),
    usuario_id integer NOT NULL REFERENCES usuarios(id),
    ambito text NOT NULL,
    permiso text NOT NULL,
    activo boolean NOT NULL,
    revision text,
    fecha timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE dispensaciones_etapas (
    solicitud_id integer PRIMARY KEY REFERENCES solicitudes(id),
    ips_id varchar(80) NOT NULL REFERENCES ips_entidades(id),
    farmacia_id integer REFERENCES usuarios(id),
    vence_at timestamptz NOT NULL,
    estado text NOT NULL CHECK (estado IN ('AUTORIZADA','ASIGNADA','PREPARADA','EN_REPARTO','PARCIAL','ENTREGADA','CANCELADA','RECHAZADA')),
    autorizadas jsonb NOT NULL CHECK (jsonb_typeof(autorizadas)='object'),
    saldo jsonb NOT NULL CHECK (jsonb_typeof(saldo)='object'),
    plan jsonb NOT NULL CHECK (jsonb_typeof(plan)='array'),
    etapa_indice integer NOT NULL DEFAULT 0 CHECK (etapa_indice>=0),
    saldo_etapa jsonb NOT NULL DEFAULT '{}',
    preparadas jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(preparadas)='object'),
    domiciliario_id integer REFERENCES usuarios(id),
    visita_activa uuid,
    visita_iniciada boolean NOT NULL DEFAULT false
);
CREATE INDEX dispensaciones_domiciliario_idx ON dispensaciones_etapas (domiciliario_id) WHERE estado='EN_REPARTO';

CREATE TABLE dispensacion_eventos (
    solicitud_id integer NOT NULL REFERENCES dispensaciones_etapas(solicitud_id),
    clave uuid NOT NULL,
    actor_id integer NOT NULL REFERENCES usuarios(id),
    accion text NOT NULL,
    entrada jsonb NOT NULL,
    resultado jsonb NOT NULL,
    fecha timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (solicitud_id, clave)
);

CREATE TABLE dispensacion_constancias (
    visita_id uuid NOT NULL,
    tipo text NOT NULL CHECK (tipo IN ('TRATAMIENTO','RECEPCION')),
    solicitud_id integer NOT NULL REFERENCES dispensaciones_etapas(solicitud_id),
    firmante_id integer NOT NULL REFERENCES usuarios(id),
    version text NOT NULL,
    documento text NOT NULL,
    sha256 char(64) NOT NULL,
    fecha timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (visita_id, tipo)
);

CREATE TABLE dispensacion_receptores (
    visita_id uuid PRIMARY KEY,
    solicitud_id integer NOT NULL REFERENCES dispensaciones_etapas(solicitud_id),
    otorgante_id integer NOT NULL REFERENCES usuarios(id),
    receptor_id integer NOT NULL REFERENCES usuarios(id),
    fecha timestamptz NOT NULL DEFAULT clock_timestamp(),
    CHECK (otorgante_id<>receptor_id)
);

CREATE FUNCTION proteger_solicitud_por_etapas() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM dispensaciones_etapas WHERE solicitud_id=OLD.id) THEN
        RAISE EXCEPTION 'La solicitud se gestiona mediante dispensación por etapas.' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER solicitudes_proteger_dispensacion
BEFORE UPDATE OF estado ON solicitudes
FOR EACH ROW WHEN (OLD.estado IS DISTINCT FROM NEW.estado)
EXECUTE FUNCTION proteger_solicitud_por_etapas();

CREATE FUNCTION proteger_asignacion_historica() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.activa THEN
        PERFORM 1 FROM solicitudes WHERE id=NEW.solicitud_id FOR UPDATE;
        IF EXISTS (SELECT 1 FROM dispensaciones_etapas WHERE solicitud_id=NEW.solicitud_id) THEN
            RAISE EXCEPTION 'La solicitud se gestiona mediante dispensación por etapas.' USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER asignaciones_proteger_dispensacion
BEFORE INSERT OR UPDATE ON farmacia_asignaciones
FOR EACH ROW EXECUTE FUNCTION proteger_asignacion_historica();

COMMIT;
