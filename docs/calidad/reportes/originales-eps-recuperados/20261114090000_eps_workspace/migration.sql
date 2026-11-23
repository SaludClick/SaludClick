BEGIN;

-- The primary database may not have the affiliate table yet. Creating an empty
-- local table does not import or modify the separate EPS source database.
CREATE TABLE IF NOT EXISTS "afiliados" (
 "id" TEXT NOT NULL, "nombres" TEXT NOT NULL, "apellidos" TEXT NOT NULL,
 "tipo_documento" TEXT NOT NULL, "documento" TEXT NOT NULL,
 "fecha_nacimiento" TEXT NOT NULL, "telefono" TEXT NOT NULL,
 "correo" TEXT NOT NULL, "direccion" TEXT NOT NULL, "ciudad" TEXT NOT NULL,
 "regimen" TEXT NOT NULL, "estado" TEXT NOT NULL, "eps_id" TEXT NOT NULL,
 "usuario_id" INTEGER, "verificado_por" INTEGER, "verificado_at" TIMESTAMP(3),
 CONSTRAINT "afiliados_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "afiliados_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "afiliados_verificado_por_fkey" FOREIGN KEY ("verificado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "afiliados_documento_key" ON "afiliados"("documento");
CREATE UNIQUE INDEX IF NOT EXISTS "afiliados_usuario_id_key" ON "afiliados"("usuario_id");

-- AlterTable
ALTER TABLE "afiliados" ADD COLUMN     "eps_version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "eps_entidades" (
    "id" VARCHAR(80) NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "nit" VARCHAR(30) NOT NULL,
    "correo" VARCHAR(150) NOT NULL,
    "telefono" VARCHAR(20) NOT NULL,
    "direccion" VARCHAR(255) NOT NULL,
    "ciudad" VARCHAR(100) NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "eps_entidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eps_accesos" (
    "usuario_id" INTEGER NOT NULL,
    "eps_id" VARCHAR(80) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "revocado_at" TIMESTAMPTZ,

    CONSTRAINT "eps_accesos_pkey" PRIMARY KEY ("usuario_id")
);

-- CreateTable
CREATE TABLE "eps_farmacias" (
    "id" SERIAL NOT NULL,
    "eps_id" VARCHAR(80) NOT NULL,
    "farmacia_id" INTEGER NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "vinculada_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eps_farmacias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eps_existencias" (
    "id" SERIAL NOT NULL,
    "vinculo_id" INTEGER NOT NULL,
    "medicamento_id" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "minimo" INTEGER NOT NULL DEFAULT 5,
    "actualizado_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eps_existencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eps_autorizaciones" (
    "id" SERIAL NOT NULL,
    "eps_id" VARCHAR(80) NOT NULL,
    "afiliado_id" TEXT NOT NULL,
    "solicitud_id" INTEGER,
    "concepto" VARCHAR(1000) NOT NULL,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    "motivo" VARCHAR(1000) NOT NULL,
    "responsable_id" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eps_autorizaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eps_seguimientos" (
    "id" SERIAL NOT NULL,
    "eps_id" VARCHAR(80) NOT NULL,
    "solicitud_id" INTEGER NOT NULL,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'ABIERTA',
    "motivo" VARCHAR(1000) NOT NULL,
    "responsable_id" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eps_seguimientos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eps_eventos" (
    "id" SERIAL NOT NULL,
    "eps_id" VARCHAR(80) NOT NULL,
    "actor_id" INTEGER,
    "tipo" VARCHAR(30) NOT NULL,
    "registro_id" VARCHAR(150) NOT NULL,
    "titulo" VARCHAR(160) NOT NULL,
    "detalle" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eps_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eps_lecturas" (
    "evento_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "leida_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eps_lecturas_pkey" PRIMARY KEY ("evento_id","usuario_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "eps_entidades_nit_key" ON "eps_entidades"("nit");

-- CreateIndex
CREATE INDEX "eps_accesos_eps_id_activo_idx" ON "eps_accesos"("eps_id", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "eps_farmacias_eps_id_farmacia_id_key" ON "eps_farmacias"("eps_id", "farmacia_id");

-- CreateIndex
CREATE UNIQUE INDEX "eps_existencias_vinculo_id_medicamento_id_key" ON "eps_existencias"("vinculo_id", "medicamento_id");

-- CreateIndex
CREATE INDEX "eps_autorizaciones_eps_id_estado_id_idx" ON "eps_autorizaciones"("eps_id", "estado", "id");

-- CreateIndex
CREATE UNIQUE INDEX "eps_seguimientos_eps_id_solicitud_id_key" ON "eps_seguimientos"("eps_id", "solicitud_id");

-- CreateIndex
CREATE INDEX "eps_eventos_eps_id_id_idx" ON "eps_eventos"("eps_id", "id");

-- AddForeignKey
ALTER TABLE "eps_accesos" ADD CONSTRAINT "eps_accesos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eps_accesos" ADD CONSTRAINT "eps_accesos_eps_id_fkey" FOREIGN KEY ("eps_id") REFERENCES "eps_entidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eps_farmacias" ADD CONSTRAINT "eps_farmacias_eps_id_fkey" FOREIGN KEY ("eps_id") REFERENCES "eps_entidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eps_farmacias" ADD CONSTRAINT "eps_farmacias_farmacia_id_fkey" FOREIGN KEY ("farmacia_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eps_existencias" ADD CONSTRAINT "eps_existencias_vinculo_id_fkey" FOREIGN KEY ("vinculo_id") REFERENCES "eps_farmacias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eps_existencias" ADD CONSTRAINT "eps_existencias_medicamento_id_fkey" FOREIGN KEY ("medicamento_id") REFERENCES "medicamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eps_autorizaciones" ADD CONSTRAINT "eps_autorizaciones_eps_id_fkey" FOREIGN KEY ("eps_id") REFERENCES "eps_entidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eps_autorizaciones" ADD CONSTRAINT "eps_autorizaciones_afiliado_id_fkey" FOREIGN KEY ("afiliado_id") REFERENCES "afiliados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eps_autorizaciones" ADD CONSTRAINT "eps_autorizaciones_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eps_seguimientos" ADD CONSTRAINT "eps_seguimientos_eps_id_fkey" FOREIGN KEY ("eps_id") REFERENCES "eps_entidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eps_seguimientos" ADD CONSTRAINT "eps_seguimientos_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eps_eventos" ADD CONSTRAINT "eps_eventos_eps_id_fkey" FOREIGN KEY ("eps_id") REFERENCES "eps_entidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eps_lecturas" ADD CONSTRAINT "eps_lecturas_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "eps_eventos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eps_lecturas" ADD CONSTRAINT "eps_lecturas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "eps_accesos"("usuario_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- EPS-only integrity rules. No existing records are assigned or rewritten.
ALTER TABLE eps_existencias ADD CONSTRAINT eps_stock_nonnegative CHECK (stock >= 0 AND minimo >= 0);
ALTER TABLE eps_autorizaciones ADD CONSTRAINT eps_authorization_state CHECK (estado IN ('PENDIENTE','APROBADA','RECHAZADA'));
ALTER TABLE eps_seguimientos ADD CONSTRAINT eps_followup_state CHECK (estado IN ('ABIERTA','EN_REVISION','RESUELTA','CERRADA'));
ALTER TABLE eps_autorizaciones ADD CONSTRAINT eps_authorization_actor FOREIGN KEY (responsable_id) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE eps_seguimientos ADD CONSTRAINT eps_followup_actor FOREIGN KEY (responsable_id) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE eps_eventos ADD CONSTRAINT eps_event_actor FOREIGN KEY (actor_id) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX eps_affiliate_scope ON afiliados(eps_id, estado, id);
CREATE INDEX eps_affiliate_patient ON afiliados(eps_id, usuario_id);

CREATE FUNCTION eps_validate_clinical_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME = 'eps_autorizaciones' THEN
  IF NOT EXISTS (SELECT 1 FROM afiliados a WHERE a.id=NEW.afiliado_id AND a.eps_id=NEW.eps_id AND (NEW.solicitud_id IS NULL OR EXISTS (SELECT 1 FROM solicitudes s WHERE s.id=NEW.solicitud_id AND s.usuario_id=a.usuario_id))) THEN
   RAISE EXCEPTION 'EPS_SCOPE_MISMATCH' USING ERRCODE='23514';
  END IF;
 ELSE
  IF NOT EXISTS (SELECT 1 FROM solicitudes s JOIN afiliados a ON a.usuario_id=s.usuario_id WHERE s.id=NEW.solicitud_id AND a.eps_id=NEW.eps_id) THEN
   RAISE EXCEPTION 'EPS_SCOPE_MISMATCH' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER eps_authorization_scope BEFORE INSERT OR UPDATE ON eps_autorizaciones FOR EACH ROW EXECUTE FUNCTION eps_validate_clinical_scope();
CREATE TRIGGER eps_followup_scope BEFORE INSERT OR UPDATE ON eps_seguimientos FOR EACH ROW EXECUTE FUNCTION eps_validate_clinical_scope();

-- Observe actual order changes; never change the order or its pharmacy workflow.
CREATE FUNCTION eps_notify_request() RETURNS trigger LANGUAGE plpgsql AS $$
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
 RETURN NEW;
END $$;
CREATE TRIGGER eps_request_events AFTER INSERT OR UPDATE OF estado ON solicitudes FOR EACH ROW EXECUTE FUNCTION eps_notify_request();

CREATE FUNCTION eps_notify_inventory() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE scope_id varchar(80);
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.stock=OLD.stock AND NEW.minimo=OLD.minimo THEN RETURN NEW; END IF;
 END IF;
 SELECT eps_id INTO scope_id FROM eps_farmacias WHERE id=NEW.vinculo_id AND activa;
 IF scope_id IS NOT NULL THEN
  INSERT INTO eps_eventos(eps_id,tipo,registro_id,titulo,detalle) VALUES(scope_id,'INVENTARIO',NEW.id::text,
   CASE WHEN NEW.stock=0 THEN 'Medicamento agotado' WHEN NEW.stock<=NEW.minimo THEN 'Alerta de stock bajo' ELSE 'Existencias actualizadas' END,
   jsonb_build_object('medicamento_id',NEW.medicamento_id,'stock',NEW.stock,'minimo',NEW.minimo));
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER eps_inventory_events AFTER INSERT OR UPDATE OF stock,minimo ON eps_existencias FOR EACH ROW EXECUTE FUNCTION eps_notify_inventory();

COMMIT;
