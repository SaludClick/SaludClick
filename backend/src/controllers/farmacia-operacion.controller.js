const {archivoPrivado}=require('../services/farmacia-formula-archivo.service');
const path=require('node:path');
const {habilitada}=require('../config/farmacia-operacion');
const service=()=>require('../services/farmacia-operacion.service').createService();
function error(res,e){const known=[400,401,403,404,409,413,429,503].includes(e.status);const status=known?e.status:503;return res.status(status).json({ok:false,codigo:e.codigo||'FARMACIA_PERSISTENCIA_NO_DISPONIBLE',mensaje:known?e.message:'No se pudo verificar la persistencia de Farmacia. No se muestran datos parciales.'});}
function handle(fn,status=200){return async(req,res)=>{res.set('Cache-Control','no-store');try{res.status(status).json({ok:true,...await fn(service(),req)});}catch(e){error(res,e);}};}
async function conNotificaciones(req, operation) {
    const {destinatarios, ...result} = await operation;
    if (destinatarios?.length) {
        Promise.resolve().then(() => req.app.get('farmaciaNotificationEvents')?.(destinatarios)).catch(() => {});
    }
    return result;
}
const user=req=>req.farmacia||req.usuario;
module.exports={
    error, conNotificaciones,
    identidad:handle((s,r)=>s.identidad(r.usuario,r.params.farmaciaId,r.params.usuarioId,r.query,r.body)),
    autorizarCatalogo:handle((s,r)=>s.autorizarCatalogo(r.usuario,r.params.farmaciaId,r.query,r.body)),
    ruta:handle((s,r)=>s.ruta(r.usuario,r.params.epsId,r.query,r.body)),
    listar:handle((s,r)=>s.listar(user(r),r.query)),
    detalle:handle((s,r)=>s.detalle(user(r),r.params.id,r.query)),
    avanzar:handle((s,r)=>s.avanzar(user(r),r.params.id,r.query,r.body,r.app.get('farmaciaNotificationEvents'))),
    asignar:handle((s,r)=>s.asignar(r.usuario,r.params.id,r.query,r.body,r.app.get('farmaciaNotificationEvents')),201),
    permisos:handle((s,r)=>s.permisos(user(r),r.query)),
    crear:handle((s,r)=>s.guardar(user(r),null,r.query,r.body),201),
    editar:handle((s,r)=>conNotificaciones(r,s.guardar(user(r),r.params.id,r.query,r.body))),
    retirar:handle((s,r)=>s.retirar(user(r),r.params.id,r.query,r.body)),
    vincularFormula:handle((s,r)=>s.vincularFormula(r.usuario,r.params.solicitudId,r.params.id,r.query,r.body)),
    async usuariosVinculados(req,res) {
        res.set('Cache-Control','no-store');
        try {
            require('../validators/farmacia-eps.validator').sinQuery(req.query);
            const { vinculacion, paginacion } = await require('../services/farmacia-eps.service').usuarios(req.farmacia, { tamano: '1' });
            res.json({ok:true,total:vinculacion.estado==='EPS_NO_VIGENTE'?null:paginacion.total});
        } catch (e) { error(res,e); }
    },
    async estadisticas(req,res){
        res.set('Cache-Control','no-store');
        try{require('../validators/farmacia-operacion.validator').periodo(req.query);}catch(e){return error(res,e);}
        if(!habilitada())return res.json({ok:true,disponible:false,indicadores:null,graficos:null,actividad:[],motivo:'Las estadísticas requieren asignaciones persistentes y entregas verificadas. Activación pendiente.'});
        try{res.json({ok:true,disponible:true,...await service().estadisticas(user(req),req.query)});}catch(e){error(res,e);}
    },
    async formula(req,res,next){
        res.set('Cache-Control','no-store');
        try{
            const f=await service().formula(user(req),req.params.id,req.params.formulaId,req.query);
            if(req.query.descarga==='1'&&!f.permite_descarga)throw Object.assign(new Error('La autorización de esta fórmula permite consulta, pero no descarga.'),{status:403});
            const file=await archivoPrivado(f);
            if(!file)throw Object.assign(new Error('Fórmula no disponible. El archivo original no está accesible en el almacenamiento privado.'),{status:404,codigo:'FORMULA_ARCHIVO_NO_DISPONIBLE'});
            const nombre=path.win32.basename(String(f.nombre_original||'')).replace(/[\u0000-\u001f\u007f]/g,'_').trim()
                || `formula-${Number(req.params.formulaId)}${path.extname(file)}`;
            res.attachment(nombre);
            if(req.query.descarga!=='1')res.set('Content-Disposition',res.get('Content-Disposition').replace(/^attachment/,'inline'));
            res.set('Content-Type',f.tipo_mime);
            res.set('Content-Security-Policy',"default-src 'none'; sandbox");
            res.sendFile(file,{cacheControl:false},e=>{
                if(!e)return;
                if(res.headersSent){next(e);return;}
                res.removeHeader('Content-Disposition');
                res.removeHeader('Content-Type');
                error(res,e.status===404||e.code==='ENOENT'?Object.assign(new Error('Fórmula no disponible.'),{status:404}):e);
            });
        }catch(e){if(e.code==='ENOENT'||e.code==='ENOTDIR')e=Object.assign(new Error('Fórmula no disponible.'),{status:404});error(res,e);}
    }
};
