const {habilitada,fallo}=require('./farmacia-operacion');
const habilitado=()=>habilitada()&&process.env.FARMACIA_INVENTARIO_PROPIO_ENABLED==='true';
function disponible(){if(!habilitado())throw fallo(503,'FARMACIA_STOCK_ACTIVACION_PENDIENTE','Las existencias propias requieren aprobación y activación. No se deducen del catálogo global.');}
module.exports={habilitado,disponible};
