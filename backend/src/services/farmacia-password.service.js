const bcrypt=require('bcrypt');
const {disponible,fallo}=require('../config/farmacia-operacion');
const {objeto}=require('../validators/farmacia-operacion.validator');
const attempts=new Map();
function createService(db=require('../config/database'),available=disponible) {
    return {async cambiar(user,body){
        objeto(body,['actual','nueva']);
        if(typeof body.actual!=='string'||Buffer.byteLength(body.actual)>72||typeof body.nueva!=='string'||body.nueva.length<12||Buffer.byteLength(body.nueva)>72||!/[A-Z]/.test(body.nueva)||!/[a-z]/.test(body.nueva)||!/[0-9]/.test(body.nueva)||body.actual===body.nueva)throw fallo(400,'PASSWORD_INVALIDA','Usa una contraseña nueva de al menos 12 caracteres, con mayúscula, minúscula y número (máximo 72 bytes).');
        available();
        const now=Date.now(),previous=attempts.get(user.id);
        if(previous&&previous.until>now&&previous.count>=5)throw fallo(429,'PASSWORD_INTENTOS','Espera 15 minutos antes de reintentar.');
        if(attempts.size>10000)for(const [id,entry] of attempts)if(entry.until<now)attempts.delete(id);
        attempts.set(user.id,{count:previous?.until>now?previous.count+1:1,until:previous?.until>now?previous.until:now+900000});
        const c=await db.connect();
        try{
            await c.query('BEGIN');
            const u=(await c.query("SELECT password FROM usuarios WHERE id=$1 AND rol_id=3 AND estado='ACTIVO' FOR UPDATE",[user.id])).rows[0];
            if(!u||!await bcrypt.compare(body.actual,u.password))throw fallo(403,'PASSWORD_ACTUAL_INVALIDA','No se pudo verificar la contraseña actual.');
            const hash=await bcrypt.hash(body.nueva,12);
            await c.query('UPDATE usuarios SET password=$2,updated_at=now() WHERE id=$1',[user.id,hash]);
            await c.query('INSERT INTO farmacia_sesiones(usuario_id,revocadas_at) VALUES($1,now()) ON CONFLICT(usuario_id) DO UPDATE SET revocadas_at=excluded.revocadas_at',[user.id]);
            await c.query(`INSERT INTO farmacia_autorizacion_eventos(actor_id,farmacia_id,tipo,detalle) VALUES($1,$1,'PASSWORD_CAMBIADA','{"sesionesRevocadas":true}'::jsonb)`,[user.id]);
            await c.query('COMMIT');attempts.delete(user.id);return {mensaje:'Contraseña actualizada. Inicia sesión nuevamente.'};
        }catch(e){try{await c.query('ROLLBACK');}catch{}throw e;}finally{c.release();}
    }};
}
module.exports={createService};
