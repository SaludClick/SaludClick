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
    "estado" "EstadoUsuario",
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
    "stock" INTEGER NOT NULL,
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
    "tipo_entrega" "TipoEntrega",
    "direccion" VARCHAR(255),
    "observaciones" TEXT,
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
    "simulacion" BOOLEAN NOT NULL,
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

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicamentos" ADD CONSTRAINT "medicamentos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes" ADD CONSTRAINT "solicitudes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_solicitud" ADD CONSTRAINT "detalle_solicitud_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_solicitud" ADD CONSTRAINT "detalle_solicitud_medicamento_id_fkey" FOREIGN KEY ("medicamento_id") REFERENCES "medicamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordatorios" ADD CONSTRAINT "recordatorios_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordatorios" ADD CONSTRAINT "recordatorios_medicamento_id_fkey" FOREIGN KEY ("medicamento_id") REFERENCES "medicamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokens_recuperacion" ADD CONSTRAINT "tokens_recuperacion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
