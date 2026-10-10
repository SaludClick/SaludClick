const repo = require("../repositories/dashboard.repository");
async function usuario(req,res){ try { res.json({ok:true, estadisticas: await repo.statsUsuario(req.usuario.id)}); } catch(e){ console.error(e); res.status(500).json({ok:false,mensaje:"No se pudieron cargar las estadísticas."}); } }
async function admin(req,res){ try { res.json({ok:true, estadisticas: await repo.statsAdmin()}); } catch(e){ console.error(e); res.status(500).json({ok:false,mensaje:"No se pudieron cargar las estadísticas administrativas."}); } }
module.exports = { usuario, admin };
