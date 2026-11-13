const jwt=require('jsonwebtoken');
const {createSessionGuard}=require('../middlewares/administrative-session.middleware');
function attachAdministrativeSocket(io,app,{guard=createSessionGuard(),visitorLookup=hash=>require('../repositories/administrative.repository').getRepository().visitorCaseId(hash)}={}) {
    const namespace=io.of('/administrativo');
    namespace.use((socket,next)=>{
        if(socket.handshake.auth?.visitorToken){
            const hash=require('../middlewares/administrative-visitor.middleware').visitorHash(socket.handshake.auth.visitorToken);
            if(!hash)return next(new Error('Acceso no vigente.'));
            return Promise.resolve().then(()=>visitorLookup(hash)).then(id=>{if(!id)return next(new Error('Acceso no vigente.'));socket.data.visitorCase=id;next();}).catch(()=>next(new Error('Acceso no vigente.')));
        }
        const token=socket.handshake.auth?.token;
        const req={headers:{authorization:`Bearer ${token}`},allowedRoles:[1,2]};
        const res={status(){return this;},json(){next(new Error('Acceso no vigente.'));}};
        guard(req,res,()=>{socket.data.usuario=req.usuario;next();});
    });
    namespace.on('connection',socket=>{
        if(socket.data.visitorCase){
            socket.join(`administrativo:visitante:${socket.data.visitorCase}`);
            const expiry=setTimeout(()=>socket.disconnect(true),3600000);
            socket.on('disconnect',()=>clearTimeout(expiry));return;
        }
        const user=socket.data.usuario;
        socket.join(user.rol_id===1?'administrativo:staff':`administrativo:cliente:${user.id}`);
        const claims=jwt.decode(socket.handshake.auth.token);
        const expiry=setTimeout(()=>socket.disconnect(true),Math.max(0,Math.min((claims.exp*1000)-Date.now(),2147483647)));
        socket.on('disconnect',()=>clearTimeout(expiry));
    });
    // Only staff and the owning client learn that this conversation changed.
    // Message bodies are fetched through the HTTP ownership/session guards.
    app.set('administrativeEvents',(event={})=>{
        let target=namespace.to('administrativo:staff');
        const client=event.cliente_id||event.actor_id;
        if(Number.isSafeInteger(client)&&client>0)target=target.to(`administrativo:cliente:${client}`);
        if(event.caso_id)target=target.to(`administrativo:visitante:${event.caso_id}`);
        target.emit('administrativo:actualizado',event.caso_id?{caso_id:event.caso_id}:{});
    });
}
module.exports={attachAdministrativeSocket};
