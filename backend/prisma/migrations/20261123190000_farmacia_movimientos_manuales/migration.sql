ALTER TABLE farmacia_stock_eventos
    DROP CONSTRAINT farmacia_stock_eventos_tipo_check,
    DROP CONSTRAINT farmacia_stock_eventos_check,
    ADD COLUMN motivo varchar(500),
    ADD CONSTRAINT farmacia_stock_eventos_ambito_check CHECK (
        (tipo IN ('RESERVA','ENTREGA') AND solicitud_id IS NOT NULL AND motivo IS NULL)
        OR (tipo = 'INGRESO' AND solicitud_id IS NULL AND motivo IS NULL)
        OR (tipo IN ('SALIDA','AJUSTE_MAS','AJUSTE_MENOS') AND solicitud_id IS NULL
            AND motivo IS NOT NULL AND length(btrim(motivo)) > 0)
    );

CREATE UNIQUE INDEX farmacia_stock_evento_movimiento_referencia_key
    ON farmacia_stock_eventos(farmacia_id, lower(btrim(referencia)))
    WHERE tipo IN ('SALIDA','AJUSTE_MAS','AJUSTE_MENOS');
