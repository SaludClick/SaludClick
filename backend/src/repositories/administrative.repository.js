const {createHash}=require('node:crypto');
// All SQL structure is fixed here. User values are always bound parameters.
function createRepository(prisma) {
    const q=(db,sql,...args)=>db.$queryRawUnsafe(sql,...args);
    const rows=(sql,...args)=>q(prisma,sql,...args);
    const chatTx=fn=>prisma.$transaction(fn,{isolationLevel:'ReadCommitted',timeout:15000});
    const tx=fn=>prisma.$transaction(fn,{isolationLevel:'Serializable',timeout:15000});
    const userFields='id,nombre,apellido,correo,cedula,telefono,ciudad,rol_id,estado,created_at';
    async function audit(db,actor,action,entity,record,fields=[],result='EXITO') {
        await q(db,'INSERT INTO administrative_audit(actor_id,accion,entidad,registro_id,campos,resultado) VALUES($1,$2,$3,$4,$5::text[],$6) RETURNING id',actor,action,entity,String(record),fields,result);
    }
    async function notify(db,caseId,type,title,recipient=null,exclude=0,force=false) {
        await q(db,`INSERT INTO administrative_notifications(destinatario_id,caso_id,tipo,titulo)
            SELECT u.id,$1,$2,$3 FROM usuarios u
            WHERE u.estado='ACTIVO' AND u.id<>$5 AND (($4::int IS NULL AND u.rol_id=1) OR u.id=$4)
            AND ($6::boolean OR NOT EXISTS(SELECT 1 FROM administrative_preferences p WHERE p.usuario_id=u.id AND NOT p.notificaciones))
            RETURNING id`,caseId,type,title,recipient,exclude??0,force);
    }
    const filterParams=f=>[f.buscar||'',f.desde||null,f.hasta||null];
    const dateFilter=(alias='')=>`($2::date IS NULL OR ${alias}created_at >= $2::date) AND ($3::date IS NULL OR ${alias}created_at < $3::date+interval '1 day')`;
    async function dashboard(actor) {
        const [users,cases,notifications]=await Promise.all([
            rows(`SELECT count(*)::int total,count(*) FILTER(WHERE estado='ACTIVO')::int activos,count(*) FILTER(WHERE estado='INACTIVO')::int inactivos,count(*) FILTER(WHERE estado IS NULL)::int sin_estado,count(*) FILTER(WHERE rol_id=2)::int clientes FROM usuarios`),
            rows(`SELECT count(*) FILTER(WHERE estado IN ('ABIERTA','EN_ATENCION'))::int abiertas,count(*) FILTER(WHERE estado IN ('RESUELTA','CERRADA'))::int atendidas,count(*) FILTER(WHERE estado='ABIERTA')::int pendientes,count(*) FILTER(WHERE estado='EN_ATENCION')::int en_atencion,count(*) FILTER(WHERE estado='RESUELTA')::int resueltas,count(*) FILTER(WHERE estado='CERRADA')::int cerradas FROM administrative_cases`),
            rows('SELECT count(*)::int sin_leer FROM administrative_notifications WHERE destinatario_id=$1 AND leida_at IS NULL',actor)
        ]);
        return {usuarios:users[0],solicitudes:cases[0],notificaciones:notifications[0]};
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
    async function userDetail(id) {
        const [user]=await rows(`SELECT ${userFields} FROM usuarios WHERE id=$1`,id);
        if(!user) throw Object.assign(new Error('Cuenta no encontrada.'),{status:404,public:true});
        return user;
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
        const result=await rows(`SELECT c.*,coalesce(u.nombre,'Visitante') AS cliente_nombre,coalesce(u.apellido,'') AS cliente_apellido,
            r.nombre AS responsable_nombre,count(*) OVER()::int AS total,
            (SELECT m.contenido FROM administrative_messages m WHERE m.caso_id=c.id ORDER BY m.id DESC LIMIT 1) AS ultimo_mensaje,
            (SELECT count(*)::int FROM administrative_messages m LEFT JOIN usuarios sender ON sender.id=m.remitente_id WHERE m.caso_id=c.id AND m.leido_at IS NULL AND ${staff?"(sender.rol_id=2 OR m.remitente_id IS NULL)":"sender.rol_id=1"}) AS pendientes
            FROM administrative_cases c LEFT JOIN usuarios u ON u.id=c.cliente_id LEFT JOIN usuarios r ON r.id=c.responsable_id
            WHERE ${access(actor,staff)} AND ($2='' OR concat_ws(' ',c.asunto,u.nombre,u.apellido,u.correo) ILIKE '%'||$2||'%')
            AND ($3='' OR c.estado=$3) AND ($4='' OR c.tipo=$4)
            AND ($5::date IS NULL OR c.created_at >= $5::date) AND ($6::date IS NULL OR c.created_at < $6::date+interval '1 day')
            AND ($9='' OR ($9='PENDIENTES' AND c.estado IN ('ABIERTA','EN_ATENCION')) OR ($9='ATENDIDAS' AND c.estado IN ('RESUELTA','CERRADA')))
            AND $1::int>0 ORDER BY c.updated_at DESC,c.id DESC LIMIT $7 OFFSET $8`,actor,f.buscar,f.estado,f.tipo,f.desde||null,f.hasta||null,f.limit,(f.page-1)*f.limit,f.bandeja||'');
        return {casos:result.map(({total,...c})=>publicCase(c)),total:result[0]?.total||0,page:f.page,limit:f.limit};
    }
    async function caseDetail(actor,staff,id,before=2147483647) {
        const [caso]=await rows(`SELECT c.*,coalesce(u.nombre,'Visitante') AS cliente_nombre,coalesce(u.apellido,'') AS cliente_apellido FROM administrative_cases c LEFT JOIN usuarios u ON u.id=c.cliente_id WHERE c.id=$2 AND ${access(actor,staff)} AND $1::int>0`,actor,id);
        if(!caso) throw Object.assign(new Error('Atención no encontrada.'),{status:404,public:true});
        const mensajes=(await rows(`SELECT m.id,m.caso_id,m.remitente_id,m.contenido,m.created_at,m.leido_at,coalesce(u.nombre,'Visitante') AS nombre,coalesce(u.rol_id,0) AS rol_id FROM administrative_messages m LEFT JOIN usuarios u ON u.id=m.remitente_id WHERE m.caso_id=$1 AND m.id<$2 ORDER BY m.id DESC LIMIT 100`,id,before)).reverse();
        const historial=await rows(`SELECT id,actor_id,accion,resultado,created_at,campos FROM administrative_audit WHERE entidad='ATENCION' AND registro_id=$1 ORDER BY id DESC LIMIT 100`,String(id));
        return {caso:publicCase(caso),mensajes,historial,hayAnteriores:mensajes.length===100};
    }
    async function ensureInTransaction(db,actor,data={},reopen=true,silent=false) {
      // READ COMMITTED takes a fresh snapshot after the client-specific lock.
      // Concurrent clicks/retries, including across processes, see the same row.
        await q(db,'SELECT pg_advisory_xact_lock(72411015,$1::int)::text AS locked',actor);
        const [existing]=await q(db,"SELECT * FROM administrative_cases WHERE cliente_id=$1 ORDER BY (estado IN ('ABIERTA','EN_ATENCION')) DESC,updated_at DESC,id DESC LIMIT 1 FOR UPDATE",actor);
        if(existing){
          if(reopen&&['CERRADA','RESUELTA'].includes(existing.estado))return {caso:await reopenInTransaction(db,actor,existing,false,silent),creada:false};
          return {caso:existing,creada:false};
        }
        const input={tipo:'CONVERSACION',asunto:'Atención administrativa',categoria:'SOPORTE',...data};
        const [c]=await q(db,'INSERT INTO administrative_cases(cliente_id,tipo,asunto,categoria) VALUES($1,$2,$3,$4) RETURNING *',actor,input.tipo,input.asunto,input.categoria);
        if(input.contenido)await q(db,'INSERT INTO administrative_messages(caso_id,remitente_id,contenido) VALUES($1,$2,$3) RETURNING id',c.id,actor,input.contenido);
        await audit(db,actor,'ATENCION_CREADA','ATENCION',c.id,['tipo','asunto','categoria']);
        if(!silent)await notify(db,c.id,'NUEVA_ATENCION','Un cliente solicita atención humana');
        return {caso:c,creada:true};
    }
    const ensureConversation=(actor,data={},reopen=true)=>chatTx(db=>ensureInTransaction(db,actor,data,reopen));
    // Compatibility for existing clients, without creating independent tickets
    // or duplicating their initial message when a POST is retried.
    const createCase=async(actor,data)=>(await ensureConversation(actor,data)).caso;
    async function reopenInTransaction(db,actor,old,staff,silent=false){
        if(!['CERRADA','RESUELTA'].includes(old.estado))return old;
        const [c]=await q(db,"UPDATE administrative_cases SET estado='ABIERTA',resuelta_at=NULL,cerrada_at=NULL,updated_at=now() WHERE id=$1 RETURNING *",old.id);
        await audit(db,actor,'CONVERSACION_REABIERTA','ATENCION',old.id,['estado']);
        if(!silent&&(!staff||old.cliente_id))await notify(db,old.id,'ESTADO',staff?'Administración reabrió tu conversación':'Un cliente reabrió su conversación',staff?old.cliente_id:null,actor);
        return c;
    }
    const reopenConversation=(actor,staff,id)=>tx(async db=>{
        const [c]=await q(db,`SELECT c.* FROM administrative_cases c WHERE c.id=$2 AND ${access(actor,staff)} AND $1::int>0 FOR UPDATE`,actor,id);
        if(!c)throw Object.assign(new Error('Conversación no encontrada.'),{status:404,public:true});
        return reopenInTransaction(db,actor,c,staff);
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
        if(state===old.estado&&responsible===old.responsable_id)return old;
        const [c]=await q(db,`UPDATE administrative_cases SET estado=$2::text,responsable_id=$3,updated_at=now(),resuelta_at=CASE WHEN $2='RESUELTA' THEN coalesce(resuelta_at,now()) WHEN $2='EN_ATENCION' THEN NULL ELSE resuelta_at END,cerrada_at=CASE WHEN $2='CERRADA' THEN coalesce(cerrada_at,now()) ELSE cerrada_at END WHERE id=$1 RETURNING *`,id,state,responsible);
        await audit(db,actor,'ATENCION_ACTUALIZADA','ATENCION',id,Object.keys(data));
        if(old.cliente_id)await notify(db,id,'ESTADO','Tu atención administrativa fue actualizada',old.cliente_id);
        if(responsible && responsible!==actor) await notify(db,id,'ASIGNACION','Se te asignó una atención',responsible);
        return c;
    });
    const digest=(content,id)=>createHash('sha256').update(JSON.stringify({content,id:id??null})).digest('hex');
    async function previousMessage(db,actor,key,content,id){
        if(!key)return null;
        const [old]=await q(db,`SELECT m.*,c.cliente_id,a.campos FROM administrative_audit a JOIN administrative_messages m ON a.registro_id=m.id::text JOIN administrative_cases c ON c.id=m.caso_id WHERE a.actor_id IS NOT DISTINCT FROM $1 AND ($3::int IS NULL OR c.id=$3) AND a.entidad='MENSAJE_ADMINISTRATIVO' AND a.accion='MENSAJE_CONFIRMADO' AND $2=ANY(a.campos) LIMIT 1`,actor,'request:'+key,id??null);
        if(!old)return null;
        if(!old.campos.includes('sha256:'+digest(content,id)))throw Object.assign(new Error('La clave de envio ya corresponde a otro mensaje.'),{status:409,public:true});
        const {campos,...message}=old;return {...message,repetido:true};
    }
    async function persistMessage(db,actor,staff,c,content,key,requestCase){
        if(['CERRADA','RESUELTA'].includes(c.estado))throw Object.assign(new Error('Reabre la conversacion antes de responder.'),{status:409,public:true});
        if(staff&&c.responsable_id&&c.responsable_id!==actor)throw Object.assign(new Error('Reasigna la atencion antes de responder.'),{status:403,public:true});
        const [message]=await q(db,'INSERT INTO administrative_messages(caso_id,remitente_id,contenido,created_at) VALUES($1,$2,$3,clock_timestamp()) RETURNING *',c.id,actor,content);
        await q(db,`UPDATE administrative_cases SET updated_at=clock_timestamp(),responsable_id=CASE WHEN $2 THEN coalesce(responsable_id,$3) ELSE responsable_id END,estado=CASE WHEN $2 THEN 'EN_ATENCION' ELSE estado END WHERE id=$1 RETURNING id`,c.id,staff,actor);
        await audit(db,actor,'MENSAJE_ENVIADO','ATENCION',c.id,[]);
        // The immutable audit trail is the durable retry receipt. No new column,
        // table, principal-database migration or in-memory deduplication is needed.
        if(key)await audit(db,actor,'MENSAJE_CONFIRMADO','MENSAJE_ADMINISTRATIVO',message.id,['request:'+key,'sha256:'+digest(content,requestCase)]);
        if(!staff||c.cliente_id)await notify(db,c.id,'MENSAJE',staff?'Administracion respondio a tu consulta':'Nuevo mensaje de un cliente',staff?c.cliente_id:null,actor,!staff);
        return {...message,cliente_id:c.cliente_id,repetido:false};
    }
    const send=(actor,staff,id,content,key)=>chatTx(async db=>{
        await q(db,'SELECT pg_advisory_xact_lock(72411015,$1::int)::text AS locked',actor);
        const previous=await previousMessage(db,actor,key,content,id);if(previous)return previous;
        const [c]=await q(db,`SELECT c.* FROM administrative_cases c WHERE c.id=$2 AND ${access(actor,staff)} AND $1::int>0 FOR UPDATE`,actor,id);
        if(!c)throw Object.assign(new Error('Conversacion no encontrada.'),{status:404,public:true});
        return persistMessage(db,actor,staff,c,content,key,id);
    });
    const receiveVitalix=(actor,content,key)=>chatTx(async db=>{
        await q(db,'SELECT pg_advisory_xact_lock(72411015,$1::int)::text AS locked',actor);
        const previous=await previousMessage(db,actor,key,content,null);
        if(previous){const [caso]=await q(db,'SELECT * FROM administrative_cases WHERE id=$1 AND cliente_id=$2',previous.caso_id,actor);return {caso,mensaje:previous};}
        const {caso}=await ensureInTransaction(db,actor,{},true,true);
        return {caso,mensaje:await persistMessage(db,actor,false,caso,content,key,null)};
    });
    async function currentConversation(actor){
        const [c]=await rows("SELECT id FROM administrative_cases WHERE cliente_id=$1 ORDER BY (estado IN ('ABIERTA','EN_ATENCION')) DESC,updated_at DESC,id DESC LIMIT 1",actor);
        return c?caseDetail(actor,false,c.id):{caso:null,mensajes:[],historial:[],hayAnteriores:false};
    }
    function publicCase(c){if(!c)return c;const {visitante_hash,visitante_expira_at,...safe}=c;return safe;}
    async function visitorCaseId(hash){
        const [c]=await rows('SELECT id FROM administrative_cases WHERE visitante_hash=$1 AND visitante_expira_at>now()',hash);return c?.id;
    }
    async function visitorConversation(hash,before=2147483647){
        const id=await visitorCaseId(hash);
        if(!id)return {caso:null,mensajes:[],historial:[],hayAnteriores:false};
        const data=await caseDetail(1,true,id,before);
        return {...data,caso:publicCase(data.caso),historial:[]};
    }
    const visitorMessage=(hash,content,key)=>chatTx(async db=>{
        await q(db,'SELECT pg_advisory_xact_lock(hashtextextended($1,72411016))::text AS locked',hash);
        let [c]=await q(db,'SELECT * FROM administrative_cases WHERE visitante_hash=$1 FOR UPDATE',hash);
        if(c&&new Date(c.visitante_expira_at)<=new Date())throw Object.assign(new Error('La sesion de visitante caduco. Abre una nueva conversacion.'),{status:410,public:true});
        if(!c){[c]=await q(db,"INSERT INTO administrative_cases(cliente_id,visitante_hash,visitante_expira_at,tipo,asunto,categoria) VALUES(NULL,$1,now()+interval '30 days','CONVERSACION','Visitante: atencion desde VITALIX','SOPORTE') RETURNING *",hash);await audit(db,null,'ATENCION_CREADA','ATENCION',c.id,['visitante']);}
        const previous=await previousMessage(db,null,key,content,c.id);
        if(previous)return {caso:publicCase(c),mensaje:previous};
        c=await reopenInTransaction(db,null,c,false,true);
        return {caso:publicCase(c),mensaje:await persistMessage(db,null,false,c,content,key,c.id)};
    });
    const visitorRead=(hash,lastId)=>chatTx(async db=>{
        const [c]=await q(db,'SELECT id FROM administrative_cases WHERE visitante_hash=$1 AND visitante_expira_at>now() FOR UPDATE',hash);
        if(!c)return {leidos:0};
        const marked=await q(db,'UPDATE administrative_messages m SET leido_at=coalesce(leido_at,clock_timestamp()) WHERE caso_id=$1 AND id<=$2 AND EXISTS(SELECT 1 FROM usuarios u WHERE u.id=m.remitente_id AND u.rol_id=1) RETURNING id',c.id,lastId);
        return {leidos:marked.length,evento:{caso_id:c.id}};
    });
    const markRead=(actor,staff,id,lastId)=>chatTx(async db=>{
        const [owned]=await q(db,`SELECT c.id,c.cliente_id FROM administrative_cases c WHERE c.id=$2 AND ${access(actor,staff)} AND $1::int>0 FOR UPDATE`,actor,id);
        if(!owned)throw Object.assign(new Error('Conversacion no encontrada.'),{status:404,public:true});
        const marked=await q(db,`UPDATE administrative_messages m SET leido_at=coalesce(leido_at,clock_timestamp()) FROM administrative_cases c WHERE c.id=m.caso_id AND c.id=$2 AND ${access(actor,staff)} AND m.id<=$3 AND m.leido_at IS NULL AND (EXISTS(SELECT 1 FROM usuarios u WHERE u.id=m.remitente_id AND u.rol_id=$4) OR ($4=2 AND m.remitente_id IS NULL)) AND $1::int>0 RETURNING m.id,c.cliente_id`,actor,id,lastId,staff?2:1);
        const [latest]=await q(db,'SELECT max(id)::int AS last_id FROM administrative_messages WHERE caso_id=$1',id);
        // The case lock also serializes sends: never clear a notification for a
        // newer message that was not in the transcript the reader consulted.
        if(latest?.last_id&&lastId>=latest.last_id)await q(db,'UPDATE administrative_notifications SET leida_at=coalesce(leida_at,clock_timestamp()) WHERE caso_id=$1 AND destinatario_id=$2 AND leida_at IS NULL RETURNING id',id,actor);
        return Object.assign(marked,{cliente_id:owned.cliente_id});
    });
    async function notifications(actor,f) {
        const items=await rows(`SELECT n.*,c.tipo AS caso_tipo,count(*) OVER()::int AS total FROM administrative_notifications n LEFT JOIN administrative_cases c ON c.id=n.caso_id WHERE n.destinatario_id=$1 AND ($2='' OR ($2='NO_LEIDA' AND n.leida_at IS NULL) OR ($2='LEIDA' AND n.leida_at IS NOT NULL)) AND ($3='' OR n.titulo ILIKE '%'||$3||'%') ORDER BY n.id DESC LIMIT $4 OFFSET $5`,actor,f.estado,f.buscar,f.limit,(f.page-1)*f.limit);
        const [count]=await rows('SELECT count(*)::int total FROM administrative_notifications WHERE destinatario_id=$1 AND leida_at IS NULL',actor);
        return {notificaciones:items.map(({total,...n})=>n),total:items[0]?.total||0,sinLeer:count.total,page:f.page,limit:f.limit};
    }
    const readNotification=(actor,id)=>rows('UPDATE administrative_notifications SET leida_at=coalesce(leida_at,now()) WHERE id=$1 AND destinatario_id=$2 RETURNING id',id,actor);
    const readAllNotifications=actor=>rows('UPDATE administrative_notifications SET leida_at=now() WHERE destinatario_id=$1 AND leida_at IS NULL RETURNING id',actor);
    const administrators=()=>rows("SELECT id,nombre,apellido FROM usuarios WHERE rol_id=1 AND estado='ACTIVO' ORDER BY nombre,id");
    async function audits(f) {
        return rows(`SELECT id,actor_id,accion,entidad,registro_id,resultado,campos,created_at,count(*) OVER()::int AS total FROM administrative_audit WHERE ($1='' OR concat_ws(' ',accion,entidad,registro_id,actor_id::text) ILIKE '%'||$1||'%') AND ${dateFilter()} AND ($4='' OR accion=$4) ORDER BY id DESC LIMIT $5 OFFSET $6`,...filterParams(f),f.accion,f.limit,(f.page-1)*f.limit);
    }
    const settings=()=>rows("SELECT clave,valor,updated_at FROM administrative_settings WHERE clave IN ('general','faq') ORDER BY clave");
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
            pacientes:`SELECT p.id,p.nombres,p.apellidos,p.estado,p.created_at,p.updated_at FROM pacientes_autorizados p WHERE ($1='' OR concat_ws(' ',p.nombres,p.apellidos,p.cedula) ILIKE '%'||$1||'%' OR EXISTS(SELECT 1 FROM usuarios u WHERE u.rol_id=2 AND u.cedula=p.cedula AND u.correo ILIKE '%'||$1||'%')) AND ${dateFilter('p.')} ORDER BY p.id DESC LIMIT 1001`,
            estados:`SELECT coalesce(estado::text,'SIN_ESTADO') estado,count(*)::int total FROM usuarios WHERE ($1='' OR concat_ws(' ',nombre,apellido,correo,cedula) ILIKE '%'||$1||'%') AND ${where} GROUP BY estado ORDER BY estado`,
            clientes:`SELECT id,nombre,apellido,estado,created_at FROM usuarios WHERE rol_id=2 AND ($1='' OR concat_ws(' ',nombre,apellido) ILIKE '%'||$1||'%') AND ${where} ORDER BY id DESC LIMIT 1001`,
            roles:`SELECT rol_id,coalesce(estado::text,'SIN_ESTADO') estado,count(*)::int total FROM usuarios WHERE ($1='' OR concat_ws(' ',nombre,apellido,correo) ILIKE '%'||$1||'%') AND ${where} GROUP BY rol_id,estado ORDER BY rol_id`,
            solicitudes:`SELECT c.id,c.cliente_id,c.responsable_id,c.asunto,c.estado,c.created_at,c.updated_at,c.resuelta_at,c.cerrada_at FROM administrative_cases c LEFT JOIN usuarios u ON u.id=c.cliente_id WHERE ($1='' OR concat_ws(' ',c.asunto,u.nombre,u.apellido,u.correo) ILIKE '%'||$1||'%') AND ${dateFilter('c.')} ORDER BY c.id DESC LIMIT 1001`,
            atendidas:`SELECT c.id,c.cliente_id,c.responsable_id,c.asunto,c.estado,c.created_at,c.resuelta_at,c.cerrada_at FROM administrative_cases c LEFT JOIN usuarios u ON u.id=c.cliente_id WHERE c.estado IN ('RESUELTA','CERRADA') AND ($1='' OR concat_ws(' ',c.asunto,u.nombre,u.apellido,u.correo) ILIKE '%'||$1||'%') AND ${dateFilter('c.')} ORDER BY c.id DESC LIMIT 1001`,
            tiempos:`SELECT c.estado,count(*)::int total,round(avg(extract(epoch FROM (coalesce(c.resuelta_at,c.cerrada_at)-c.created_at))/3600)::numeric,2) horas_promedio FROM administrative_cases c LEFT JOIN usuarios u ON u.id=c.cliente_id WHERE c.estado IN ('RESUELTA','CERRADA') AND ($1='' OR concat_ws(' ',c.asunto,u.nombre,u.apellido,u.correo) ILIKE '%'||$1||'%') AND ${dateFilter('c.')} GROUP BY c.estado ORDER BY c.estado`,
            conversaciones:`SELECT id,cliente_id,responsable_id,asunto,estado,created_at,resuelta_at,cerrada_at FROM administrative_cases WHERE tipo='CONVERSACION' AND ($1='' OR asunto ILIKE '%'||$1||'%') AND ${where} ORDER BY id DESC LIMIT 1001`,
            actividad:`SELECT id,actor_id,accion,entidad,registro_id,resultado,created_at FROM administrative_audit WHERE ($1='' OR concat_ws(' ',accion,entidad,registro_id) ILIKE '%'||$1||'%') AND ${where} ORDER BY id DESC LIMIT 1001`
        };
        const columns={usuarios:['id','nombre','apellido','correo','rol_id','estado','created_at'],pacientes:['id','nombres','apellidos','estado','created_at','updated_at'],estados:['estado','total'],roles:['rol_id','estado','total'],clientes:['id','nombre','apellido','estado','created_at'],solicitudes:['id','cliente_id','responsable_id','asunto','estado','created_at','updated_at','resuelta_at','cerrada_at'],atendidas:['id','cliente_id','responsable_id','asunto','estado','created_at','resuelta_at','cerrada_at'],tiempos:['estado','total','horas_promedio'],conversaciones:['id','cliente_id','responsable_id','asunto','estado','created_at','resuelta_at','cerrada_at'],actividad:['id','actor_id','accion','entidad','registro_id','resultado','created_at']};
        const sql=queries[type];
        const grouped=['roles','estados','tiempos'].includes(type);
        // Summaries cover the entire filtered dataset, not just the export limit.
        const [data,[summary]]=await Promise.all([
            rows(sql,...args),
            rows(`SELECT count(*)::int registros,${grouped?'coalesce(sum(total),0)::int':'count(*)::int'} total FROM (${sql.replace(' LIMIT 1001','')}) informe`,...args)
        ]);
        return {tipo:type,columnas:columns[type],filas:data.slice(0,1000),resumen:summary,limitado:data.length>1000,limite:1000,generadoEn:new Date().toISOString(),filtros:f};
    }
    return {visitorConversation,visitorMessage,visitorRead,visitorCaseId,dashboard,users,userDetail,createUser,updateUser,cases,caseDetail,createCase,ensureConversation,reopenConversation,receiveVitalix,currentConversation,updateCase,send,markRead,notifications,readNotification,readAllNotifications,administrators,audits,settings,saveSetting,preferences,savePreferences,profile,saveProfile,passwordHash,changePassword,report,recordExport:(actor,type)=>audit(prisma,actor,'INFORME_EXPORTADO','INFORME',type,[]),recordFailure:(actor,action)=>audit(prisma,actor,action,'SEGURIDAD','0',[],'RECHAZADO')};
}
let instance;
module.exports={createRepository,getRepository:()=>instance??=createRepository(require('../config/prisma'))};
