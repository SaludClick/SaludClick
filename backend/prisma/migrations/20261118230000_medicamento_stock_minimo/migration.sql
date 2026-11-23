ALTER TABLE medicamentos
    ADD COLUMN stock_minimo integer NOT NULL DEFAULT 0,
    ADD CONSTRAINT medicamentos_stock_minimo_no_negativo CHECK (stock_minimo >= 0);
