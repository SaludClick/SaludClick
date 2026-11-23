const { habilitadas } = require('../config/farmacia-notificaciones');

async function registrarEvento(c, farmaciaId, tipo, titulo, mensaje, referencia) {
    const result = await c.query(`INSERT INTO notificaciones_farmacia
        (destinatario_id,tipo,titulo,mensaje,referencia_evento)
        VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(destinatario_id,referencia_evento) DO NOTHING RETURNING id`,
    [farmaciaId,tipo,titulo,mensaje,referencia]);
    return result.rows.length > 0;
}

function nivel(stock, minimo) {
    if (stock === 0) return 'agotado';
    if (stock < minimo) return 'bajo';
    if (stock === minimo) return 'minimo';
    return 'disponible';
}

async function registrarStock(c, farmaciaId, origen, evento, anterior, actual) {
    if (!habilitadas() || anterior.stock < 0 || actual.stock < 0) return false;
    const previo = nivel(anterior.stock, anterior.stock_minimo);
    const siguiente = nivel(actual.stock, actual.stock_minimo);
    if (previo === siguiente) return false;

    let tipo, titulo;
    if (siguiente === 'agotado') {
        tipo = 'STOCK_AGOTADO';
        titulo = 'Agotado';
    } else if (actual.stock > anterior.stock && (previo === 'agotado' || siguiente === 'disponible')) {
        tipo = 'STOCK_REPUESTO';
        titulo = 'Stock actualizado';
    } else if (siguiente === 'minimo' || siguiente === 'bajo') {
        tipo = 'STOCK_BAJO';
        titulo = siguiente === 'minimo' ? 'Stock bajo: mínimo alcanzado' : 'Stock bajo: por debajo del mínimo';
    } else {
        return false;
    }
    const mensaje = `${actual.nombre}: ${actual.stock} unidades disponibles. Stock mínimo: ${actual.stock_minimo}.`;
    return registrarEvento(c, farmaciaId, tipo, titulo, mensaje,`stock:${origen}:${actual.id}:${evento}`);
}

module.exports = { registrarEvento, registrarStock };
