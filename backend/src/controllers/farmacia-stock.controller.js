const service=()=>require('../services/farmacia-stock.service').createService();
const {error,conNotificaciones}=require('./farmacia-operacion.controller');
const handle=fn=>async(req,res)=>{res.set('Cache-Control','no-store');try{res.json({ok:true,...await fn(service(),req)});}catch(e){error(res,e);}};
module.exports={
    listar:handle((s,r)=>s.listar(r.farmacia,r.query)),
    detalle:handle((s,r)=>s.detalle(r.farmacia,r.params.id,r.query)),
    movimientoManual:handle((s,r)=>conNotificaciones(r,s.movimientoManual(r.usuario,r.params.farmaciaId,r.query,r.body))),
    ingresar:handle((s,r)=>conNotificaciones(r,s.ingresar(r.usuario,r.params.farmaciaId,r.query,r.body))),
    async exportar(req,res){res.set('Cache-Control','no-store');try{const buffer=await service().exportar(req.farmacia,req.query);res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.set('Content-Disposition','attachment; filename="Inventario_Farmacia.xlsx"');res.send(buffer);}catch(e){error(res,e);}}
};
