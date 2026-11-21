const { verificarToken } = require("../utils/jwt");
async function authorizeChatStaff(token){
    const claims=verificarToken(token);
    if(Number(claims.rol_id??claims.rol)!==1||!Number.isSafeInteger(claims.id)||!Number.isFinite(claims.exp)||claims.exp*1000<=Date.now()||!await require('../repositories/chat.repository').esStaff(claims.id))throw new Error('Acceso al chat no vigente.');
    return {id:claims.id,rol_id:1,exp:claims.exp};
}
module.exports={authorizeChatStaff};
