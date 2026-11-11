-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "EstadoMedicamento" AS ENUM ('DISPONIBLE', 'AGOTADO', 'INACTIVO');

-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('TARJETA');

-- CreateEnum
CREATE TYPE "EstadoPago" AS ENUM ('APROBADO', 'RECHAZADO', 'PENDIENTE');

-- CreateEnum
CREATE TYPE "FrecuenciaRecordatorio" AS ENUM ('CADA_8_HORAS', 'CADA_12_HORAS', 'CADA_24_HORAS');

-- CreateEnum
CREATE TYPE "EstadoRecordatorio" AS ENUM ('ACTIVO', 'INACTIVO');

-- CreateEnum
CREATE TYPE "EstadoSolicitud" AS ENUM ('PENDIENTE', 'APROBADA', 'PREPARANDO', 'LISTA', 'ENTREGADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoEntrega" AS ENUM ('RECOGER', 'DOMICILIO');

-- CreateEnum
CREATE TYPE "EstadoUsuario" AS ENUM ('ACTIVO', 'INACTIVO');

-- CreateEnum
CREATE TYPE "EstadoChat" AS ENUM ('ABIERTA', 'CERRADA');

-- CreateEnum
CREATE TYPE "EstadoMensaje" AS ENUM ('ENVIADO', 'ENTREGADO', 'LEIDO');

-- CreateTable
CREATE TABLE "categorias" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "descripcion" VARCHAR(255),
    "created_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(50) NOT NULL,
    "descripcion" VARCHAR(255),
    "created_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "apellido" VARCHAR(100) NOT NULL,
    "correo" VARCHAR(150) NOT NULL,
    "telefono" VARCHAR(20),
    "cedula" VARCHAR(30),
    "tipo_documento" VARCHAR(10),
    "ciudad" VARCHAR(100),
    "password" VARCHAR(255) NOT NULL,
    "rol_id" INTEGER NOT NULL,
    "estado" "EstadoUsuario" DEFAULT 'ACTIVO',
    "created_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicamentos" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "descripcion" TEXT,
    "categoria_id" INTEGER NOT NULL,
    "precio" DECIMAL(10,2) NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "imagen" VARCHAR(255),
    "estado" "EstadoMedicamento" DEFAULT 'DISPONIBLE',
    "created_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medicamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitudes" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "fecha" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,
    "estado" "EstadoSolicitud" DEFAULT 'PENDIENTE',
    "tipo_entrega" "TipoEntrega" DEFAULT 'RECOGER',
    "direccion" VARCHAR(255),
    "observaciones" TEXT,
    "idempotency_key" UUID,
    "idempotency_hash" CHAR(64),
    "created_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitudes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalle_solicitud" (
    "id" SERIAL NOT NULL,
    "solicitud_id" INTEGER NOT NULL,
    "medicamento_id" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "detalle_solicitud_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagos" (
    "id" SERIAL NOT NULL,
    "solicitud_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "referencia" VARCHAR(80) NOT NULL,
    "metodo" "MetodoPago" NOT NULL,
    "marca" VARCHAR(30) NOT NULL,
    "ultimos_digitos" CHAR(4) NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "estado" "EstadoPago" NOT NULL,
    "simulacion" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recordatorios" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "medicamento_id" INTEGER NOT NULL,
    "hora" TIME(0) NOT NULL,
    "frecuencia" "FrecuenciaRecordatorio" NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE,
    "estado" "EstadoRecordatorio" DEFAULT 'ACTIVO',
    "created_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recordatorios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tokens_recuperacion" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expira_en" TIMESTAMP(0) NOT NULL,
    "created_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tokens_recuperacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playing_with_neon" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "value" REAL,

    CONSTRAINT "playing_with_neon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "conversaciones" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "agente_id" INTEGER,
    "estado" "EstadoChat" NOT NULL DEFAULT 'ABIERTA',
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "conversaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateIndex
CREATE UNIQUE INDEX "categorias_nombre_key" ON "categorias"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "roles_nombre_key" ON "roles"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_correo_key" ON "usuarios"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_cedula_key" ON "usuarios"("cedula");

-- CreateIndex
CREATE INDEX "usuarios_rol_id_idx" ON "usuarios"("rol_id");

-- CreateIndex
CREATE INDEX "medicamentos_categoria_id_idx" ON "medicamentos"("categoria_id");

-- CreateIndex
CREATE INDEX "medicamentos_estado_idx" ON "medicamentos"("estado");

-- CreateIndex
CREATE INDEX "solicitudes_usuario_id_idx" ON "solicitudes"("usuario_id");

-- CreateIndex
CREATE INDEX "solicitudes_estado_idx" ON "solicitudes"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "solicitudes_usuario_id_idempotency_key_key" ON "solicitudes"("usuario_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "detalle_solicitud_solicitud_id_idx" ON "detalle_solicitud"("solicitud_id");

-- CreateIndex
CREATE INDEX "detalle_solicitud_medicamento_id_idx" ON "detalle_solicitud"("medicamento_id");

-- CreateIndex
CREATE UNIQUE INDEX "pagos_referencia_key" ON "pagos"("referencia");

-- CreateIndex
CREATE INDEX "pagos_solicitud_id_idx" ON "pagos"("solicitud_id");

-- CreateIndex
CREATE INDEX "pagos_usuario_id_idx" ON "pagos"("usuario_id");

-- CreateIndex
CREATE INDEX "recordatorios_usuario_id_idx" ON "recordatorios"("usuario_id");

-- CreateIndex
CREATE INDEX "recordatorios_medicamento_id_idx" ON "recordatorios"("medicamento_id");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_recuperacion_token_hash_key" ON "tokens_recuperacion"("token_hash");

-- CreateIndex
CREATE INDEX "tokens_recuperacion_usuario_id_idx" ON "tokens_recuperacion"("usuario_id");

-- CreateIndex
CREATE INDEX "tokens_recuperacion_expira_en_idx" ON "tokens_recuperacion"("expira_en");

-- CreateIndex
CREATE INDEX "formulas_medicas_usuario_id_idx" ON "formulas_medicas"("usuario_id");

-- CreateIndex
CREATE INDEX "formulas_medicas_estado_idx" ON "formulas_medicas"("estado");

-- CreateIndex
CREATE INDEX "conversaciones_cliente_id_updated_at_idx" ON "conversaciones"("cliente_id", "updated_at");

-- CreateIndex
CREATE INDEX "conversaciones_agente_id_estado_updated_at_idx" ON "conversaciones"("agente_id", "estado", "updated_at");

-- CreateIndex
CREATE INDEX "mensajes_chat_conversacion_id_created_at_idx" ON "mensajes_chat"("conversacion_id", "created_at");

-- CreateIndex
CREATE INDEX "mensajes_chat_remitente_id_idx" ON "mensajes_chat"("remitente_id");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicamentos" ADD CONSTRAINT "medicamentos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes" ADD CONSTRAINT "solicitudes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_solicitud" ADD CONSTRAINT "detalle_solicitud_medicamento_id_fkey" FOREIGN KEY ("medicamento_id") REFERENCES "medicamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_solicitud" ADD CONSTRAINT "detalle_solicitud_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordatorios" ADD CONSTRAINT "recordatorios_medicamento_id_fkey" FOREIGN KEY ("medicamento_id") REFERENCES "medicamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordatorios" ADD CONSTRAINT "recordatorios_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokens_recuperacion" ADD CONSTRAINT "tokens_recuperacion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formulas_medicas" ADD CONSTRAINT "formulas_medicas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_agente_id_fkey" FOREIGN KEY ("agente_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes_chat" ADD CONSTRAINT "mensajes_chat_conversacion_id_fkey" FOREIGN KEY ("conversacion_id") REFERENCES "conversaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes_chat" ADD CONSTRAINT "mensajes_chat_remitente_id_fkey" FOREIGN KEY ("remitente_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Catalogo INVIMA: misma ampliacion aditiva que Prisma.
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
