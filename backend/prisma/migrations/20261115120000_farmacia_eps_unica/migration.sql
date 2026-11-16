-- PREPARED ONLY. Do not apply before recovering/reviewing the original EPS
-- migrations. This migration does not reconstruct them or change any records.
-- Duplicate active links make creation fail; do not repair them automatically.
CREATE UNIQUE INDEX "eps_farmacias_una_eps_activa_key"
ON "public"."eps_farmacias" ("farmacia_id") WHERE "activa" = true;
