CREATE TABLE dispensacion_adjuntos (
    id uuid PRIMARY KEY,
    solicitud_id integer NOT NULL REFERENCES dispensaciones_etapas(solicitud_id),
    visita_id uuid NOT NULL,
    farmacia_id integer NOT NULL REFERENCES usuarios(id),
    domiciliario_id integer NOT NULL REFERENCES usuarios(id),
    nombre varchar(120) NOT NULL,
    sha256 char(64) NOT NULL,
    contenido bytea NOT NULL CHECK (octet_length(contenido) BETWEEN 1 AND 5242880),
    fecha timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (solicitud_id, visita_id, sha256)
);
