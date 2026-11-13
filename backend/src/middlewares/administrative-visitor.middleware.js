const {createHash}=require('node:crypto');
function visitorHash(token){
    return typeof token==='string'&&/^[a-f0-9]{64}$/.test(token)?createHash('sha256').update(token).digest('hex'):null;
}
function visitorSession(req,res,next){
    const hash=visitorHash(req.headers.authorization?.replace(/^Vitalix /,''));
    if(!req.headers.authorization?.startsWith('Vitalix ')||!hash)return res.status(401).json({ok:false,mensaje:'Sesión de visitante no válida.'});
    req.visitorHash=hash;next();
}
module.exports={visitorHash,visitorSession};
