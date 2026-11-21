-- Fixture sintetica. Ejecutar solo en PGlite en memoria.
-- OPCIONAL, REQUIERE AUTORIZACIÓN SEPARADA DE SEGURIDAD.
-- Ejecutar SOLO en la base original EPS y por su administrador autorizado.
-- No cambiar/revocar el rol actual compartido, para no romper EPS/ADMINISTRADOR.
-- Falta aprovisionar contraseña/certificado por el gestor de secretos; no se
-- incluye una contraseña en SQL ni se cambia EPS_DATABASE_URL en esta sesión.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $guard$
BEGIN
 IF nullif(current_setting('saludclick.aprobacion_rol_eps',true),'') IS NULL THEN RAISE EXCEPTION 'Falta autorización de rol de lectura'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='saludclick_eps_lectura') THEN RAISE EXCEPTION 'El rol ya existe: inspeccionar sin sobrescribir'; END IF;
 IF to_regclass('public.afiliados') IS NULL OR to_regclass('public.eps') IS NULL THEN RAISE EXCEPTION 'Fuente EPS incorrecta'; END IF;
END $guard$;
CREATE ROLE saludclick_eps_lectura LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
 NOINHERIT NOREPLICATION NOBYPASSRLS;
DO $grant$
BEGIN
 IF NOT has_database_privilege('saludclick_eps_lectura',current_database(),'CONNECT') THEN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO saludclick_eps_lectura',current_database());
 END IF;
END $grant$;
GRANT USAGE ON SCHEMA public TO saludclick_eps_lectura;
GRANT SELECT ON TABLE public.afiliados,public.eps TO saludclick_eps_lectura;
DO $verify$
BEGIN
 IF EXISTS(SELECT 1 FROM (VALUES('public.afiliados'),('public.eps')) t(tabla)
 WHERE has_table_privilege('saludclick_eps_lectura',t.tabla,'INSERT')
 OR has_table_privilege('saludclick_eps_lectura',t.tabla,'UPDATE')
 OR has_table_privilege('saludclick_eps_lectura',t.tabla,'DELETE')
 OR has_table_privilege('saludclick_eps_lectura',t.tabla,'TRUNCATE')) THEN
 RAISE EXCEPTION 'PUBLIC u otra concesión permite escritura; revisar ACL antes de continuar'; END IF;
END $verify$;
COMMIT;
-- Después: aprovisionar secreto con autorización; reconectar con este rol y
-- repetir 01, esperando SELECT=true y las tres escrituras=false. El default
-- READ ONLY en la aplicación no sustituye las ACL de este rol.
