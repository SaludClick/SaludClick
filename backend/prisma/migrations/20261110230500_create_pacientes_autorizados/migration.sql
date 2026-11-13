CREATE TYPE "EstadoPacienteAutorizado" AS ENUM ('AUTORIZADO', 'REVOCADO');

CREATE TABLE "pacientes_autorizados" (
    "id" SERIAL NOT NULL,
    "nombres" VARCHAR(100) NOT NULL,
    "apellidos" VARCHAR(100) NOT NULL,
    "tipo_documento" VARCHAR(10) NOT NULL,
    "cedula" VARCHAR(30) NOT NULL,
    "estado" "EstadoPacienteAutorizado" NOT NULL DEFAULT 'AUTORIZADO',
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "pacientes_autorizados_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auditorias_pacientes_autorizados" (
    "id" SERIAL NOT NULL,
    "paciente_id" INTEGER NOT NULL,
    "administrador_id" INTEGER NOT NULL,
    "accion" VARCHAR(30) NOT NULL,
    "campos_modificados" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditorias_pacientes_autorizados_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pacientes_autorizados_cedula_key"
    ON "pacientes_autorizados"("cedula");
CREATE INDEX "pacientes_autorizados_estado_idx"
    ON "pacientes_autorizados"("estado");
CREATE INDEX "pacientes_autorizados_apellidos_nombres_idx"
    ON "pacientes_autorizados"("apellidos", "nombres");
CREATE INDEX "auditorias_pacientes_autorizados_paciente_id_created_at_idx"
    ON "auditorias_pacientes_autorizados"("paciente_id", "created_at");
CREATE INDEX "auditorias_pacientes_autorizados_administrador_id_created_a_idx"
    ON "auditorias_pacientes_autorizados"("administrador_id", "created_at");

ALTER TABLE "auditorias_pacientes_autorizados"
    ADD CONSTRAINT "auditorias_pacientes_autorizados_paciente_id_fkey"
    FOREIGN KEY ("paciente_id") REFERENCES "pacientes_autorizados"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "auditorias_pacientes_autorizados"
    ADD CONSTRAINT "auditorias_pacientes_autorizados_administrador_id_fkey"
    FOREIGN KEY ("administrador_id") REFERENCES "usuarios"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
