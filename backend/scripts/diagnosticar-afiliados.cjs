// Solo lectura: no aplica migraciones, no importa registros, no imprime PII ni secretos.
const pool = require('../src/config/database');
const jwt = require('jsonwebtoken');
async function main() {
    const url = new URL(process.env.DATABASE_URL);
    const cliente = await pool.connect();
    let admin;
    try {
        await cliente.query('BEGIN READ ONLY');
        const { rows: [identidad] } = await cliente.query('SELECT current_database() AS base, current_schema() AS esquema');
        const { rows: columnas } = await cliente.query("SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = current_schema() AND table_name IN ('afiliados','eps','usuarios','pacientes_autorizados') ORDER BY table_name, ordinal_position");
        const { rows: relaciones } = await cliente.query("SELECT tc.table_name, kcu.column_name, ccu.table_name AS destino, ccu.column_name AS campo_destino FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.constraint_schema = kcu.constraint_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.constraint_schema WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'afiliados'");
        let conteo = null;
        if (columnas.some(c => c.table_name === 'afiliados')) conteo = (await cliente.query('SELECT count(*)::int AS total FROM afiliados')).rows[0].total;
        admin = (await cliente.query("SELECT id, rol_id FROM usuarios WHERE rol_id = 1 AND estado = 'ACTIVO' ORDER BY id LIMIT 1")).rows[0];
        console.log(JSON.stringify({ configuracion: { host: url.hostname, puerto: url.port || '5432', ...identidad }, afiliados: conteo, columnas, relaciones, administradorActivo: Boolean(admin) }));
        await cliente.query('ROLLBACK');
    } finally { cliente.release(); }
    const origin = process.env.DIAGNOSTICO_ORIGIN || 'http://127.0.0.1:3000';
    for (const autenticado of [false, true]) {
        if (autenticado && !process.env.JWT_SECRET) continue;
        // Si no existe administrador activo se usa una credencial efímera de diagnóstico,
        // solo para GET; no representa un inicio de sesión ni crea usuarios.
        const headers = autenticado ? { Authorization: `Bearer ${jwt.sign({ id: admin?.id ?? -1, rol_id: 1 }, process.env.JWT_SECRET, { expiresIn: '2m' })}` } : {};
        try {
            const response = await fetch(origin + '/api/admin/afiliados?pagina=1', { headers, signal: AbortSignal.timeout(15000) });
            let data; try { data = await response.json(); } catch { data = {}; }
            console.log(JSON.stringify({ endpoint: origin, autenticado, tokenDiagnostico: autenticado && !admin, http: response.status, ok: data.ok, total: data.total, registros: Array.isArray(data.afiliados) ? data.afiliados.length : null, mensaje: data.mensaje }));
            if (autenticado) {
                const runtime = await fetch(origin + '/api/admin/afiliados/diagnostico/conexion', { headers, signal: AbortSignal.timeout(15000) });
                const estado = await runtime.json();
                console.log(JSON.stringify({ backendActivo: origin, http: runtime.status, conexionEfectiva: estado.conexion }));
            }
        } catch { console.log(JSON.stringify({ endpoint: origin, autenticado, error: 'No fue posible conectar al endpoint.' })); }
    }
}
main().catch(e => { console.error(JSON.stringify({ error: 'Diagnóstico de solo lectura fallido', codigo: e.code || e.name })); process.exitCode = 1; }).finally(() => pool.end());
