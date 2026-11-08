-- Retired MySQL migration with column assumptions that do not match Prisma.
-- Do not run; existing PostgreSQL databases require a reviewed migration plan.
DO $$
BEGIN
    RAISE EXCEPTION 'Retired MySQL migration. No database changes were applied.';
END
$$;
