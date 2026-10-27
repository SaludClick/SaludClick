
CREATE TABLE "formulas_medicas" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "nombre_archivo" VARCHAR(255) NOT NULL,
    "nombre_original" VARCHAR(180) NOT NULL,
    "tipo_mime" VARCHAR(100) NOT NULL,
    "ruta_archivo" VARCHAR(500) NOT NULL,
    "tamano" INTEGER NOT NULL,
    "descripcion" TEXT,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    "fecha_subida" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "formulas_medicas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "formulas_medicas_usuario_id_idx"
ON "formulas_medicas"("usuario_id");

CREATE INDEX "formulas_medicas_estado_idx"
ON "formulas_medicas"("estado");

ALTER TABLE "formulas_medicas"
ADD CONSTRAINT "formulas_medicas_usuario_id_fkey"
FOREIGN KEY ("usuario_id")
REFERENCES "usuarios"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
