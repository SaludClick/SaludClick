const jwt=require('jsonwebtoken');
const {session}=require('./administrative-session.middleware');
function administrativeScope(req,res,next) {
    const token=/^Bearer (\S+)$/.exec(req.headers.authorization||'')?.[1];
    let claims;try{claims=jwt.verify(token,process.env.JWT_SECRET);}catch{return next();}
    if(Number(claims.rol_id??claims.rol)!==1)return next();
    if(/^\/(citas|medicamentos|formulas|pedidos|farmacia|eps)(\/|$)/.test(req.path))
        return res.status(403).json({ok:false,mensaje:'La administración no tiene permisos para operaciones clínicas o farmacéuticas.'});
    if(req.path==='/auth/profile') return session(req,res,()=>{
        const c=require('../controllers/administrative.controller').createController();
        if(req.method==='GET')return c.profile(req,res);
        if(req.method==='PUT')return c.saveProfile(req,res);
        return res.sendStatus(405);
    });
    next();
}
module.exports={administrativeScope};
