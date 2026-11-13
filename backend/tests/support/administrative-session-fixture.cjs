// Active-account fixture for historical route contracts only. Production session
// checks (including state, role changes and revocation) have dedicated tests.
const jwt=require('jsonwebtoken');
function session(req,res,next){
  try{
    const match=/^Bearer (\S+)$/.exec(req.headers.authorization||'');
    if(!match)return res.status(401).json({ok:false,mensaje:'Inicia sesión para continuar.'});
    req.usuario=jwt.verify(match[1],process.env.JWT_SECRET);
    req.usuario.rol_id=Number(req.usuario.rol_id??req.usuario.rol);
    if(req.allowedRoles&&!req.allowedRoles.includes(req.usuario.rol_id))return res.status(403).json({ok:false,mensaje:'Acceso restringido al personal administrativo.'});
    next();
  }catch{return res.status(401).json({ok:false,mensaje:'Sesión inválida.'});}
}
module.exports={session,roles:(...allowed)=>[(req,res,next)=>{req.allowedRoles=allowed;next();},session]};
