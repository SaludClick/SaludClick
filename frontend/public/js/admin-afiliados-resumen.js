// Presentación: calcula cifras globales mediante la consulta paginada ya existente.
// No infiere cuentas a partir del estado de afiliación ni normaliza datos originales.
export async function obtenerResumenAfiliados(cargarPagina, primeraPagina) {
    const primera = primeraPagina || await cargarPagina(1);
    if (!Number.isSafeInteger(primera.total) || primera.total < 0) throw new Error('Total no disponible.');
    const paginas = Math.max(1, Math.ceil(primera.total / 10));
    const restantes = await Promise.all(Array.from({ length: paginas - 1 }, (_, i) => cargarPagina(i + 2)));
    const respuestas = [primera, ...restantes];
    const filas = [];
    respuestas.forEach((respuesta, i) => {
        const esperados = Math.min(10, Math.max(0, primera.total - i * 10));
        if (respuesta.total !== primera.total || respuesta.coincidencias !== primera.total || respuesta.pagina !== i + 1 || !Array.isArray(respuesta.afiliados) || respuesta.afiliados.length !== esperados) throw new Error('El registro cambió mientras se consultaba su resumen.');
        filas.push(...respuesta.afiliados);
    });
    if (new Set(filas.map(a => String(a.id))).size !== primera.total || filas.some(a => a.id === null || a.id === undefined || a.id === '' || !Object.hasOwn(a, 'usuario'))) throw new Error('No se pudo confirmar el registro completo.');
    const resumen = { total: primera.total, conCuenta: 0, sinCuenta: 0, enRevision: 0 };
    for (const a of filas) {
        if (a.cuenta_conflicto) resumen.enRevision++;
        else if (a.usuario === null) resumen.sinCuenta++;
        else if (typeof a.usuario === 'object' && a.usuario.id !== undefined && a.usuario.id !== null) resumen.conCuenta++;
        else throw new Error('Estado de cuenta no disponible.');
    }
    return resumen;
}
