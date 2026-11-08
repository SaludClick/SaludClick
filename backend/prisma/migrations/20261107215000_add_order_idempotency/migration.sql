ALTER TABLE "solicitudes"
    ADD COLUMN "idempotency_key" UUID,
    ADD COLUMN "idempotency_hash" CHAR(64);

CREATE UNIQUE INDEX "solicitudes_usuario_id_idempotency_key_key"
    ON "solicitudes"("usuario_id", "idempotency_key");
