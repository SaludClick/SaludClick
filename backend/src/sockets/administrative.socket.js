const jwt=require('jsonwebtoken');
const {createSessionGuard}=require('../middlewares/administrative-session.middleware');
function attachAdministrativeSocket(io,app,{guard=createSessionGuard()}={}) {
    const namespace=io.of('/administrativo');
    namespace.use((socket,next)=>{
        const token=socket.handshake.auth?.token;
        const req={headers:{authorization:`Bearer ${token}`},allowedRoles:[1,2]};
        const res={status(){return this;},json(){next(new Error('Acceso no vigente.'));}};
        guard(req,res,()=>{socket.data.usuario=req.usuario;next();});
    });
    namespace.on('connection',socket=>{
        const claims=jwt.decode(socket.handshake.auth.token);
        const expiry=setTimeout(()=>socket.disconnect(true),Math.max(0,Math.min((claims.exp*1000)-Date.now(),2147483647)));
        socket.on('disconnect',()=>clearTimeout(expiry));
    });
    // Invalidation only; no personal data or message contents are broadcast.
    app.set('administrativeEvents',()=>namespace.emit('administrativo:actualizado'));
}
module.exports={attachAdministrativeSocket};
