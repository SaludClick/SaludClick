BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path TO public, pg_catalog;
-- Propuesta pendiente de autorización. Todavía no forma parte del catálogo activo de Prisma.
-- Conservar los destinatarios de otros roles en los eventos legados de solicitudes.
-- EPS recibe un único evento por cambio, a partir de la afiliación acreditada.
CREATE OR REPLACE FUNCTION eps_route_shared_notifications() RETURNS trigger
LANGUAGE plpgsql SET search_path TO pg_catalog, public, pg_temp AS $$
BEGIN
 INSERT INTO eps_notificaciones_compartidas(usuario_id,rol_destinatario,eps_id,clave,tipo,registro_id,titulo)
 SELECT DISTINCT u.id,u.rol_id,NEW.eps_id,'EPS_EVENTO:'||NEW.id::text,NEW.tipo,NEW.registro_id,
  CASE NEW.tipo WHEN 'SOLICITUD_NUEVA' THEN 'Nueva solicitud EPS' WHEN 'SOLICITUD_ESTADO' THEN 'Estado de solicitud actualizado' WHEN 'FARMACIA_VINCULADA' THEN 'Farmacia vinculada' WHEN 'FARMACIA_DESVINCULADA' THEN 'Farmacia desvinculada' WHEN 'AUTORIZACION' THEN 'Actualizacion de una autorizacion EPS' WHEN 'SOLICITUD' THEN 'Actualizacion de tu solicitud' WHEN 'INVENTARIO' THEN 'Actualizacion de existencias del convenio EPS' WHEN 'FARMACIA' THEN 'Cambio en un convenio EPS' WHEN 'AFILIADO' THEN 'Actualizacion de afiliacion EPS' ELSE 'Actualizacion de configuracion EPS' END
 FROM usuarios u LEFT JOIN administrative_preferences p ON p.usuario_id=u.id
 WHERE u.estado='ACTIVO' AND (u.rol_id <> 4 OR NEW.tipo <> 'SOLICITUD') AND COALESCE(p.notificaciones,true) AND u.id IN (
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

CREATE OR REPLACE FUNCTION eps_notify_request() RETURNS trigger
LANGUAGE plpgsql SET search_path TO pg_catalog, public, pg_temp AS $$
BEGIN
 IF TG_OP = 'UPDATE' THEN
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN RETURN NEW; END IF;
 END IF;

 INSERT INTO eps_eventos(eps_id, tipo, registro_id, titulo, detalle)
 SELECT e.id, 'SOLICITUD', NEW.id::text,
  CASE WHEN TG_OP='INSERT' THEN 'Nueva solicitud de paciente' ELSE 'Estado operativo de solicitud actualizado' END,
  jsonb_build_object('estado',NEW.estado)
 FROM afiliados a JOIN eps_entidades e ON e.id=a.eps_id AND e.activa
 WHERE a.usuario_id=NEW.usuario_id;

 INSERT INTO eps_eventos(eps_id, tipo, registro_id, titulo, detalle)
 SELECT a.eps_id,
  CASE WHEN TG_OP='INSERT' THEN 'SOLICITUD_NUEVA' ELSE 'SOLICITUD_ESTADO' END,
  NEW.id::text,
  CASE WHEN TG_OP='INSERT' THEN 'Nueva solicitud EPS' ELSE 'Estado de solicitud actualizado' END,
  '{}'::jsonb
 FROM afiliado_cuentas_origen a
 JOIN usuarios u ON u.id=a.usuario_id AND u.rol_id=2 AND u.estado='ACTIVO'
 JOIN eps_entidades e ON e.id=a.eps_id AND e.activa
 WHERE a.usuario_id=NEW.usuario_id AND a.verificado_at IS NOT NULL;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION eps_notify_pharmacy_link() RETURNS trigger
LANGUAGE plpgsql SET search_path TO pg_catalog, public, pg_temp AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
  IF NOT NEW.activa THEN RETURN NEW; END IF;
 ELSIF NEW.activa IS NOT DISTINCT FROM OLD.activa THEN
  RETURN NEW;
 END IF;

 INSERT INTO eps_eventos(eps_id,tipo,registro_id,titulo,detalle)
 VALUES (NEW.eps_id,
  CASE WHEN NEW.activa THEN 'FARMACIA_VINCULADA' ELSE 'FARMACIA_DESVINCULADA' END,
  NEW.farmacia_id::text,
  CASE WHEN NEW.activa THEN 'Farmacia vinculada' ELSE 'Farmacia desvinculada' END,
  '{}'::jsonb);
 RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS eps_pharmacy_link_notifications ON eps_farmacias;
CREATE TRIGGER eps_pharmacy_link_notifications AFTER INSERT OR UPDATE OF activa ON eps_farmacias
 FOR EACH ROW EXECUTE FUNCTION eps_notify_pharmacy_link();
-- Recuperar lecturas de ambas representaciones, conservando el primer recibo.
INSERT INTO eps_lecturas(evento_id, usuario_id, leida_at)
SELECT e.id, n.usuario_id, n.leida_at
FROM eps_notificaciones_compartidas n
JOIN eps_eventos e ON n.eps_id=e.eps_id AND n.clave='EPS_EVENTO:'||e.id::text
JOIN eps_accesos a ON a.usuario_id=n.usuario_id
WHERE n.rol_destinatario=4 AND n.leida_at IS NOT NULL
ON CONFLICT(evento_id, usuario_id) DO NOTHING;

UPDATE eps_notificaciones_compartidas n
SET leida_at=l.leida_at
FROM eps_lecturas l JOIN eps_eventos e ON e.id=l.evento_id
WHERE n.usuario_id=l.usuario_id AND n.eps_id=e.eps_id
  AND n.rol_destinatario=4 AND n.clave='EPS_EVENTO:'||e.id::text
  AND n.leida_at IS NULL;
COMMIT;
