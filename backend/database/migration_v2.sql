-- Retired MySQL migration. Do not run; it rewrote inventory data.
-- Use a reviewed, environment-specific PostgreSQL migration instead.
DO $$
BEGIN
    RAISE EXCEPTION 'Retired MySQL migration. No database changes were applied.';
END
$$;
