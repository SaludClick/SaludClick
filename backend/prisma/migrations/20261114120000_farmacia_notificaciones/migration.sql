-- PREPARED ONLY. Requires explicit authorization before applying to Neon.
CREATE TABLE "notificaciones_farmacia" (
    "id" SERIAL NOT NULL,
    "destinatario_id" INTEGER NOT NULL,
    "tipo" VARCHAR(40) NOT NULL,
    "titulo" VARCHAR(160) NOT NULL,
    "mensaje" VARCHAR(500) NOT NULL,
    "referencia_evento" VARCHAR(180) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leida_at" TIMESTAMPTZ,
    CONSTRAINT "notificaciones_farmacia_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notificaciones_farmacia_destinatario_id_fkey" FOREIGN KEY ("destinatario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "notificaciones_farmacia_destinatario_evento_key" ON "notificaciones_farmacia"("destinatario_id", "referencia_evento");
CREATE INDEX "notificaciones_farmacia_destinatario_fecha_idx" ON "notificaciones_farmacia"("destinatario_id", "created_at", "id");
CREATE INDEX "notificaciones_farmacia_destinatario_leida_idx" ON "notificaciones_farmacia"("destinatario_id", "leida_at");
