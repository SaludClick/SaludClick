const invalid = () => Object.assign(new Error('Movimiento de inventario no válido.'), { status: 400, codigo: 'MOVIMIENTO_INVALIDO' });
const integer = n => Number.isInteger(n) && n > 0 && n <= 2147483647;
function movimiento(body) {
    const fields = ['inventarioId', 'medicamentoId', 'tipo', 'cantidad', 'motivo', 'clave', 'direccion'];
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !fields.includes(k))) throw invalid();
    if (!integer(body.inventarioId) || !integer(body.medicamentoId) || !integer(body.cantidad)) throw invalid();
    if (!['ENTRADA', 'SALIDA', 'AJUSTE'].includes(body.tipo)) throw invalid();
    if (body.tipo === 'AJUSTE' ? !['AUMENTAR', 'DISMINUIR'].includes(body.direccion) : body.direccion !== undefined) throw invalid();
    if (typeof body.motivo !== 'string' || body.motivo.trim().length < 5 || body.motivo.length > 500 || /[\u0000-\u001f\u007f]/.test(body.motivo)) throw invalid();
    if (typeof body.clave !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.clave)) throw invalid();
    return { inventarioId: body.inventarioId, medicamentoId: body.medicamentoId, tipo: body.tipo,
        cantidad: body.cantidad, motivo: body.motivo.trim(), clave: body.clave.toLowerCase(),
        direccion: body.tipo === 'AJUSTE' ? body.direccion : null };
}
module.exports = { movimiento };
