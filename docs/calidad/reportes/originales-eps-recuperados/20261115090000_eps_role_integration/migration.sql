BEGIN;
-- Additive integration: no existing order, payment or stock is rewritten.
ALTER TABLE eps_autorizaciones ADD COLUMN farmacia_vinculo_id INTEGER;
ALTER TABLE eps_autorizaciones ADD CONSTRAINT eps_autorizaciones_farmacia_vinculo_id_fkey FOREIGN KEY(farmacia_vinculo_id) REFERENCES eps_farmacias(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX eps_autorizaciones_farmacia_vinculo_id_estado_id_idx ON eps_autorizaciones(farmacia_vinculo_id,estado,id);
CREATE TABLE eps_notificaciones_compartidas (
 id SERIAL PRIMARY KEY, usuario_id INTEGER NOT NULL, rol_destinatario INTEGER NOT NULL CHECK(rol_destinatario IN (1,2,3,4)), eps_id VARCHAR(80) NOT NULL,
 clave VARCHAR(160) NOT NULL, tipo VARCHAR(30) NOT NULL, registro_id VARCHAR(150) NOT NULL,
 titulo VARCHAR(160) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, leida_at TIMESTAMPTZ,
 CONSTRAINT eps_notificaciones_compartidas_usuario_id_fkey FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT eps_notificaciones_compartidas_eps_id_fkey FOREIGN KEY(eps_id) REFERENCES eps_entidades(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX eps_notificaciones_compartidas_usuario_id_clave_key ON eps_notificaciones_compartidas(usuario_id,clave);
CREATE INDEX eps_notificaciones_compartidas_usuario_id_leida_at_id_idx ON eps_notificaciones_compartidas(usuario_id,leida_at,id);

CREATE OR REPLACE FUNCTION eps_validate_clinical_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='eps_autorizaciones' THEN
  IF NOT EXISTS(SELECT 1 FROM afiliados a WHERE a.id=NEW.afiliado_id AND a.eps_id=NEW.eps_id AND (NEW.solicitud_id IS NULL OR EXISTS(SELECT 1 FROM solicitudes s WHERE s.id=NEW.solicitud_id AND s.usuario_id=a.usuario_id))) THEN RAISE EXCEPTION 'EPS_SCOPE_MISMATCH' USING ERRCODE='23514'; END IF;
  IF NEW.farmacia_vinculo_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM eps_farmacias f JOIN usuarios u ON u.id=f.farmacia_id WHERE f.id=NEW.farmacia_vinculo_id AND f.eps_id=NEW.eps_id AND f.activa AND u.rol_id=3 AND u.estado='ACTIVO') THEN RAISE EXCEPTION 'EPS_PHARMACY_SCOPE_MISMATCH' USING ERRCODE='23514'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM solicitudes s JOIN afiliados a ON a.usuario_id=s.usuario_id WHERE s.id=NEW.solicitud_id AND a.eps_id=NEW.eps_id) THEN RAISE EXCEPTION 'EPS_SCOPE_MISMATCH' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION eps_route_shared_notifications() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO eps_notificaciones_compartidas(usuario_id,rol_destinatario,eps_id,clave,tipo,registro_id,titulo)
 SELECT DISTINCT u.id,u.rol_id,NEW.eps_id,'EPS_EVENTO:'||NEW.id::text,NEW.tipo,NEW.registro_id,
  CASE NEW.tipo WHEN 'AUTORIZACION' THEN 'Actualizacion de una autorizacion EPS' WHEN 'SOLICITUD' THEN 'Actualizacion de tu solicitud' WHEN 'INVENTARIO' THEN 'Actualizacion de existencias del convenio EPS' WHEN 'FARMACIA' THEN 'Cambio en un convenio EPS' WHEN 'AFILIADO' THEN 'Actualizacion de afiliacion EPS' ELSE 'Actualizacion de configuracion EPS' END
 FROM usuarios u LEFT JOIN administrative_preferences p ON p.usuario_id=u.id
 WHERE u.estado='ACTIVO' AND COALESCE(p.notificaciones,true) AND u.id IN (
  SELECT x.usuario_id FROM eps_accesos x JOIN eps_entidades e ON e.id=x.eps_id JOIN usuarios z ON z.id=x.usuario_id WHERE x.eps_id=NEW.eps_id AND x.activo AND e.activa AND z.rol_id=4
  UNION
  SELECT a.usuario_id FROM eps_autorizaciones v JOIN afiliados a ON a.id=v.afiliado_id JOIN usuarios z ON z.id=a.usuario_id WHERE NEW.tipo='AUTORIZACION' AND v.id::text=NEW.registro_id AND v.eps_id=NEW.eps_id AND a.eps_id=NEW.eps_id AND z.rol_id=2
  UNION
  SELECT s.usuario_id FROM solicitudes s JOIN afiliados a ON a.usuario_id=s.usuario_id JOIN usuarios z ON z.id=s.usuario_id WHERE NEW.tipo='SOLICITUD' AND s.id::text=NEW.registro_id AND a.eps_id=NEW.eps_id AND z.rol_id=2
  UNION
  SELECT a.usuario_id FROM afiliados a JOIN usuarios z ON z.id=a.usuario_id WHERE NEW.tipo='AFILIADO' AND a.id=NEW.registro_id AND a.eps_id=NEW.eps_id AND z.rol_id=2
  UNION
  SELECT f.farmacia_id FROM eps_autorizaciones v JOIN eps_farmacias f ON f.id=v.farmacia_vinculo_id JOIN usuarios z ON z.id=f.farmacia_id WHERE v.eps_id=NEW.eps_id AND f.eps_id=NEW.eps_id AND f.activa AND v.estado='APROBADA' AND z.rol_id=3 AND ((NEW.tipo='AUTORIZACION' AND v.id::text=NEW.registro_id) OR (NEW.tipo='SOLICITUD' AND v.solicitud_id::text=NEW.registro_id))
  UNION
  SELECT f.farmacia_id FROM eps_existencias x JOIN eps_farmacias f ON f.id=x.vinculo_id JOIN usuarios z ON z.id=f.farmacia_id WHERE NEW.tipo='INVENTARIO' AND x.id::text=NEW.registro_id AND f.eps_id=NEW.eps_id AND f.activa AND z.rol_id=3
  UNION
  SELECT f.farmacia_id FROM eps_farmacias f JOIN usuarios z ON z.id=f.farmacia_id WHERE NEW.tipo='FARMACIA' AND f.id::text=NEW.registro_id AND f.eps_id=NEW.eps_id AND z.rol_id=3
  UNION
  SELECT z.id FROM usuarios z WHERE NEW.tipo='CONFIGURACION' AND z.rol_id=1
 ) ON CONFLICT(usuario_id,clave) DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER eps_shared_event_notifications AFTER INSERT ON eps_eventos FOR EACH ROW EXECUTE FUNCTION eps_route_shared_notifications();

CREATE FUNCTION eps_sync_shared_read_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE eps_notificaciones_compartidas SET leida_at=COALESCE(leida_at,NEW.leida_at) WHERE usuario_id=NEW.usuario_id AND clave='EPS_EVENTO:'||NEW.evento_id::text;
 RETURN NEW;
END $$;
CREATE TRIGGER eps_shared_receipt AFTER INSERT ON eps_lecturas FOR EACH ROW EXECUTE FUNCTION eps_sync_shared_read_receipt();
COMMIT;
