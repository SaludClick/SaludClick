CREATE TABLE "afiliados" (
  "id" TEXT PRIMARY KEY,
  "nombres" TEXT NOT NULL,
  "apellidos" TEXT NOT NULL,
  "tipo_documento" TEXT NOT NULL,
  "documento" TEXT NOT NULL UNIQUE,
  "fecha_nacimiento" TEXT NOT NULL,
  "telefono" TEXT NOT NULL,
  "correo" TEXT NOT NULL,
  "direccion" TEXT NOT NULL,
  "ciudad" TEXT NOT NULL,
  "regimen" TEXT NOT NULL,
  "estado" TEXT NOT NULL,
  "eps_id" TEXT NOT NULL,
  "usuario_id" INTEGER UNIQUE REFERENCES "usuarios"("id") ON DELETE RESTRICT,
  "verificado_por" INTEGER REFERENCES "usuarios"("id") ON DELETE RESTRICT,
  "verificado_at" TIMESTAMP(3)
);
