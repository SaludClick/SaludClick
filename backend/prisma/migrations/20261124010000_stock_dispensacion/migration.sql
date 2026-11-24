BEGIN;

LOCK TABLE dispensaciones_etapas IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM dispensaciones_etapas
        WHERE preparadas <> '{}'::jsonb OR saldo <> autorizadas) THEN
        RAISE EXCEPTION 'Hay dispensaciones por etapas preparadas o entregadas. Concilia sus existencias antes de migrar.';
    END IF;
END
$$;

ALTER TABLE farmacia_stock_eventos
    ADD COLUMN etapa integer CHECK (etapa > 0),
    ADD COLUMN visita_id uuid,
    ADD COLUMN domiciliario_id integer REFERENCES usuarios(id) ON DELETE RESTRICT,
    DROP CONSTRAINT farmacia_stock_eventos_tipo_check,
    DROP CONSTRAINT farmacia_stock_eventos_check,
    DROP CONSTRAINT farmacia_stock_eventos_farmacia_id_clave_medicamento_id_key,
    DROP CONSTRAINT farmacia_stock_eventos_solicitud_id_medicamento_id_tipo_key,
    ADD CONSTRAINT farmacia_stock_eventos_tipo_check CHECK (tipo IN ('INGRESO','RESERVA','LIBERACION','ENTREGA')),
    ADD CONSTRAINT farmacia_stock_eventos_ambito_check CHECK (
        (tipo='INGRESO' AND solicitud_id IS NULL AND etapa IS NULL) OR
        (tipo IN ('RESERVA','ENTREGA') AND solicitud_id IS NOT NULL) OR
        (tipo='LIBERACION' AND solicitud_id IS NOT NULL AND etapa IS NOT NULL)
    ),
    ADD CONSTRAINT farmacia_stock_eventos_visita_check CHECK (
        (visita_id IS NULL AND domiciliario_id IS NULL) OR
        (etapa IS NOT NULL AND tipo='ENTREGA' AND visita_id IS NOT NULL AND domiciliario_id IS NOT NULL)
    );

-- El vínculo a la operación solo corresponde al flujo por etapas.
ALTER TABLE farmacia_stock_eventos
    ADD COLUMN operacion_etapa uuid GENERATED ALWAYS AS (CASE WHEN etapa IS NOT NULL THEN clave END) STORED,
    ADD CONSTRAINT farmacia_stock_eventos_operacion_etapa_fkey FOREIGN KEY (solicitud_id,operacion_etapa)
        REFERENCES dispensacion_eventos(solicitud_id,clave) DEFERRABLE INITIALLY DEFERRED;

CREATE UNIQUE INDEX farmacia_stock_clave_historica_idx ON farmacia_stock_eventos(farmacia_id,clave,medicamento_id) WHERE etapa IS NULL;
CREATE UNIQUE INDEX farmacia_stock_solicitud_historica_idx ON farmacia_stock_eventos(solicitud_id,medicamento_id,tipo) WHERE etapa IS NULL;
CREATE UNIQUE INDEX farmacia_stock_operacion_etapa_idx ON farmacia_stock_eventos(solicitud_id,clave,medicamento_id) WHERE etapa IS NOT NULL;
CREATE UNIQUE INDEX farmacia_stock_entrega_visita_idx ON farmacia_stock_eventos(visita_id,medicamento_id) WHERE visita_id IS NOT NULL;

COMMIT;
