const { fallo } = require('../config/farmacia-operacion');
const bad = () => fallo(400, 'FARMACIA_DATOS_INVALIDOS', 'Revisa los filtros y los campos permitidos.');
function texto(value, max, required = false) {
    if (typeof value !== 'string' || value.length > max || /[\x00-\x1f\x7f]/.test(value) || (required && !value.trim())) throw bad();
    return value.trim();
}
function entero(value) {
    if (!/^[1-9]\d{0,9}$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value)>2147483647) throw bad();
    return Number(value);
}
function objeto(input, keys) {
    if (!input || Array.isArray(input) || typeof input!=='object' || Object.keys(input).some(k=>!keys.includes(k))) throw bad();
}
function fecha(raw) {
    if (typeof raw!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(Date.parse(raw)) || new Date(raw).toISOString().slice(0,10)!==raw) throw bad();
    return raw;
}
function listado(q={}) {
    objeto(q,['estado','id','paciente','documento','desde','hasta','pagina','tamano']);
    const estado=q.estado || 'activas';
    if (!['activas','todas','PENDIENTE','APROBADA','PREPARANDO','LISTA','ENTREGADA','CANCELADA'].includes(estado)) throw bad();
    const pagina=entero(q.pagina || '1'),take=entero(q.tamano || '25');
    if(take>50 || pagina>100000)throw bad();
    const desde=q.desde?fecha(q.desde):null,hasta=q.hasta?fecha(q.hasta):null;
    if(desde&&hasta&&desde>hasta)throw bad();
    const documento=texto(q.documento ?? '',30);
    return {estado,id:q.id?entero(q.id):null,paciente:texto(q.paciente ?? '',150),documento,desde,hasta,pagina,take,skip:(pagina-1)*take};
}
function transicion(body) {
    objeto(body,['estadoActual','estado','version','clave','recepcion','observaciones']);
    if (!({APROBADA:'PREPARANDO',PREPARANDO:'LISTA',LISTA:'ENTREGADA'})[body.estadoActual] || ({APROBADA:'PREPARANDO',PREPARANDO:'LISTA',LISTA:'ENTREGADA'})[body.estadoActual]!==body.estado || typeof body.clave!=='string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.clave)) throw bad();
    const recepcion=texto(body.recepcion ?? '',500),observaciones=texto(body.observaciones ?? '',500);
    if(body.estado==='ENTREGADA'&&!recepcion)throw bad();
    return {estadoActual:body.estadoActual,estado:body.estado,version:entero(body.version),clave:body.clave.toLowerCase(),recepcion,observaciones};
}
function imagen(value) {
    const raw=texto(value,255);if(!raw)return null;
    let url;try{url=new URL(raw);}catch{throw bad();}
    const host=url.hostname.toLowerCase().replace(/\.$/,'');
    if(url.protocol!=='https:'||url.username||url.password||url.port||!host.includes('.')||/^\d+\./.test(host)||host.includes(':')||/\.(local|localhost|internal|test|invalid)$/.test(host)||url.href.length>255)throw Object.assign(bad(),{message:'Indica una URL HTTPS de imagen válida.'});
    // El servidor nunca descarga la URL; el navegador usa referrerpolicy=no-referrer.
    return url.href;
}
function medicamento(body, editar=false) {
    objeto(body,['nombre','descripcion','presentacion','imagen','foto','categoria_id','precio','estado','stock','stock_minimo',...(editar?['version','stockEsperado']:[])]);
    const data={nombre:texto(body.nombre,150,true),descripcion:texto(body.descripcion,2000,true),presentacion:editar && body.presentacion===null ? null : texto(body.presentacion,180,true),categoria_id:entero(body.categoria_id),estado:body.estado};
    if(Object.hasOwn(body,'foto')){
        if(body.imagen)throw bad();
        data.foto=body.foto;
    } else if(!editar||Object.hasOwn(body,'imagen'))data.imagen=imagen(body.imagen ?? '');
    if(!['DISPONIBLE','AGOTADO','INACTIVO'].includes(data.estado))throw bad();
    if(Object.hasOwn(body,'precio')){
        if(typeof body.precio!=='number'||!Number.isFinite(body.precio)||body.precio<0||body.precio>99999999.99||Math.abs(Math.round(body.precio*100)-body.precio*100)>0.00001)throw bad();
        data.precio=body.precio;
    }
    for(const key of ['stock','stock_minimo','stockEsperado']){
        if(!Object.hasOwn(body,key))continue;
        const units=body[key];
        const limit=key==='stockEsperado'?-2147483648:0;
        if(!Number.isSafeInteger(units)||units<limit||units>2147483647)throw fallo(400,'STOCK_INVALIDO','La cantidad y el stock mínimo deben ser números enteros no negativos.');
        data[key]=units;
    }
    if(editar&&Object.hasOwn(data,'stock')&&!Object.hasOwn(data,'stockEsperado'))throw bad();
    if(editar)data.version=entero(body.version);
    return data;
}
function periodo(q={}) {
    objeto(q,['desde','hasta']);
    const hasta=q.hasta?fecha(q.hasta):new Date().toISOString().slice(0,10);
    const desde=q.desde?fecha(q.desde):`${hasta.slice(0,4)}-01-01`;
    if(desde>hasta || (Date.parse(hasta)-Date.parse(desde))/86400000>1096)throw bad();
    return {desde,hasta};
}
module.exports={texto,entero,objeto,fecha,listado,transicion,imagen,medicamento,periodo};
