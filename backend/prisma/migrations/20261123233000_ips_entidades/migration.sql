BEGIN;

CREATE TABLE "ips_entidades" (
    "id" VARCHAR(80) PRIMARY KEY,
    "nombre" VARCHAR(150) NOT NULL,
    "nit" VARCHAR(30) NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX "ips_entidades_nit_key" ON "ips_entidades"("nit");

CREATE TABLE "ips_eps" (
    "ips_id" VARCHAR(80) NOT NULL,
    "eps_id" VARCHAR(80) NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ips_eps_pkey" PRIMARY KEY ("ips_id", "eps_id"),
    CONSTRAINT "ips_eps_ips_id_fkey" FOREIGN KEY ("ips_id") REFERENCES "ips_entidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ips_eps_eps_id_fkey" FOREIGN KEY ("eps_id") REFERENCES "eps_entidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ips_eps_eps_id_idx" ON "ips_eps"("eps_id");

CREATE TABLE "ips_accesos" (
    "usuario_id" INTEGER PRIMARY KEY,
    "ips_id" VARCHAR(80) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT false,
    "revocado_at" TIMESTAMPTZ,
    CONSTRAINT "ips_accesos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ips_accesos_ips_id_fkey" FOREIGN KEY ("ips_id") REFERENCES "ips_entidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ips_accesos_ips_id_activo_idx" ON "ips_accesos"("ips_id", "activo");

COMMIT;
