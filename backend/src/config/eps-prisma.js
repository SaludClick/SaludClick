const { Pool } = require('pg');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
let conexion;
function configuracionEPS(env = process.env) {
    if (!env.EPS_DATABASE_URL) throw Object.assign(new Error('Falta configurar EPS_DATABASE_URL en el entorno del proceso del backend y reiniciarlo. Se necesita acceso de lectura a la base original de afiliados; no se importarán datos.'), { status:503, codigo:'EPS_SOURCE_NOT_CONFIGURED' });
    let url;
    try { url = new URL(env.EPS_DATABASE_URL); } catch { throw Object.assign(new Error('EPS_DATABASE_URL no es una conexión PostgreSQL válida.'), { status:503, codigo:'EPS_SOURCE_INVALID' }); }
    const esquema = env.EPS_DATABASE_SCHEMA || 'public';
    const invalidos = ['host','hostaddr','port','database','dbname','user','password','service','servicefile','options'];
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2 || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(esquema) || [...url.searchParams.keys()].some(k => invalidos.includes(k.toLowerCase()))) throw Object.assign(new Error('La configuración de la fuente EPS no es válida. Revisa EPS_DATABASE_URL y EPS_DATABASE_SCHEMA.'), { status:503, codigo:'EPS_SOURCE_INVALID' });
    const local = ['127.0.0.1','localhost','[::1]'].includes(url.hostname);
    if (!local || url.searchParams.get('sslmode') !== 'disable') url.searchParams.set('sslmode','verify-full');
    return { url:url.toString(), esquema, servidor:url.hostname, puerto:url.port || '5432' };
}
function obtenerConexionEPS() {
    const config = configuracionEPS();
    if (conexion && (conexion.url !== config.url || conexion.esquema !== config.esquema)) throw Object.assign(new Error('La configuración EPS cambió; reinicia el backend para aplicar la nueva conexión.'), { status:503, codigo:'EPS_RESTART_REQUIRED' });
    if (!conexion) {
        const pool = new Pool({ connectionString:config.url, max:4, connectionTimeoutMillis:10000, idleTimeoutMillis:10000 });
        pool.on('error', () => { console.error('La conexión de lectura EPS no está disponible.'); });
        conexion = { ...config, pool, prisma:new PrismaClient({ adapter:new PrismaPg(pool) }) };
    }
    return conexion;
}
async function cerrarConexionEPS() {
    if (!conexion) return;
    const anterior = conexion; conexion = undefined;
    await anterior.prisma.$disconnect(); await anterior.pool.end();
}
module.exports = { configuracionEPS, obtenerConexionEPS, cerrarConexionEPS };
