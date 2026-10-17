import { checkAuthGuard, initAuth, getCurrentUser } from "./auth.js";
import { apiFetch } from "./api.js";

if (checkAuthGuard()) document.addEventListener("DOMContentLoaded", async () => {
    initAuth();
    const usuario=getCurrentUser();
    const bienvenida=document.getElementById("bienvenida");
    if(bienvenida&&usuario) bienvenida.textContent=`¡Bienvenido, ${usuario.nombre}!`;
    try {
        const {estadisticas:s}=await apiFetch("/api/dashboard/me");
        const map={totalPedidos:s.pedidos,totalMedicamentos:undefined};
        document.getElementById("totalPedidos")?.replaceChildren(document.createTextNode(s.pedidos));
        document.getElementById("totalMedicamentos")?.replaceChildren(document.createTextNode(s.formulas));
        const formulas=document.getElementById("totalFormulas"); if(formulas) formulas.textContent=s.formulas;
        const activos=document.getElementById("pedidosActivos"); if(activos) activos.textContent=s.pedidosActivos;
        const gasto=document.getElementById("totalGastado"); if(gasto) gasto.textContent=new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0}).format(s.totalPagado);
    } catch(e){ console.error(e); }
});
