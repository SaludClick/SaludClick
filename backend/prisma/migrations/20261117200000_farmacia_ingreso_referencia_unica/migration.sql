-- PREPARADA, NO APLICADA EN NEON. No modifica cantidades ni corrige duplicados.
-- Una referencia identifica una recepción física completa por farmacia;
-- distintas recepciones parciales deben tener referencias documentales distintas.
CREATE UNIQUE INDEX farmacia_ingreso_referencia_medicamento_key
ON farmacia_stock_eventos(farmacia_id,lower(btrim(referencia)),medicamento_id)
WHERE tipo='INGRESO';
