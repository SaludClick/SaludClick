// Solo genera un plan LOCAL. No carga .env, abre conexiones o envía peticiones.
const fs=require('node:fs'),crypto=require('node:crypto');
const {ingreso}=require('../src/validators/farmacia-stock-ingreso.validator');
const v=require('../src/validators/farmacia-operacion.validator');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function preparar(bytes,hashAprobado){
    if(!/^[a-f0-9]{64}$/.test(hashAprobado||'')||sha(bytes)!==hashAprobado)throw new Error('El manifiesto no coincide con el SHA256 aprobado externamente.');
    const m=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
    v.objeto(m,['estado','farmaciaId','actorAdminId','aprobacion','fechaConteo','referenciaDocumental','claveIngresoUuidV4','items']);
    if(m.estado!=='APROBADO'||!Number.isInteger(m.farmaciaId)||m.farmaciaId<1||!Number.isInteger(m.actorAdminId)||m.actorAdminId<1||typeof m.aprobacion!=='string'||!m.aprobacion.trim()||typeof m.fechaConteo!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(m.fechaConteo)||!Number.isFinite(Date.parse(m.fechaConteo)))throw new Error('Faltan conteo, actor, farmacia o aprobación documental.');
    const cuerpo=ingreso({clave:m.claveIngresoUuidV4,referencia:m.referenciaDocumental,items:m.items});
    return {modo:'SOLO_PREPARACION_NO_ENVIADO',sha256Manifiesto:hashAprobado,aprobacion:m.aprobacion,fechaConteo:m.fechaConteo,actorAdminId:m.actorAdminId,farmaciaId:m.farmaciaId,metodo:'POST',ruta:`/api/admin/farmacias/${m.farmaciaId}/existencias/ingresos`,cuerpo,huellaServicio:sha(JSON.stringify({farmaciaId:m.farmaciaId,...cuerpo})),precondiciones:['Administrador y farmacia vigentes comprobados por API','Corte físico y unidad de conteo verificados por responsable','Ningún ingreso previo con la misma referencia documental; repetir con misma clave y cuerpo','Catálogo, migraciones y saldo previo conciliados en el entorno autorizado']};
}
if(require.main===module){
    try{
        const args=process.argv.slice(2),allowed=['--manifiesto','--sha256-aprobado','--salida'];const options={};
        for(let i=0;i<args.length;i+=2){if(!allowed.includes(args[i])||!args[i+1]||options[args[i]])throw new Error('Solo se permite preparar con --manifiesto, --sha256-aprobado y --salida opcional. No existe modo de envío.');options[args[i]]=args[i+1];}
        if(!options['--manifiesto'])throw new Error('Indica el manifiesto de conteo aprobado.');
        const plan=preparar(fs.readFileSync(options['--manifiesto']),options['--sha256-aprobado']);
        if(options['--salida'])fs.writeFileSync(options['--salida'],JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
        console.log(JSON.stringify({modo:plan.modo,sha256Manifiesto:plan.sha256Manifiesto,huellaServicio:plan.huellaServicio,medicamentos:plan.cuerpo.items.length,salidaCreada:!!options['--salida']}));
    }catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={preparar};
