// All SQL structure is fixed here. User values are always bound parameters.
function createRepository(prisma) {
    const q=(db,sql,...args)=>db.$queryRawUnsafe(sql,...args);
    const rows=(sql,...args)=>q(prisma,sql,...args);
    const tx=fn=>prisma.$transaction(fn,{isolationLevel:'Serializable',timeout:15000});
    const userFields='id,nombre,apellido,correo,cedula,telefono,ciudad,rol_id,estado,created_at';
    async function audit(db,actor,action,entity,record,fields=[],result='EXITO') {
        await q(db,'INSERT INTO administrative_audit(actor_id,accion,entidad,registro_id,campos,resultado) VALUES($1,$2,$3,$4,$5::text[],$6) RETURNING id',actor,action,entity,String(record),fields,result);
    }
    async function notify(db,caseId,type,title,recipient=null,exclude=0) {
        await q(db,`INSERT INTO administrative_notifications(destinatario_id,caso_id,tipo,titulo)
            SELECT u.id,$1,$2,$3 FROM usuarios u
            WHERE u.estado='ACTIVO' AND u.id<>$5 AND (($4::int IS NULL AND u.rol_id=1) OR u.id=$4)
            AND NOT EXISTS(SELECT 1 FROM administrative_preferences p WHERE p.usuario_id=u.id AND NOT p.notificaciones)
            RETURNING id`,caseId,type,title,recipient,exclude);
    }
    const filterParams=f=>[f.buscar||'',f.desde||null,f.hasta||null];
    const dateFilter=(alias='')=>`($2::date IS NULL OR ${alias}created_at >= $2::date) AND ($3::date IS NULL OR ${alias}created_at < $3::date+interval '1 day')`;
    async function dashboard(actor) {
        const [users,cases,messages,notifications,recent]=await Promise.all([
            rows(`SELECT count(*)::int total,count(*) FILTER(WHERE estado='ACTIVO')::int activos,count(*) FILTER(WHERE estado='INACTIVO')::int inactivos,count(*) FILTER(WHERE estado IS NULL)::int sin_estado,count(*) FILTER(WHERE rol_id=2)::int clientes FROM usuarios`),
            rows(`SELECT count(*) FILTER(WHERE tipo='SOLICITUD' AND estado IN ('ABIERTA','EN_ATENCION'))::int abiertas,count(*) FILTER(WHERE tipo='SOLICITUD' AND estado IN ('RESUELTA','CERRADA'))::int atendidas FROM administrative_cases`),
            rows(`SELECT count(*)::int pendientes FROM administrative_messages m JOIN administrative_cases c ON c.id=m.caso_id JOIN usuarios u ON u.id=m.remitente_id WHERE m.leido_at IS NULL AND u.rol_id=2 AND (c.responsable_id=$1 OR c.responsable_id IS NULL)`,actor),
            rows('SELECT count(*)::int sin_leer FROM administrative_notifications WHERE destinatario_id=$1 AND leida_at IS NULL',actor),
            rows('SELECT id,actor_id,accion,entidad,registro_id,resultado,created_at FROM administrative_audit ORDER BY id DESC LIMIT 12')
        ]);
        return {usuarios:users[0],solicitudes:cases[0],mensajes:messages[0],notificaciones:notifications[0],actividad:recent};
    }
    async function users(f) {
        const result=await rows(`SELECT ${userFields},count(*) OVER()::int AS total FROM usuarios WHERE
            ($1='' OR concat_ws(' ',nombre,apellido,correo,cedula) ILIKE '%'||$1||'%') AND
            ($2::int IS NULL OR rol_id=$2) AND ($3='' OR estado::text=$3 OR ($3='SIN_ESTADO' AND estado IS NULL))
            ORDER BY id DESC LIMIT $4 OFFSET $5`,f.buscar,f.rol_id||null,f.estado,f.limit,(f.page-1)*f.limit);
        return {usuarios:result.map(({total,...u})=>u),total:result[0]?.total||0,page:f.page,limit:f.limit};
    }
    async function duplicate(db,data,except=0) {
        const existing=await q(db,`SELECT id FROM usuarios WHERE id<>$3 AND (lower(correo)=lower($1) OR ($2::text IS NOT NULL AND cedula=$2)) LIMIT 1`,data.correo||null,data.cedula||null,except);
        if(existing.length) throw Object.assign(new Error('El correo o documento ya pertenece a otra cuenta.'),{status:409,public:true});
    }
    const createUser=(actor,data)=>tx(async db=>{
        // Serialize administrative writers; database constraints remain the final guard.
        await q(db,'SELECT pg_advisory_xact_lock(72411012)::text AS locked');
        await duplicate(db,data);
        const [u]=await q(db,`INSERT INTO usuarios(nombre,apellido,correo,cedula,telefono,ciudad,rol_id,estado,password) VALUES($1,$2,$3,$4,$5,$6,$7,$8::"EstadoUsuario",$9) RETURNING ${userFields}`,data.nombre,data.apellido,data.correo,data.cedula,data.telefono||null,data.ciudad||null,data.rol_id,data.estado,data.password);
        await audit(db,actor,'USUARIO_CREADO','USUARIO',u.id,Object.keys(data).filter(k=>k!=='password'));
        await notify(db,null,'CUENTA','Se creó una cuenta administrativa',null,actor);
        return u;
    });
    const updateUser=(actor,id,data)=>tx(async db=>{
        await q(db,'SELECT pg_advisory_xact_lock(72411012)::text AS locked');
        const [old]=await q(db,`SELECT ${userFields} FROM usuarios WHERE id=$1 FOR UPDATE`,id);
        if(!old) throw Object.assign(new Error('Cuenta no encontrada.'),{status:404,public:true});
        if(old.rol_id===1 || id===actor) throw Object.assign(new Error('Las cuentas administrativas no se modifican desde la gestión de clientes. Usa tu perfil para tus datos.'),{status:403,public:true});
        const next={...old,...data}; await duplicate(db,next,id);
        const [u]=await q(db,`UPDATE usuarios SET nombre=$1,apellido=$2,correo=$3,cedula=$4,telefono=$5,ciudad=$6,rol_id=$7,estado=$8::"EstadoUsuario",updated_at=now() WHERE id=$9 RETURNING ${userFields}`,next.nombre,next.apellido,next.correo,next.cedula,next.telefono,next.ciudad,next.rol_id,next.estado,id);
        if(next.rol_id!==old.rol_id || next.estado!==old.estado) await q(db,`INSERT INTO administrative_preferences(usuario_id,sesiones_revocadas_at) VALUES($1,now()) ON CONFLICT(usuario_id) DO UPDATE SET sesiones_revocadas_at=now() RETURNING usuario_id`,id);
        await audit(db,actor,'USUARIO_ACTUALIZADO','USUARIO',id,Object.keys(data));
        await notify(db,null,'CUENTA','Se actualizó una cuenta',null,actor);
        return u;
    });
    const access=(actor,staff)=>staff?'TRUE':'c.cliente_id=$1';
    async function cases(actor,staff,f) {
        const result=await rows(`SELECT c.*,u.nombre AS cliente_nombre,u.apellido AS cliente_apellido,
            r.nombre AS responsable_nombre,count(*) OVER()::int AS total,
            (SELECT count(*)::int FROM administrative_messages m JOIN usuarios sender ON sender.id=m.remitente_id WHERE m.caso_id=c.id AND m.leido_at IS NULL AND ${staff?"sender.rol_id=2":"sender.rol_id=1"}) AS pendientes
            FROM administrative_cases c JOIN usuarios u ON u.id=c.cliente_id LEFT JOIN usuarios r ON r.id=c.responsable_id
            WHERE ${access(actor,staff)} AND ($2='' OR concat_ws(' ',c.asunto,u.nombre,u.apellido,u.correo) ILIKE '%'||$2||'%')
            AND ($3='' OR c.estado=$3) AND ($4='' OR c.tipo=$4)
            AND ($5::date IS NULL OR c.created_at >= $5::date) AND ($6::date IS NULL OR c.created_at < $6::date+interval '1 day')
            AND $1::int>0 ORDER BY c.updated_at DESC,c.id DESC LIMIT $7 OFFSET $8`,actor,f.buscar,f.estado,f.tipo,f.desde||null,f.hasta||null,f.limit,(f.page-1)*f.limit);
        return {casos:result.map(({total,...c})=>c),total:result[0]?.total||0,page:f.page,limit:f.limit};
    }
    async function caseDetail(actor,staff,id,before=2147483647) {
        const [caso]=await rows(`SELECT c.*,u.nombre AS cliente_nombre,u.apellido AS cliente_apellido FROM administrative_cases c JOIN usuarios u ON u.id=c.cliente_id WHERE c.id=$2 AND ${access(actor,staff)} AND $1::int>0`,actor,id);
        if(!caso) throw Object.assign(new Error('Atención no encontrada.'),{status:404,public:true});
        const mensajes=(await rows(`SELECT m.id,m.caso_id,m.remitente_id,m.contenido,m.created_at,m.leido_at,u.nombre,u.rol_id FROM administrative_messages m JOIN usuarios u ON u.id=m.remitente_id WHERE m.caso_id=$1 AND m.id<$2 ORDER BY m.id DESC LIMIT 100`,id,before)).reverse();
        const historial=await rows(`SELECT id,actor_id,accion,resultado,created_at,campos FROM administrative_audit WHERE entidad='ATENCION' AND registro_id=$1 ORDER BY id DESC LIMIT 100`,String(id));
        return {caso,mensajes,historial,hayAnteriores:mensajes.length===100};
    }
    const createCase=(actor,data)=>tx(async db=>{
        const [c]=await q(db,'INSERT INTO administrative_cases(cliente_id,tipo,asunto,categoria) VALUES($1,$2,$3,$4) RETURNING *',actor,data.tipo,data.asunto,data.categoria);
        await q(db,'INSERT INTO administrative_messages(caso_id,remitente_id,contenido) VALUES($1,$2,$3) RETURNING id',c.id,actor,data.contenido);
        await audit(db,actor,'ATENCION_CREADA','ATENCION',c.id,['tipo','asunto','categoria']);
        await notify(db,c.id,'NUEVA_ATENCION',data.tipo==='CONVERSACION'?'Una conversación requiere atención':'Nueva solicitud administrativa');
        return c;
    });
    const updateCase=(actor,id,data,validateTransition)=>tx(async db=>{
        const [old]=await q(db,'SELECT * FROM administrative_cases WHERE id=$1 FOR UPDATE',id);
        if(!old) throw Object.assign(new Error('Atención no encontrada.'),{status:404,public:true});
        if(data.estado && data.estado!==old.estado) validateTransition(old.estado,data.estado);
        const responsible=Object.hasOwn(data,'responsable_id')?data.responsable_id:old.responsable_id;
        if(responsible!==null) {
            const found=await q(db,"SELECT id FROM usuarios WHERE id=$1 AND rol_id=1 AND estado='ACTIVO'",responsible);
            if(!found.length) throw Object.assign(new Error('El responsable debe ser un administrador activo.'),{status:400,public:true});
        }
        const state=data.estado||old.estado;
        const [c]=await q(db,`UPDATE administrative_cases SET estado=$2,responsable_id=$3,updated_at=now(),resuelta_at=CASE WHEN $2='RESUELTA' THEN coalesce(resuelta_at,now()) WHEN $2='EN_ATENCION' THEN NULL ELSE resuelta_at END,cerrada_at=CASE WHEN $2='CERRADA' THEN coalesce(cerrada_at,now()) ELSE cerrada_at END WHERE id=$1 RETURNING *`,id,state,responsible);
        await audit(db,actor,'ATENCION_ACTUALIZADA','ATENCION',id,Object.keys(data));
        await notify(db,id,'ESTADO','Tu atención administrativa fue actualizada',old.cliente_id);
        if(responsible && responsible!==actor) await notify(db,id,'ASIGNACION','Se te asignó una atención',responsible);
        return c;
    });
    const send=(actor,staff,id,content)=>tx(async db=>{
        const [c]=await q(db,`SELECT c.* FROM administrative_cases c WHERE c.id=$2 AND ${access(actor,staff)} AND $1::int>0 FOR UPDATE`,actor,id);
        if(!c) throw Object.assign(new Error('Atención no encontrada.'),{status:404,public:true});
        if(['CERRADA','RESUELTA'].includes(c.estado)) throw Object.assign(new Error('La atención debe estar abierta o en atención para responder.'),{status:409,public:true});
        if(staff && c.responsable_id && c.responsable_id!==actor) throw Object.assign(new Error('Reasigna la atención antes de responder.'),{status:403,public:true});
        const [message]=await q(db,'INSERT INTO administrative_messages(caso_id,remitente_id,contenido) VALUES($1,$2,$3) RETURNING *',id,actor,content);
        await q(db,`UPDATE administrative_cases SET updated_at=now(),responsable_id=CASE WHEN $2 THEN coalesce(responsable_id,$3) ELSE responsable_id END,estado=CASE WHEN $2 THEN 'EN_ATENCION' ELSE estado END WHERE id=$1 RETURNING id`,id,staff,actor);
        await audit(db,actor,'MENSAJE_ENVIADO','ATENCION',id,[]);
        await notify(db,id,'MENSAJE',staff?'Administración respondió a tu consulta':'Nuevo mensaje de un cliente',staff?c.cliente_id:c.responsable_id,actor);
        return message;
    });
    async function markRead(actor,staff,id,lastId) {
        // Ownership is checked again in the UPDATE; GET requests never mark as read.
        return rows(`UPDATE administrative_messages m SET leido_at=now() FROM administrative_cases c,usuarios u
            WHERE c.id=m.caso_id AND u.id=m.remitente_id AND c.id=$2 AND ${access(actor,staff)}
            AND m.id<=$3 AND m.leido_at IS NULL AND u.rol_id=$4 AND $1::int>0 RETURNING m.id`,actor,id,lastId,staff?2:1);
    }
    async function notifications(actor,f) {
        const items=await rows(`SELECT n.*,c.tipo AS caso_tipo,count(*) OVER()::int AS total FROM administrative_notifications n LEFT JOIN administrative_cases c ON c.id=n.caso_id WHERE n.destinatario_id=$1 AND ($2='' OR ($2='NO_LEIDA' AND n.leida_at IS NULL) OR ($2='LEIDA' AND n.leida_at IS NOT NULL)) AND ($3='' OR n.titulo ILIKE '%'||$3||'%') ORDER BY n.id DESC LIMIT $4 OFFSET $5`,actor,f.estado,f.buscar,f.limit,(f.page-1)*f.limit);
        const [count]=await rows('SELECT count(*)::int total FROM administrative_notifications WHERE destinatario_id=$1 AND leida_at IS NULL',actor);
        return {notificaciones:items.map(({total,...n})=>n),total:items[0]?.total||0,sinLeer:count.total,page:f.page,limit:f.limit};
    }
    const readNotification=(actor,id)=>rows('UPDATE administrative_notifications SET leida_at=coalesce(leida_at,now()) WHERE id=$1 AND destinatario_id=$2 RETURNING id',id,actor);
    const administrators=()=>rows("SELECT id,nombre,apellido FROM usuarios WHERE rol_id=1 AND estado='ACTIVO' ORDER BY nombre,id");
    async function audits(f) {
        return rows(`SELECT id,actor_id,accion,entidad,registro_id,resultado,campos,created_at,count(*) OVER()::int AS total FROM administrative_audit WHERE ($1='' OR concat_ws(' ',accion,entidad,registro_id,actor_id::text) ILIKE '%'||$1||'%') AND ${dateFilter()} AND ($4='' OR accion=$4) ORDER BY id DESC LIMIT $5 OFFSET $6`,...filterParams(f),f.accion,f.limit,(f.page-1)*f.limit);
    }
    const settings=()=>rows('SELECT clave,valor,updated_at FROM administrative_settings ORDER BY clave');
    const saveSetting=(actor,key,value)=>tx(async db=>{
        const [s]=await q(db,'INSERT INTO administrative_settings(clave,valor) VALUES($1,$2::jsonb) ON CONFLICT(clave) DO UPDATE SET valor=EXCLUDED.valor,updated_at=now() RETURNING clave,valor,updated_at',key,JSON.stringify(value));
        await audit(db,actor,'CONFIGURACION_ACTUALIZADA','CONFIGURACION',key,[key]);
        await notify(db,null,'CONFIGURACION','Se actualizó la configuración administrativa',null,actor);
        return s;
    });
    async function preferences(actor) { return (await rows('SELECT notificaciones,compacto FROM administrative_preferences WHERE usuario_id=$1',actor))[0]||{notificaciones:true,compacto:false}; }
    const savePreferences=(actor,data)=>tx(async db=>{
        const [p]=await q(db,'INSERT INTO administrative_preferences(usuario_id,notificaciones,compacto) VALUES($1,$2,$3) ON CONFLICT(usuario_id) DO UPDATE SET notificaciones=$2,compacto=$3 RETURNING notificaciones,compacto',actor,data.notificaciones,data.compacto);
        await audit(db,actor,'PREFERENCIAS_ACTUALIZADAS','USUARIO',actor,['notificaciones','compacto']); return p;
    });
    const profile=async actor=>(await rows(`SELECT ${userFields} FROM usuarios WHERE id=$1`,actor))[0];
    const saveProfile=(actor,data)=>tx(async db=>{
        const [u]=await q(db,`UPDATE usuarios SET nombre=$2,apellido=$3,telefono=$4,ciudad=$5,updated_at=now() WHERE id=$1 AND rol_id=1 RETURNING ${userFields}`,actor,data.nombre,data.apellido,data.telefono||null,data.ciudad||null);
        await audit(db,actor,'PERFIL_ACTUALIZADO','USUARIO',actor,Object.keys(data));return u;
    });
    const passwordHash=async actor=>(await rows('SELECT password FROM usuarios WHERE id=$1',actor))[0]?.password;
    const changePassword=(actor,oldHash,newHash)=>tx(async db=>{
        const changed=await q(db,'UPDATE usuarios SET password=$3,updated_at=now() WHERE id=$1 AND password=$2 RETURNING id',actor,oldHash,newHash);
        if(!changed.length) throw Object.assign(new Error('La cuenta cambió; vuelve a iniciar sesión.'),{status:409,public:true});
        await q(db,'INSERT INTO administrative_preferences(usuario_id,sesiones_revocadas_at) VALUES($1,now()) ON CONFLICT(usuario_id) DO UPDATE SET sesiones_revocadas_at=now() RETURNING usuario_id',actor);
        await audit(db,actor,'PASSWORD_CAMBIADA','USUARIO',actor,[]);
    });
    async function report(type,f) {
        const where=dateFilter(); const args=filterParams(f);
        const queries={
            usuarios:`SELECT id,nombre,apellido,correo,rol_id,estado,created_at FROM usuarios WHERE ($1='' OR concat_ws(' ',nombre,apellido,correo) ILIKE '%'||$1||'%') AND ${where} ORDER BY id DESC LIMIT 1001`,
            clientes:`SELECT id,nombre,apellido,estado,created_at FROM usuarios WHERE rol_id=2 AND ($1='' OR concat_ws(' ',nombre,apellido) ILIKE '%'||$1||'%') AND ${where} ORDER BY id DESC LIMIT 1001`,
            roles:`SELECT rol_id,coalesce(estado::text,'SIN_ESTADO') estado,count(*)::int total FROM usuarios WHERE ($1='' OR concat_ws(' ',nombre,apellido,correo) ILIKE '%'||$1||'%') AND ${where} GROUP BY rol_id,estado ORDER BY rol_id`,
            solicitudes:`SELECT id,cliente_id,responsable_id,asunto,estado,created_at,resuelta_at,cerrada_at FROM administrative_cases WHERE tipo='SOLICITUD' AND ($1='' OR asunto ILIKE '%'||$1||'%') AND ${where} ORDER BY id DESC LIMIT 1001`,
            tiempos:`SELECT estado,count(*)::int total,round(avg(extract(epoch FROM (coalesce(resuelta_at,cerrada_at)-created_at))/3600)::numeric,2) horas_promedio FROM administrative_cases WHERE tipo='SOLICITUD' AND ($1='' OR asunto ILIKE '%'||$1||'%') AND ${where} GROUP BY estado ORDER BY estado`,
            conversaciones:`SELECT id,cliente_id,responsable_id,asunto,estado,created_at,resuelta_at,cerrada_at FROM administrative_cases WHERE tipo='CONVERSACION' AND ($1='' OR asunto ILIKE '%'||$1||'%') AND ${where} ORDER BY id DESC LIMIT 1001`,
            actividad:`SELECT id,actor_id,accion,entidad,registro_id,resultado,created_at FROM administrative_audit WHERE ($1='' OR concat_ws(' ',accion,entidad,registro_id) ILIKE '%'||$1||'%') AND ${where} ORDER BY id DESC LIMIT 1001`
        };
        const data=await rows(queries[type],...args);
        return {tipo:type,filas:data.slice(0,1000),limitado:data.length>1000,limite:1000,generadoEn:new Date().toISOString(),filtros:f};
    }
    return {dashboard,users,createUser,updateUser,cases,caseDetail,createCase,updateCase,send,markRead,notifications,readNotification,administrators,audits,settings,saveSetting,preferences,savePreferences,profile,saveProfile,passwordHash,changePassword,report,recordExport:(actor,type)=>audit(prisma,actor,'INFORME_EXPORTADO','INFORME',type,[]),recordFailure:(actor,action)=>audit(prisma,actor,action,'SEGURIDAD','0',[],'RECHAZADO')};
}
let instance;
module.exports={createRepository,getRepository:()=>instance??=createRepository(require('../config/prisma'))};
