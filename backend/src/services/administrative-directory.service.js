const v=require('../validators/administrative.validator');
const text=value=>String(value??'').normalize('NFC').trim();
const folded=value=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').replace(/\s+/gu,' ');
const document=value=>text(value); // Keep punctuation and leading zeroes intact.
const type=value=>text(value).toUpperCase();
function affiliate(a){return {id:String(a.id),nombres:a.nombres,apellidos:a.apellidos,tipo_documento:a.tipo_documento,documento:a.documento,correo:a.correo,estado:a.estado,eps_id:a.eps_id};}
function unifiedRows(accounts,affiliates){
    const rows=accounts.map(u=>({clave:`SALUDCLICK:${u.id}`,id:u.id,nombre:u.nombre,apellido:u.apellido,cedula:u.cedula,tipo_documento:u.tipo_documento,correo:u.correo,telefono:u.telefono,ciudad:u.ciudad,rol_id:u.rol_id,estado:u.estado,estado_cuenta:u.estado||'SIN_ESTADO',created_at:u.created_at,origen:'SaludClick',origenes:['SALUDCLICK'],tipo_registro:'CUENTA',afiliados_eps:[],revision_identidad:false,acciones:{consultar:true,editar:u.rol_id!==1}}));
    const documents=new Map();
    for(const r of rows){const key=document(r.cedula);if(key)documents.set(key,[...(documents.get(key)||[]),r]);}
    let matches=0,reviews=0;
    for(const a of affiliates){
        const candidates=documents.get(document(a.documento))||[];
        const compatible=candidates.filter(u=>{
            if(type(u.tipo_documento)&&type(a.tipo_documento))return type(u.tipo_documento)===type(a.tipo_documento);
            // A missing document type requires corroboration. Email alone never
            // merges people, nor does an ID originating in a different database.
            const name=folded(`${u.nombre||''} ${u.apellido||''}`),originalName=folded(`${a.nombres||''} ${a.apellidos||''}`);
            return Boolean(name&&originalName&&name===originalName)||Boolean(text(u.correo)&&text(u.correo).toLowerCase()===text(a.correo).toLowerCase());
        });
        if(candidates.length===1&&compatible.length===1){
            const row=compatible[0];row.afiliados_eps.push(affiliate(a));row.origen='SaludClick y EPS';row.origenes=['SALUDCLICK','EPS'];row.tipo_registro='CUENTA_Y_AFILIADO_EPS';matches++;continue;
        }
        const review=candidates.length>0;if(review){reviews++;for(const u of candidates)u.revision_identidad=true;}
        rows.push({clave:`EPS:${a.id}`,id:null,nombre:a.nombres,apellido:a.apellidos,cedula:a.documento,tipo_documento:a.tipo_documento,correo:a.correo,rol_id:null,estado:a.estado,estado_cuenta:'SIN_CUENTA',created_at:null,origen:'EPS',origenes:['EPS'],tipo_registro:'AFILIADO_EPS',afiliados_eps:[affiliate(a)],revision_identidad:review,acciones:{consultar:true,editar:false}});
    }
    rows.sort((a,b)=>Number(a.id===null)-Number(b.id===null)||String(a.apellido||'').localeCompare(String(b.apellido||''),'es')||String(a.nombre||'').localeCompare(String(b.nombre||''),'es')||a.clave.localeCompare(b.clave));
    return {rows,resumen:{registros_unicos:rows.length,cuentas_acceso:accounts.length,afiliados_eps:affiliates.length,coincidencias:matches,solo_eps:affiliates.length-matches,revision_identidad:reviews,cuentas_activas:accounts.filter(u=>u.estado==='ACTIVO').length,cuentas_inactivas:accounts.filter(u=>u.estado==='INACTIVO').length,cuentas_sin_estado:accounts.filter(u=>!u.estado).length}};
}
function directoryFilters(query={}){
    const f=v.filters(query);
    f.origen=v.text(query.origen,'Origen',20,false);f.tipo_registro=v.text(query.tipo_registro,'Tipo de registro',30,false);f.estado_afiliacion=v.text(query.estado_afiliacion,'Estado de afiliación',100,false);
    if(!['','SALUDCLICK','EPS'].includes(f.origen)||!['','CUENTAS','AFILIADOS','SIN_CUENTA','VINCULADOS'].includes(f.tipo_registro)||!['','ACTIVO','INACTIVO','SIN_ESTADO','SIN_CUENTA'].includes(f.estado)||f.rol_id&&![1,2,3,4].includes(f.rol_id))v.fail('Filtros del directorio no permitidos.');
    return f;
}
function filterRows(rows,f){
    const words=folded(f.buscar).split(' ').filter(Boolean);
    const from=f.desde?Date.parse(f.desde):null,to=f.hasta?Date.parse(f.hasta)+86400000:null;
    let withoutDate=0;
    const result=rows.filter(r=>{
        const search=[r.nombre,r.apellido,r.correo,r.cedula,...r.afiliados_eps.flatMap(a=>[a.nombres,a.apellidos,a.documento,a.correo])].map(folded).join(' ');
        if(!words.every(w=>search.includes(w))||f.origen&&!r.origenes.includes(f.origen)||f.estado&&r.estado_cuenta!==f.estado||f.rol_id&&r.rol_id!==f.rol_id||f.estado_afiliacion&&!r.afiliados_eps.some(a=>a.estado===f.estado_afiliacion))return false;
        if(f.tipo_registro==='CUENTAS'&&r.id===null||f.tipo_registro==='AFILIADOS'&&!r.afiliados_eps.length||f.tipo_registro==='SIN_CUENTA'&&r.id!==null||f.tipo_registro==='VINCULADOS'&&!(r.id!==null&&r.afiliados_eps.length))return false;
        if(from!==null||to!==null){if(!r.created_at){withoutDate++;return false;}const time=new Date(r.created_at).getTime();if(from!==null&&time<from||to!==null&&time>=to)return false;}
        return true;
    });
    return {rows:result,sinFechaExcluidos:withoutDate};
}
function createDirectoryService({local,source}){
    async function snapshot(){
        const [accounts,eps]=await Promise.all([local.read(),source.leer().catch(()=>{throw Object.assign(new Error('No se pudo consultar la fuente EPS. El directorio completo no está disponible; no se sustituyen los datos por una lista vacía.'),{public:true,status:503});})]);
        const data=unifiedRows(accounts,eps.afiliados);
        return {...data,filtros:{estados_afiliacion:[...new Set(eps.afiliados.map(a=>a.estado).filter(Boolean))].sort()}};
    }
    async function list(query){
        const f=directoryFilters(query),data=await snapshot(),filtered=filterRows(data.rows,f);
        const page=Math.min(f.page,Math.max(1,Math.ceil(filtered.rows.length/f.limit)));
        return {usuarios:filtered.rows.slice((page-1)*f.limit,page*f.limit),total:filtered.rows.length,page,limit:f.limit,resumen:data.resumen,filtros:data.filtros,sinFechaExcluidos:filtered.sinFechaExcluidos};
    }
    async function detail(key){
        if(typeof key!=='string'||key.length>180||!/^SALUDCLICK:[1-9]\d*$|^EPS:.+$/u.test(key))v.fail('Identificador de registro inválido.');
        const record=(await snapshot()).rows.find(r=>r.clave===key);
        if(!record)v.fail('Registro no encontrado.',404);return record;
    }
    async function report(kind,query){
        const f=directoryFilters(query),data=await snapshot();
        if(kind==='afiliados')f.tipo_registro='AFILIADOS';
        const filtered=filterRows(data.rows,f),rows=filtered.rows;
        let columns=['clave','nombre','apellido','correo','tipo_registro','rol_id','estado_cuenta','estado_afiliacion','origen','fecha_cuenta'];
        let output=rows.map(r=>({clave:r.clave,nombre:r.nombre,apellido:r.apellido,correo:r.correo,tipo_registro:r.tipo_registro,rol_id:r.rol_id,estado_cuenta:r.estado_cuenta,estado_afiliacion:r.afiliados_eps.map(a=>a.estado).join(' / '),origen:r.origen,fecha_cuenta:r.created_at}));
        if(kind==='afiliados')output=rows.flatMap(r=>r.afiliados_eps.map(a=>({clave:`EPS:${a.id}`,nombre:a.nombres,apellido:a.apellidos,correo:a.correo,tipo_registro:'AFILIADO_EPS',rol_id:r.rol_id,estado_cuenta:r.estado_cuenta,estado_afiliacion:a.estado,origen:r.origen,fecha_cuenta:r.created_at})));
        if(kind==='origenes'){
            columns=['concepto','total'];output=[{concepto:'Cuentas de acceso SaludClick',total:rows.filter(r=>r.id!==null).length},{concepto:'Afiliados EPS (incluye coincidencias)',total:rows.reduce((n,r)=>n+r.afiliados_eps.length,0)},{concepto:'Coincidencias ya incluidas',total:rows.filter(r=>r.id!==null&&r.afiliados_eps.length).length},{concepto:'Registros únicos, sin duplicar coincidencias',total:rows.length}];
        }
        return {tipo:kind,columnas:columns,filas:output.slice(0,1000),resumen:{registros:output.length,total:kind==='afiliados'?output.length:rows.length,cuentas_acceso:rows.filter(r=>r.id!==null).length,afiliados_eps:rows.reduce((n,r)=>n+r.afiliados_eps.length,0),coincidencias:rows.filter(r=>r.id!==null&&r.afiliados_eps.length).length,sin_fecha_excluidos:filtered.sinFechaExcluidos},limitado:output.length>1000,limite:1000,generadoEn:new Date().toISOString(),filtros:f,aviso:filtered.sinFechaExcluidos?'El rango usa la fecha de la cuenta local. Los afiliados sin fecha de registro en origen se excluyen del rango.':''};
    }
    return {snapshot,list,detail,report,summary:async()=>(await snapshot()).resumen};
}
let instance;
function getDirectoryService(){
    return instance??=createDirectoryService({local:require('../repositories/administrative-directory.repository').createDirectoryRepository(require('../config/prisma')),source:require('../repositories/afiliados-origen.repository')});
}
module.exports={createDirectoryService,getDirectoryService,unifiedRows,directoryFilters,filterRows};
