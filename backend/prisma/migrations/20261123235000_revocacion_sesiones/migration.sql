BEGIN;

ALTER TABLE usuarios ADD COLUMN session_version integer NOT NULL DEFAULT 1;

CREATE FUNCTION cambiar_version_sesion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF (NEW.password, NEW.rol_id, NEW.estado, NEW.correo)
        IS DISTINCT FROM (OLD.password, OLD.rol_id, OLD.estado, OLD.correo) THEN
        NEW.session_version := OLD.session_version + 1;
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER usuarios_version_sesion
BEFORE UPDATE ON usuarios FOR EACH ROW EXECUTE FUNCTION cambiar_version_sesion();

CREATE FUNCTION revocar_sesion_membresia() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NULL; END IF;
    IF TG_OP = 'DELETE' THEN
        UPDATE usuarios SET session_version = session_version + 1 WHERE id = OLD.usuario_id;
    ELSIF TG_OP = 'INSERT' THEN
        UPDATE usuarios SET session_version = session_version + 1 WHERE id = NEW.usuario_id;
    ELSE
        UPDATE usuarios SET session_version = session_version + 1 WHERE id IN (OLD.usuario_id, NEW.usuario_id);
    END IF;
    RETURN NULL;
END
$$;

CREATE TRIGGER ips_membresia_version AFTER INSERT OR UPDATE OR DELETE ON ips_accesos
FOR EACH ROW EXECUTE FUNCTION revocar_sesion_membresia();
CREATE TRIGGER eps_membresia_version AFTER INSERT OR UPDATE OR DELETE ON eps_accesos
FOR EACH ROW EXECUTE FUNCTION revocar_sesion_membresia();
CREATE TRIGGER farmacia_sesion_version AFTER INSERT OR UPDATE OR DELETE ON farmacia_sesiones
FOR EACH ROW EXECUTE FUNCTION revocar_sesion_membresia();

CREATE FUNCTION revocar_sesion_entidad() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_TABLE_NAME = 'ips_entidades' THEN
        UPDATE usuarios SET session_version = session_version + 1
        WHERE id IN (SELECT usuario_id FROM ips_accesos WHERE ips_id = NEW.id);
    ELSE
        UPDATE usuarios SET session_version = session_version + 1
        WHERE id IN (SELECT usuario_id FROM eps_accesos WHERE eps_id = NEW.id);
    END IF;
    RETURN NULL;
END
$$;

CREATE TRIGGER ips_entidad_version AFTER UPDATE OF activa ON ips_entidades
FOR EACH ROW WHEN (OLD.activa IS DISTINCT FROM NEW.activa) EXECUTE FUNCTION revocar_sesion_entidad();
CREATE TRIGGER eps_entidad_version AFTER UPDATE OF activa ON eps_entidades
FOR EACH ROW WHEN (OLD.activa IS DISTINCT FROM NEW.activa) EXECUTE FUNCTION revocar_sesion_entidad();

COMMIT;
