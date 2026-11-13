-- Apply only to an authorized database. No registered visitor accounts are created.
ALTER TABLE administrative_cases ALTER COLUMN cliente_id DROP NOT NULL;
ALTER TABLE administrative_cases ADD COLUMN visitante_hash CHAR(64);
ALTER TABLE administrative_cases ADD COLUMN visitante_expira_at TIMESTAMPTZ;
ALTER TABLE administrative_cases ADD CONSTRAINT administrative_case_identity CHECK
 ((cliente_id IS NOT NULL AND visitante_hash IS NULL) OR
  (cliente_id IS NULL AND visitante_hash IS NOT NULL AND visitante_expira_at IS NOT NULL));
CREATE UNIQUE INDEX administrative_cases_visitante_key ON administrative_cases(visitante_hash);
ALTER TABLE administrative_messages ALTER COLUMN remitente_id DROP NOT NULL;
ALTER TABLE administrative_audit ALTER COLUMN actor_id DROP NOT NULL;
