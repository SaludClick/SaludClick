const CAMPOS = Object.freeze('id,nombres,apellidos,tipo_documento,documento,fecha_nacimiento,telefono,correo,direccion,ciudad,regimen,estado,eps_id'.split(','));

// CSV RFC 4180: comas y saltos de línea dentro de comillas, y comillas escapadas.
function leerCsv(texto) {
    const filas = []; let fila = []; let valor = ''; let citado = false; let cerrado = false;
    texto = texto.replace(/^\uFEFF/, '');
    for (let i = 0; i < texto.length; i++) {
        const c = texto[i];
        if (citado) {
            if (c === '"' && texto[i + 1] === '"') { valor += '"'; i++; }
            else if (c === '"') { citado = false; cerrado = true; }
            else valor += c;
        } else if (c === ',' || c === '\n' || c === '\r') {
            fila.push(valor); valor = ''; cerrado = false;
            if (c !== ',') {
                filas.push(fila); fila = [];
                if (c === '\r' && texto[i + 1] === '\n') i++;
            }
        } else if (c === '"' && valor === '' && !cerrado) citado = true;
        else {
            if (cerrado || c === '"') throw new Error('CSV mal formado.');
            valor += c;
        }
    }
    if (citado) throw new Error('CSV con comillas sin cerrar.');
    if (valor !== '' || fila.length || cerrado) { fila.push(valor); filas.push(fila); }
    const cabecera = filas.shift();
    if (!cabecera || cabecera.length !== 13 || new Set(cabecera).size !== 13 || CAMPOS.some(c => !cabecera.includes(c))) throw new Error('Se requieren exactamente los 13 campos originales.');
    if (filas.length !== 50) throw new Error('Se requieren exactamente 50 afiliados; importación cancelada.');
    const registros = filas.map(f => {
        if (f.length !== 13) throw new Error('Fila incompleta; importación cancelada.');
        return Object.fromEntries(cabecera.map((c, i) => [c, f[i]]));
    });
    for (const clave of ['id', 'documento']) {
        if (registros.some(r => !r[clave]) || new Set(registros.map(r => r[clave])).size !== 50) throw new Error('Identificadores vacíos o duplicados; importación cancelada.');
    }
    return registros;
}

async function importar(prisma, registros) {
    return prisma.$transaction(async tx => {
        let nuevos = 0;
        for (const datos of registros) {
            const existentes = await tx.afiliado.findMany({ where: { OR: [{ id: datos.id }, { documento: datos.documento }] } });
            if (existentes.length) {
                if (existentes.length !== 1 || CAMPOS.some(c => existentes[0][c] !== datos[c])) throw new Error('Conflicto con registros existentes; no se sobrescribió información.');
            } else { await tx.afiliado.create({ data: datos }); nuevos++; }
        }
        const persistidos = await tx.afiliado.findMany({ where: { id: { in: registros.map(r => r.id) } } });
        if (persistidos.length !== 50 || registros.some(r => !persistidos.some(p => CAMPOS.every(c => p[c] === r[c])))) throw new Error('Falló la verificación de integridad.');
        return { nuevos, validados: persistidos.length };
    }, { isolationLevel: 'Serializable', timeout: 30000 });
}
module.exports = { CAMPOS, leerCsv, importar };
