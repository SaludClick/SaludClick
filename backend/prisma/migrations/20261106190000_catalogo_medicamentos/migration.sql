-- Ampliación aditiva del catálogo de medicamentos.
-- Conserva las tablas y relaciones existentes de pedidos, usuarios y recordatorios.

ALTER TABLE "medicamentos"
  ADD COLUMN "codigo_fuente" VARCHAR(80),
  ADD COLUMN "expediente" VARCHAR(40),
  ADD COLUMN "nombre_generico" VARCHAR(180),
  ADD COLUMN "principio_activo" TEXT,
  ADD COLUMN "concentracion" VARCHAR(120),
  ADD COLUMN "forma_farmaceutica" VARCHAR(120),
  ADD COLUMN "presentacion" VARCHAR(180),
  ADD COLUMN "via_administracion" VARCHAR(120),
  ADD COLUMN "titular_registro" VARCHAR(220),
  ADD COLUMN "registro_sanitario" VARCHAR(100),
  ADD COLUMN "estado_registro_invima" VARCHAR(80),
  ADD COLUMN "modalidad_comercializacion" VARCHAR(180),
  ADD COLUMN "cum" VARCHAR(80),
  ADD COLUMN "ium" VARCHAR(80),
  ADD COLUMN "requiere_formula" BOOLEAN,
  ADD COLUMN "catalogo_verificado" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "precio_referencial" DECIMAL(12,2),
  ADD COLUMN "fuente_precio" VARCHAR(80),
  ADD COLUMN "fecha_precio" DATE;

CREATE UNIQUE INDEX "medicamentos_codigo_fuente_key" ON "medicamentos"("codigo_fuente");
CREATE INDEX "medicamentos_nombre_idx" ON "medicamentos"("nombre");
CREATE INDEX "medicamentos_principio_activo_idx" ON "medicamentos"("principio_activo");
CREATE INDEX "medicamentos_registro_sanitario_idx" ON "medicamentos"("registro_sanitario");
CREATE INDEX "medicamentos_estado_registro_invima_idx" ON "medicamentos"("estado_registro_invima");

CREATE TABLE "imagenes_medicamento" (
  "id" SERIAL NOT NULL,
  "medicamento_id" INTEGER NOT NULL,
  "url" VARCHAR(500) NOT NULL,
  "texto_alt" VARCHAR(255),
  "es_principal" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "imagenes_medicamento_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "imagenes_medicamento_medicamento_id_idx" ON "imagenes_medicamento"("medicamento_id");
ALTER TABLE "imagenes_medicamento" ADD CONSTRAINT "imagenes_medicamento_medicamento_id_fkey"
  FOREIGN KEY ("medicamento_id") REFERENCES "medicamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "observaciones_precio" (
  "id" SERIAL NOT NULL,
  "medicamento_id" INTEGER NOT NULL,
  "valor" DECIMAL(12,2) NOT NULL,
  "moneda" VARCHAR(3) NOT NULL DEFAULT 'COP',
  "fuente" VARCHAR(80) NOT NULL,
  "fecha_corte" DATE NOT NULL,
  "notas" TEXT,
  "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "observaciones_precio_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "observaciones_precio_medicamento_id_fecha_corte_idx"
  ON "observaciones_precio"("medicamento_id", "fecha_corte");
ALTER TABLE "observaciones_precio" ADD CONSTRAINT "observaciones_precio_medicamento_id_fkey"
  FOREIGN KEY ("medicamento_id") REFERENCES "medicamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
