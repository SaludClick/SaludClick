-- PREPARADA, NO EJECUTADA. Independiente de tablas clínicas y de la fuente EPS.
-- El preflight debe confirmar que no existen correos duplicados sin distinguir mayúsculas.
CREATE UNIQUE INDEX "usuarios_correo_casefold_administrative_key" ON "usuarios" (lower("correo"));
CREATE TABLE "administrative_cases" (
 "id" SERIAL PRIMARY KEY, "cliente_id" INTEGER NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
 "responsable_id" INTEGER REFERENCES "usuarios"("id") ON DELETE RESTRICT,
 "tipo" VARCHAR(20) NOT NULL CHECK (tipo IN ('SOLICITUD','CONVERSACION')),
 "asunto" VARCHAR(160) NOT NULL, "categoria" VARCHAR(30) NOT NULL,
 "estado" VARCHAR(20) NOT NULL DEFAULT 'ABIERTA' CHECK (estado IN ('ABIERTA','EN_ATENCION','RESUELTA','CERRADA')),
 "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(), "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
 "resuelta_at" TIMESTAMPTZ, "cerrada_at" TIMESTAMPTZ
);
CREATE INDEX ON "administrative_cases" ("cliente_id", "created_at");
CREATE INDEX ON "administrative_cases" ("tipo", "estado", "created_at");
CREATE TABLE "administrative_messages" (
 "id" SERIAL PRIMARY KEY, "caso_id" INTEGER NOT NULL REFERENCES "administrative_cases"("id") ON DELETE RESTRICT,
 "remitente_id" INTEGER NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
 "contenido" VARCHAR(2000) NOT NULL, "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(), "leido_at" TIMESTAMPTZ
);
CREATE INDEX ON "administrative_messages" ("caso_id", "id");
CREATE TABLE "administrative_notifications" (
 "id" SERIAL PRIMARY KEY, "destinatario_id" INTEGER NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
 "caso_id" INTEGER REFERENCES "administrative_cases"("id") ON DELETE RESTRICT,
 "tipo" VARCHAR(30) NOT NULL, "titulo" VARCHAR(160) NOT NULL,
 "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(), "leida_at" TIMESTAMPTZ
);
CREATE INDEX ON "administrative_notifications" ("destinatario_id", "leida_at", "created_at");
CREATE TABLE "administrative_audit" (
 "id" SERIAL PRIMARY KEY, "actor_id" INTEGER NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
 "accion" VARCHAR(60) NOT NULL, "entidad" VARCHAR(30) NOT NULL, "registro_id" VARCHAR(80) NOT NULL,
 "resultado" VARCHAR(20) NOT NULL DEFAULT 'EXITO', "campos" TEXT[] NOT NULL DEFAULT '{}',
 "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON "administrative_audit" ("created_at", "actor_id");
CREATE FUNCTION administrative_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Los registros de auditoría son inmutables'; END; $$;
CREATE TRIGGER administrative_audit_immutable BEFORE UPDATE OR DELETE ON "administrative_audit"
FOR EACH ROW EXECUTE FUNCTION administrative_audit_immutable();
CREATE TABLE "administrative_settings" (
 "clave" VARCHAR(50) PRIMARY KEY, "valor" JSONB NOT NULL, "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE "administrative_preferences" (
 "usuario_id" INTEGER PRIMARY KEY REFERENCES "usuarios"("id") ON DELETE RESTRICT,
 "notificaciones" BOOLEAN NOT NULL DEFAULT true, "compacto" BOOLEAN NOT NULL DEFAULT false,
 "sesiones_revocadas_at" TIMESTAMPTZ
);
