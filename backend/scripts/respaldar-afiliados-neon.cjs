// Solo lee PostgreSQL de origen y escribe un archivo local ignorado por Git.
// Las credenciales viajan por stdin; nunca por argumentos, archivos ni salida.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
async function main() {
    require('dotenv').config({path:path.resolve(__dirname,'../.env'),quiet:true});
    const url = new URL(process.env.DATABASE_URL);
    const esperado = process.env.AFILIADOS_EXPECTED_HOST;
    if(!esperado) throw new Error('Configura AFILIADOS_EXPECTED_HOST con el destino de respaldo revisado.');
    if(url.hostname!==esperado || url.pathname!=='/neondb') throw new Error('Destino de respaldo distinto al revisado.');
    const carpeta = path.resolve(__dirname,'../database/backups'); fs.mkdirSync(carpeta,{recursive:true});
    const marca = new Date().toISOString().replace(/[:.]/g,'-');
    const archivo = path.join(carpeta,`afiliados-pre-neon-${marca}.dump`);
    const credenciales = [url.hostname,url.port||'5432',decodeURIComponent(url.pathname.slice(1)),decodeURIComponent(url.username),decodeURIComponent(url.password)];
    if(credenciales.some(v=>/[\r\n\0]/.test(v))) throw new Error('Credenciales no compatibles con el canal de respaldo.');
    // La imagen mínima carece de CA: se envía el mismo almacén público de confianza
    // de Node por stdin. Se conserva verify-full, incluida la identidad del servidor.
    const script = 'IFS= read -r PGHOST; IFS= read -r PGPORT; IFS= read -r PGDATABASE; IFS= read -r PGUSER; IFS= read -r PGPASSWORD; export PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD; umask 077; cat > /tmp/saludclick-public-roots.crt; export PGSSLMODE=verify-full PGSSLROOTCERT=/tmp/saludclick-public-roots.crt; exec pg_dump --format=custom --no-owner --no-acl';
    const fd = fs.openSync(archivo,'wx',0o600);
    const proceso = spawn('docker',['run','--rm','-i','postgres:18','sh','-c',script],{windowsHide:true,stdio:['pipe',fd,'pipe']});
    let stderr = ''; proceso.stderr.on('data',b=>{stderr+=b.toString();});
    proceso.stdin.on('error',()=>{}); proceso.stdin.end(credenciales.join('\n')+'\n'+require('node:tls').rootCertificates.join('\n')+'\n');
    let codigo;
    try { [codigo] = await once(proceso,'close'); } finally { fs.closeSync(fd); }
    if(codigo!==0) { console.error(JSON.stringify({etapa:'pg_dump',salida:codigo,clasificacion:[...new Set(stderr.match(/version mismatch|certificate|authentication|password|SSL|permission denied|could not translate|Connection refused|Network|not found|connect/gi)||[])]})); throw new Error('Respaldo no completado.'); }
    const bytes = fs.readFileSync(archivo);
    if(bytes.subarray(0,5).toString()!=='PGDMP') throw new Error('Archivo de respaldo inválido.');
    console.log(JSON.stringify({archivo,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),versionHerramienta:'PostgreSQL 18',restauracionVerificada:false}));
}
main().catch(e=>{console.error(JSON.stringify({error:'Respaldo no confirmado. No se muestran credenciales ni datos personales.',codigo:e.code||e.name}));process.exitCode=1;});
