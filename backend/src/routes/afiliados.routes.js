const express=require('express');
const {session}=require('../middlewares/administrative-session.middleware');
// Retired administrative entry point. EPS routes and reporting services remain
// separate; no role acquires access to this legacy account-linking workflow.
const denyIndependentAffiliates=(req,res)=>res.status(403).json({ok:false,mensaje:'La gestión independiente de afiliados no está habilitada en este panel.'});
function crearRouter({servicio,authorize=[session,denyIndependentAffiliates]}={}) {
    const router=express.Router();
    const obtener=()=>servicio||require('../services/afiliados-consulta.service').obtenerServicio();
    function envolver(fn){return async(req,res)=>{
        res.set('Cache-Control','no-store');
        try{await fn(req,res);}catch(e){
            if(e.status)return res.status(e.status).json({ok:false,codigo:e.codigo,mensaje:e.message});
            if(['P1000','28P01','28000'].includes(e.code))return res.status(503).json({ok:false,codigo:'DATABASE_AUTH_UNAVAILABLE',mensaje:'No fue posible autenticar la conexión de base de datos. Revisa la configuración privada del servicio; no se mostrarán credenciales.'});
            if(['P2002','P2034'].includes(e.code))return res.status(409).json({ok:false,mensaje:'Cuenta duplicada o cambio simultáneo. Actualiza la ficha antes de intentarlo de nuevo.'});
            if(['P1001','P1002','P1017','P2024','ECONNREFUSED','ETIMEDOUT','ENOTFOUND','ECONNRESET'].includes(e.code))return res.status(503).json({ok:false,codigo:'CONEXION_NO_DISPONIBLE',mensaje:'No fue posible conectar con la fuente EPS o con el estado de las cuentas. Revisa la disponibilidad y la configuración del backend.'});
            res.status(500).json({ok:false,mensaje:'No fue posible consultar o guardar la cuenta del afiliado.'});
        }
    };}
    router.use(authorize);
    router.get('/diagnostico/conexion',envolver(async(req,res)=>res.json({ok:true,...await obtener().diagnosticar()})));
    router.get('/',envolver(async(req,res)=>res.json({ok:true,...await obtener().listar(req.query)})));
    router.get('/:id',envolver(async(req,res)=>res.json({ok:true,...await obtener().detalle(req.params.id)})));
    router.post('/:id/cuenta',envolver(async(req,res)=>res.status(201).json({ok:true,usuario:await obtener().crearCuenta(req.params.id,req.body,Number(req.usuario.id))})));
    return router;
}
module.exports=crearRouter();
module.exports.crearRouter=crearRouter;
