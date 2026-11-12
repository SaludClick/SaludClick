const fail = (message, status=400) => { throw Object.assign(new Error(message), {status, public:true}); };
function text(value, name, max=200, required=true) {
    if (typeof value !== 'string') { if (!required && value == null) return ''; fail(`${name}: texto inválido.`); }
    const result=value.normalize('NFC').trim();
    if ((required && !result) || result.length>max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(result)) fail(`${name}: longitud o contenido inválido.`);
    return result;
}
function id(value) { const n=Number(value); if(!Number.isSafeInteger(n)||n<1) fail('Identificador inválido.'); return n; }
function account(input, creating=false) {
    if (!input || typeof input!=='object' || Array.isArray(input)) fail('Cuenta inválida.');
    const allowed=['nombre','apellido','correo','cedula','telefono','ciudad','rol_id','estado',...(creating?['password']:[])];
    if(Object.keys(input).some(k=>!allowed.includes(k))) fail('La cuenta contiene campos no permitidos.');
    const result={};
    for(const [key,max] of Object.entries({nombre:100,apellido:100,correo:150,cedula:30,telefono:20,ciudad:100})) {
        if(creating || Object.hasOwn(input,key)) result[key]=text(input[key],key,max,['nombre','apellido','correo','cedula'].includes(key));
    }
    if(result.correo!==undefined) { result.correo=result.correo.toLowerCase(); if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(result.correo)) fail('Correo inválido.'); }
    if(creating || Object.hasOwn(input,'rol_id')) { result.rol_id=Number(input.rol_id); if(![2,3,4].includes(result.rol_id)) fail('Solo puedes asignar los roles cliente, farmacia o EPS.',403); }
    if(creating || Object.hasOwn(input,'estado')) { result.estado=input.estado ?? 'ACTIVO'; if(!['ACTIVO','INACTIVO'].includes(result.estado)) fail('Estado de cuenta inválido.'); }
    if(creating) { if(typeof input.password!=='string'||input.password.length<12||Buffer.byteLength(input.password)>72) fail('La contraseña debe tener al menos 12 caracteres y máximo 72 bytes.'); result.password=input.password; }
    if(!Object.keys(result).length) fail('No hay cambios para guardar.');
    return result;
}
function filters(query={}) {
    const result={buscar:text(query.buscar,'Búsqueda',120,false),estado:text(query.estado,'Estado',30,false),tipo:text(query.tipo,'Tipo',20,false),accion:text(query.accion,'Acción',60,false),page:id(query.page??1),limit:Math.min(id(query.limit??20),100)};
    if(result.page>100000) fail('Página fuera de rango.');
    for(const key of ['desde','hasta']) {
        const date=query[key]; if(!date) continue;
        if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date) fail('Fecha inválida.');
        result[key]=date;
    }
    if(result.desde&&result.hasta&&result.desde>result.hasta) fail('El rango de fechas no es válido.');
    if(query.rol_id) result.rol_id=id(query.rol_id);
    return result;
}
const transitions={ABIERTA:['EN_ATENCION','CERRADA'],EN_ATENCION:['RESUELTA','CERRADA'],RESUELTA:['EN_ATENCION','CERRADA'],CERRADA:[]};
function transition(from,to) { if(!transitions[from]?.includes(to)) fail('La transición de estado no está permitida.',409); }
module.exports={fail,text,id,account,filters,transition};
