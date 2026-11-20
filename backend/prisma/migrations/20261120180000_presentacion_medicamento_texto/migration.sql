BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.medicamentos ALTER COLUMN presentacion TYPE text;
COMMIT;
