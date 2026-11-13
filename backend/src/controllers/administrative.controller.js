const {getRepository}=require('../repositories/administrative.repository');
const {createService}=require('../services/administrative.service');
const v=require('../validators/administrative.validator');
const exportsService=require('../services/administrative-export.service');
function createController({repo=getRepository(),emit=()=>{},directory}={}) {
    const service=createService(repo),actor=req=>req.usuario?.id,staff=req=>req.usuario?.rol_id===1;
    const getDirectory=()=>directory??=require('../services/administrative-directory.service').getDirectoryService();
    const wrap=(fn,mutation=false)=>async(req,res)=>{
        try {
            const result=await fn(req,res);
            if(mutation&&!result?.mensaje?.repetido) { try{emit(req,result?.evento||{caso_id:result?.caso?.id??result?.mensaje?.caso_id,cliente_id:result?.caso?.cliente_id??result?.mensaje?.cliente_id,actor_id:actor(req)});}catch{/* notifications persist even if realtime is unavailable */} }
            if(!res.headersSent){const {evento,...response}=result||{};res.json({ok:true,...response});}
        }catch(error){
            if(mutation && req.usuario) {try{await repo.recordFailure(actor(req),'OPERACION_RECHAZADA');}catch{/* No secret logging or fallback writes */}}
            const schema=['P2021','P2022','42P01','42703'].includes(error.code)||['42P01','42703'].includes(error.meta?.code);
            const conflict=['P2002','23505','P2034','40001'].includes(error.code)||['23505','40001'].includes(error.meta?.code);
            res.status(schema?503:conflict?409:error.public?error.status||400:500).json({ok:false,codigo:schema?'ADMIN_SCHEMA_PENDING':undefined,mensaje:schema?'El módulo requiere la migración administrativa pendiente de autorización.':conflict?'Datos duplicados o cambios simultáneos. Actualiza e inténtalo de nuevo.':error.public?error.message:'No se pudo completar la operación administrativa.'});
        }
    };
    return {
        visitorConversation:wrap(async req=>repo.visitorConversation(req.visitorHash,req.query.antes?v.id(req.query.antes):undefined)),
        visitorMessage:wrap(async req=>{const input=v.message(req.body,true);return repo.visitorMessage(req.visitorHash,input.contenido,input.key);},true),
        visitorRead:wrap(async req=>repo.visitorRead(req.visitorHash,v.id(req.body.hasta)),true),
        dashboard:wrap(async req=>{const stats=await repo.dashboard(actor(req));return {estadisticas:{...stats,directorio:await getDirectory().summary()}};}),
        users:wrap(async req=>await getDirectory().list(req.query)),
        localUsers:wrap(async req=>await repo.users(v.filters(req.query))),
        directoryDetail:wrap(async req=>({registro:await getDirectory().detail(req.params.clave)})),
        userDetail:wrap(async req=>({usuario:await repo.userDetail(v.id(req.params.id))})),
        createUser:wrap(async(req,res)=>{const usuario=await service.createUser(actor(req),req.body);res.status(201);return {usuario};},true),
        updateUser:wrap(async req=>({usuario:await service.updateUser(actor(req),req.params.id,req.body)}),true),
        administrators:wrap(async()=>({administradores:await repo.administrators()})),
        cases:wrap(async req=>await repo.cases(actor(req),staff(req),v.filters(req.query))),
        caseDetail:wrap(async req=>await repo.caseDetail(actor(req),staff(req),v.id(req.params.id),req.query.antes?v.id(req.query.antes):undefined)),
        createCase:wrap(async(req,res)=>{const caso=await repo.createCase(actor(req),service.caseInput(req.body));res.status(201);return {caso};},true),
        conversation:wrap(async(req,res)=>{const result=await repo.ensureConversation(actor(req));res.status(result.creada?201:200);return result;},true),
        currentConversation:wrap(async req=>await repo.currentConversation(actor(req))),
        vitalixMessage:wrap(async req=>{const input=v.message(req.body,true);return repo.receiveVitalix(actor(req),input.contenido,input.key);},true),
        reopenConversation:wrap(async req=>({caso:await repo.reopenConversation(actor(req),staff(req),v.id(req.params.id))}),true),
        updateCase:wrap(async req=>({caso:await service.updateCase(actor(req),req.params.id,req.body)}),true),
        send:wrap(async req=>{const input=v.message(req.body);return {mensaje:await repo.send(actor(req),staff(req),v.id(req.params.id),input.contenido,input.key)};},true),
        read:wrap(async req=>{const id=v.id(req.params.id),read=await repo.markRead(actor(req),staff(req),id,v.id(req.body.hasta));return {leidos:read.length,evento:{caso_id:id,cliente_id:read.cliente_id??read[0]?.cliente_id,actor_id:actor(req)}};},true),
        notifications:wrap(async req=>await repo.notifications(actor(req),v.filters(req.query))),
        readAllNotifications:wrap(async req=>({leidas:(await repo.readAllNotifications(actor(req))).length}),true),
        readNotification:wrap(async req=>{const result=await repo.readNotification(actor(req),v.id(req.params.id));if(!result.length)v.fail('Notificación no encontrada.',404);return {};},true),
        audit:wrap(async req=>({actividades:await repo.audits(v.filters(req.query))})),
        settings:wrap(async()=>({configuracion:await repo.settings()})),
        saveSetting:wrap(async req=>({configuracion:await repo.saveSetting(actor(req),req.params.clave,service.setting(req.params.clave,req.body.valor))}),true),
        preferences:wrap(async req=>({preferencias:await repo.preferences(actor(req))})),
        savePreferences:wrap(async req=>({preferencias:await repo.savePreferences(actor(req),service.preferences(req.body))}),true),
        profile:wrap(async req=>({usuario:await repo.profile(actor(req))})),
        saveProfile:wrap(async req=>({usuario:await repo.saveProfile(actor(req),service.profile(req.body))}),true),
        password:wrap(async req=>{await service.password(actor(req),req.body);return {mensaje:'Contraseña cambiada. Inicia sesión de nuevo.'};},true),
        report:wrap(async(req,res)=>{
            const report=['usuarios','afiliados','origenes'].includes(req.params.tipo)?await getDirectory().report(req.params.tipo,req.query):await service.report(req.params.tipo,req.query);
            if(!req.query.formato||req.query.formato==='json')return {informe:report};
            if(!['csv','pdf'].includes(req.query.formato))v.fail('Formato inválido.');
            // Exports are administrative activity; no report bodies or PII in audit.
            const format=req.query.formato;
            await repo.recordExport(actor(req),report.tipo);
            res.setHeader('Content-Disposition',`attachment; filename="saludclick-${report.tipo}.${format}"`);
            res.type(format==='csv'?'text/csv; charset=utf-8':'application/pdf');
            res.send(exportsService[format](report));
        }),
        faq:wrap(async()=>({preguntas:(await repo.settings()).find(x=>x.clave==='faq')?.valor||[],aviso:'Orientación administrativa. No se brinda asesoría médica; para temas clínicos contacta al profesional o rol competente.'}))
    };
}
module.exports={createController};
