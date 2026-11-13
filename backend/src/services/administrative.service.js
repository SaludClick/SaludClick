const bcrypt=require('bcrypt');
const v=require('../validators/administrative.validator');
const reportTypes=['usuarios','pacientes','estados','clientes','roles','solicitudes','atendidas','tiempos','conversaciones','actividad'];
const categories=['ACCESO','CUENTA','DATOS_PERSONALES','SOPORTE','OTRA_ADMINISTRATIVA'];
function createService(repo) {
    async function createUser(actor,input) { const data=v.account(input,true); data.password=await bcrypt.hash(data.password,12); return repo.createUser(actor,data); }
    const updateUser=(actor,id,input)=>repo.updateUser(actor,v.id(id),v.account(input));
    function caseInput(input={}) {
        if(!['SOLICITUD','CONVERSACION'].includes(input.tipo)||!categories.includes(input.categoria)) v.fail('Selecciona una atención y categoría administrativas.');
        return {tipo:input.tipo,categoria:input.categoria,asunto:v.text(input.asunto,'Asunto',160),contenido:v.text(input.contenido,'Mensaje',2000)};
    }
    function updateCase(actor,id,input={}) {
        if(Object.keys(input).some(k=>!['estado','responsable_id'].includes(k))||!Object.keys(input).length) v.fail('Cambio de atención inválido.');
        const data={};
        if(Object.hasOwn(input,'estado')) { if(!['ABIERTA','EN_ATENCION','RESUELTA','CERRADA'].includes(input.estado)) v.fail('Estado inválido.'); data.estado=input.estado; }
        if(Object.hasOwn(input,'responsable_id')) data.responsable_id=input.responsable_id===null?null:v.id(input.responsable_id);
        return repo.updateCase(actor,v.id(id),data,v.transition);
    }
    function setting(key,input) {
        if(key==='general') return {nombrePanel:v.text(input.nombrePanel,'Nombre del panel',80),mensajeSoporte:v.text(input.mensajeSoporte,'Mensaje de soporte',500)};
        if(key==='faq') {
            if(!Array.isArray(input)||input.length>30) v.fail('Máximo 30 respuestas frecuentes.');
            return input.map(item=>({pregunta:v.text(item.pregunta,'Pregunta',160),respuesta:v.text(item.respuesta,'Respuesta',1000)}));
        }
        v.fail('Parámetro no permitido.',403);
    }
    async function password(actor,input={}) {
        if(typeof input.actual!=='string'||input.actual.length>200||typeof input.nueva!=='string'||input.nueva.length<12||Buffer.byteLength(input.nueva)>72||input.nueva===input.actual) v.fail('Usa tu contraseña actual y una nueva distinta de al menos 12 caracteres y máximo 72 bytes.');
        const hash=await repo.passwordHash(actor);
        if(!hash || !await bcrypt.compare(input.actual,hash)) v.fail('La contraseña actual no es correcta.',403);
        await repo.changePassword(actor,hash,await bcrypt.hash(input.nueva,12));
    }
    return {createUser,updateUser,caseInput,updateCase,setting,password,
        report:(type,query)=>{if(!reportTypes.includes(type)) v.fail('Informe no disponible.',404);return repo.report(type,v.filters(query));},
        profile:input=>({nombre:v.text(input.nombre,'Nombre',100),apellido:v.text(input.apellido,'Apellido',100),telefono:v.text(input.telefono,'Teléfono',20,false),ciudad:v.text(input.ciudad,'Ciudad',100,false)}),
        preferences:input=>{if(typeof input.notificaciones!=='boolean'||typeof input.compacto!=='boolean')v.fail('Preferencias inválidas.');return {notificaciones:input.notificaciones,compacto:input.compacto};}
    };
}
module.exports={createService,reportTypes,categories};
