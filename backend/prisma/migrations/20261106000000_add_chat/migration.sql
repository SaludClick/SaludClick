CREATE TYPE "EstadoChat" AS ENUM ('ABIERTA', 'CERRADA');
CREATE TYPE "EstadoMensaje" AS ENUM ('ENVIADO', 'ENTREGADO', 'LEIDO');

CREATE TABLE "conversaciones" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "agente_id" INTEGER,
    "estado" "EstadoChat" NOT NULL DEFAULT 'ABIERTA',
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL,
    CONSTRAINT "conversaciones_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "mensajes_chat" (
    "id" SERIAL NOT NULL,
    "conversacion_id" INTEGER NOT NULL,
    "remitente_id" INTEGER NOT NULL,
    "contenido" VARCHAR(2000) NOT NULL,
    "estado" "EstadoMensaje" NOT NULL DEFAULT 'ENVIADO',
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entregado_at" TIMESTAMP(0),
    "leido_at" TIMESTAMP(0),
    CONSTRAINT "mensajes_chat_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "conversaciones_cliente_id_updated_at_idx" ON "conversaciones"("cliente_id", "updated_at");
CREATE INDEX "conversaciones_agente_id_estado_updated_at_idx" ON "conversaciones"("agente_id", "estado", "updated_at");
CREATE INDEX "mensajes_chat_conversacion_id_created_at_idx" ON "mensajes_chat"("conversacion_id", "created_at");
CREATE INDEX "mensajes_chat_remitente_id_idx" ON "mensajes_chat"("remitente_id");
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_agente_id_fkey" FOREIGN KEY ("agente_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "mensajes_chat" ADD CONSTRAINT "mensajes_chat_conversacion_id_fkey" FOREIGN KEY ("conversacion_id") REFERENCES "conversaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mensajes_chat" ADD CONSTRAINT "mensajes_chat_remitente_id_fkey" FOREIGN KEY ("remitente_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
