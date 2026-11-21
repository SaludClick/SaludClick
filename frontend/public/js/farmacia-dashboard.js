import {apiFetch} from './api.js';

const number = new Intl.NumberFormat('es-CO');
const monthFormat = new Intl.DateTimeFormat('es-CO', { month: 'short', timeZone: 'UTC' });
const stateNames = { PENDIENTE: 'Pendiente', APROBADA: 'Aprobada', PREPARANDO: 'En preparación',
    LISTA: 'Lista', ENTREGADA: 'Entregada', CANCELADA: 'Cancelada', RECHAZADA: 'Rechazada' };
const stateColors = ['#07847e', '#47bca9', '#16574b', '#7ecb93', '#0c655c', '#a8ddc6', '#3b8e68'];
const node = (tag, text = '') => {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
};
const isCount = value => Number.isSafeInteger(value) && value >= 0;
const validCounts = rows => Array.isArray(rows) && rows.every(row => isCount(row.total));
const chartObservers = new WeakMap();

function visualMessage(target, icon, title, detail) {
    chartObservers.get(target)?.disconnect();
    chartObservers.delete(target);
    const box = node('div');
    box.className = 'farmacia-dashboard-empty';
    const mark = node('i');
    mark.className = 'fa-solid ' + icon;
    mark.setAttribute('aria-hidden', 'true');
    box.append(mark, node('strong', title));
    if (detail) box.append(node('p', detail));
    target.replaceChildren(box);
}

function evolucion(target, rows, until) {
    chartObservers.get(target)?.disconnect();
    chartObservers.delete(target);
    target.replaceChildren();
    if (!validCounts(rows)) return visualMessage(target, 'fa-chart-line', 'Evolución no disponible', 'Se requieren solicitudes verificadas para tu farmacia.');
    if (!rows.some(row => row.total > 0)) return visualMessage(target, 'fa-chart-line', 'No hay solicitudes en estos 12 meses.');
    const [year, month] = until.split('-').map(Number);
    const totals = new Map(rows.map(row => [row.mes, row.total]));
    const months = Array.from({ length: 12 }, (_, i) => {
        const date = new Date(Date.UTC(year, month - 12 + i, 1));
        const key = date.toISOString().slice(0, 7);
        return { key, label: monthFormat.format(date).slice(0, 3), total: totals.get(key) ?? 0 };
    });
    const canvas = node('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    const ctx = canvas.getContext('2d');
    function draw() {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (!ctx || !width || !height) return;
        const scale = window.devicePixelRatio || 1;
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        ctx.scale(scale, scale);
        const left = 36;
        const right = width - 9;
        const baseline = height - 11;
        const upper = 18;
        const step = Math.max(1, Math.ceil(Math.max(...months.map(m => m.total)) / 4));
        const max = step * 4;
        const points = months.map(({ total }, i) => [left + (i + .5) / months.length * (right - left), baseline - total / max * (baseline-upper)]);
        ctx.font = '11px system-ui';
        ctx.textAlign = 'right';
        for (let i = 0; i <= 4; i++) {
            const y = baseline - i * (baseline-upper) / 4;
            ctx.beginPath();
            ctx.moveTo(left, y);
            ctx.lineTo(right, y);
            ctx.strokeStyle = '#dfe9e8';
            ctx.stroke();
            ctx.fillStyle = '#526563';
            ctx.fillText(number.format(i * step), left - 6, y + 4, left - 7);
        }
        const trace = () => points.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
        ctx.beginPath();
        trace();
        ctx.lineTo(points.at(-1)[0], baseline);
        ctx.lineTo(points[0][0], baseline);
        ctx.closePath();
        const shade = ctx.createLinearGradient(0, upper, 0, baseline);
        shade.addColorStop(0, '#3ecab78a');
        shade.addColorStop(1, '#3ecab715');
        ctx.fillStyle = shade;
        ctx.fill();
        ctx.beginPath();
        trace();
        ctx.strokeStyle = '#07847e';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.stroke();
    }
    const axis = node('div');
    axis.className = 'farmacia-chart-axis';
    axis.setAttribute('aria-hidden', 'true');
    const details = node('details');
    details.append(node('summary', 'Ver datos mensuales'));
    const list = node('ul');
    for (const { key, label, total } of months) {
        const marker = node('span', label);
        marker.title = key + ' · ' + number.format(total);
        axis.append(marker);
        list.append(node('li', key + ' · ' + number.format(total) + ' solicitudes'));
    }
    details.append(list);
    target.append(canvas, axis, details);
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    chartObservers.set(target, observer);
}

function estados(target, rows) {
    target.replaceChildren();
    if (!validCounts(rows)) return visualMessage(target, 'fa-chart-pie', 'Distribución no disponible', 'Se requieren estados de solicitudes verificadas.');
    const total = rows.reduce((sum, row) => sum + row.total, 0);
    if (!total) return visualMessage(target, 'fa-chart-pie', 'No hay solicitudes en el periodo seleccionado.');
    const ring = node('div');
    ring.className = 'farmacia-state-ring';
    ring.setAttribute('aria-hidden', 'true');
    ring.append(node('strong', number.format(total)));
    const legend = node('ul');
    legend.className = 'farmacia-state-legend';
    const segments = [];
    let offset = 0;
    rows.forEach(({ estado, total: amount }, index) => {
        const color = stateColors[index % stateColors.length];
        const end = offset + amount / total * 100;
        segments.push(color + ' ' + offset + '% ' + end + '%');
        offset = end;
        const item = node('li');
        const swatch = node('span');
        swatch.style.backgroundColor = color;
        swatch.setAttribute('aria-hidden', 'true');
        item.append(swatch, node('span', stateNames[estado] || estado), node('strong', number.format(amount)));
        legend.append(item);
    });
    ring.style.backgroundImage = 'conic-gradient(' + (segments.length > 1 ? segments.join(',') : segments[0] + ', ' + stateColors[0] + ' 100%') + ')';
    target.append(ring, legend);
}

function destacados(target, rows, message) {
    const body = target.querySelector('tbody');
    body.replaceChildren();
    if (!rows?.length) {
        const cell = body.insertRow().insertCell();
        cell.colSpan = 4;
        cell.className = 'farmacia-dashboard-table-empty';
        cell.textContent = message || (Array.isArray(rows)
            ? 'No hay medicamentos con existencias propias registradas.'
            : 'Existencias propias no disponibles.');
        return;
    }
    const labels = { DISPONIBLE: 'Activo', AGOTADO: 'Agotado', INACTIVO: 'Inactivo' };
    for (const med of rows) {
        const row = body.insertRow();
        const free = med.estado === 'INACTIVO' ? 'Inactivo'
            : !med.estado || !isCount(med.disponibles) ? 'No disponible'
            : med.disponibles === 0 ? 'Sin unidades libres' : number.format(med.disponibles) + ' libres';
        const values = [med.nombre, isCount(med.stock) ? number.format(med.stock) : '—', labels[med.estado] || 'Sin registrar', free];
        for (const value of values) row.insertCell().textContent = value;
    }
}

export function initFarmaciaDashboard() {
    const get=id=>document.getElementById(id),status=get('farmaciaDashboardOrdersStatus'),retry=get('retryFarmaciaStats');
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const datePart=type=>parts.find(part=>part.type===type).value;
    const now=[datePart('year'),datePart('month'),datePart('day')].join('-');
    get('farmaciaDashboardDesde').value=now.slice(0,4)+'-01-01';get('farmaciaDashboardHasta').value=now;
    let sequence=0,lastPeriod=null,hasData=false;
    const users = document.querySelector('[data-dashboard-metric="usuariosVinculados"]');
    const trend = get('farmaciaDashboardTrend');
    const avatar = get('farmaciaDashboardAvatar');
    const pharmacyName = get('farmaciaUserName').textContent.trim() || 'Farmacia';
    get('farmaciaDashboardAccountName').textContent = pharmacyName;
    avatar.textContent = pharmacyName.split(/\s+/).slice(0,2).map(word=>Array.from(word)[0]).join('').toUpperCase() || 'F';
    avatar.parentElement.setAttribute('aria-label', 'Perfil de ' + pharmacyName);
    function metric(el,value,loading=false) {
        el.textContent=isCount(value)?number.format(value):'—';
        const unavailable=el.parentElement.querySelector('.farmacia-metric-unavailable');
        if(unavailable)unavailable.hidden=loading||isCount(value);
        if(isCount(value))el.removeAttribute('aria-label');
        else el.setAttribute('aria-label','No disponible');
    }
    function clear(message,loading=false){
        for(const el of document.querySelectorAll('[data-dashboard-metric]'))if(el!==users)metric(el,null,loading);
        for(const el of document.querySelectorAll('[data-dashboard-chart]'))el.replaceChildren(node('p',message));
        for(const id of ['farmaciaDashboardActividad','farmaciaDashboardMensual','farmaciaDashboardStock'])get(id).replaceChildren(node('p',message));
        if(loading) {
            visualMessage(get('farmaciaDashboardEvolucion'),'fa-chart-line',message);
            visualMessage(get('farmaciaDashboardEstados'),'fa-chart-pie',message);
        } else {
            evolucion(get('farmaciaDashboardEvolucion'),null);
            estados(get('farmaciaDashboardEstados'),null);
        }
        destacados(get('farmaciaDashboardDestacados'),null,loading?message:null);
        trend.hidden=true;
        trend.textContent='';
    }
    async function loadUsers(current) {
        metric(users,null,true);
        try {
            const {total}=await apiFetch('/api/farmacia/dashboard/usuarios-vinculados',{signal:AbortSignal.timeout(12000)});
            if(current===sequence)metric(users,total);
        } catch {
            if(current===sequence)metric(users,null);
        }
    }
    function monthly(pendientes,completadas){
        const target=get('farmaciaDashboardMensual');target.replaceChildren();
        if(!Array.isArray(pendientes)||!Array.isArray(completadas)){target.append(node('p','Comparación mensual no disponible.'));return;}
        const months=[...new Set([...pendientes,...completadas].map(r=>r.mes))].sort();
        if(!months.length){target.append(node('p','Sin solicitudes pendientes ni entregas confirmadas en este periodo.'));return;}
        const max=Math.max(1,...[...pendientes,...completadas].map(r=>r.total));
        for(const mes of months){const row=node('div','');row.className='farmacia-month-row';row.append(node('strong',mes));
            for(const [label,rows,color] of [['Pendientes',pendientes,'pending'],['Completadas',completadas,'complete']]){const total=rows.find(r=>r.mes===mes)?.total||0,bar=node('span',''),item=node('div','');item.className='farmacia-month-series';bar.className='farmacia-month-bar '+color;bar.style.width=(total/max*100)+'%';bar.setAttribute('aria-hidden','true');item.append(node('span',`${label}: ${total}`),bar);row.append(item);}target.append(row);
        }
    }
    function chart(target,rows){
        target.replaceChildren();
        if(!validCounts(rows)){target.append(node('p','Datos no disponibles.'));return;}
        if(!rows.length){target.append(node('p','Sin registros verificados en este periodo.'));return;}
        const max=Math.max(1,...rows.map(r=>r.total));const list=node('ul','');list.className='farmacia-chart-bars';
        for(const row of rows){const item=node('li',''),label=node('span',row.nombre||row.mes||row.estado),bar=node('span',''),count=node('strong',String(row.total));bar.className='farmacia-chart-bar';bar.style.width=Math.max(1,row.total/max*100)+'%';bar.setAttribute('aria-hidden','true');item.append(label,count,bar);list.append(item);}target.append(list);
    }
    async function load(){
        const current=++sequence,query=new URLSearchParams({desde:get('farmaciaDashboardDesde').value,hasta:get('farmaciaDashboardHasta').value});get('farmaciaDashboardMetrics').setAttribute('aria-busy','true');if(!hasData||lastPeriod!==query.toString())clear('Actualizando información…',true);status.textContent='Consultando estadísticas autorizadas…';status.setAttribute('role','status');
        const usersRequest=loadUsers(current);
        try{
            const result=await apiFetch('/api/farmacia/dashboard/estadisticas?'+query,{signal:AbortSignal.timeout(12000)});if(current!==sequence)return;
            if(!result.disponible){hasData=false;clear('Sin datos operativos verificados.');status.textContent=result.motivo;retry.hidden=true;return;}
            for(const el of document.querySelectorAll('[data-dashboard-metric]'))if(el!==users)metric(el,result.indicadores[el.dataset.dashboardMetric]);
            evolucion(get('farmaciaDashboardEvolucion'),result.graficos.evolucion,result.periodo?.hasta||query.get('hasta'));
            estados(get('farmaciaDashboardEstados'),result.graficos.estados);
            destacados(get('farmaciaDashboardDestacados'),result.destacados);
            for(const el of document.querySelectorAll('[data-dashboard-chart]'))chart(el,result.graficos[el.dataset.dashboardChart]);
            monthly(result.graficos.pendientesMes,result.graficos.completadasMes);
            const stock=get('farmaciaDashboardStock');stock.replaceChildren();
            if(!result.existencias)stock.append(node('p','Existencias propias pendientes de activación autorizada. No se usa el saldo global como saldo de tu farmacia.'));
            else if(!result.alertasStock.length)stock.append(node('p','Sin medicamentos con existencias bajas.'));
            else for(const med of result.alertasStock){const item=node('article','');item.className='farmacia-stock-alert';item.append(node('strong',med.nombre),node('span',med.presentacion||'Sin presentación registrada'),node('span',`${med.disponibles} unidades libres`));stock.append(item);}
            const activity=get('farmaciaDashboardActividad');activity.replaceChildren();
            for(const row of result.actividad){const item=node('article','');item.className='farmacia-activity';const link=node('a','Solicitud #'+row.id);link.href='/pages/farmacia-solicitudes.html?id='+encodeURIComponent(row.id);item.append(link,node('span',row.paciente),node('time',new Date(row.fecha).toLocaleDateString('es-CO')),node('span',row.estado));activity.append(item);}
            if(!result.actividad.length)activity.append(node('p','Sin actividad autorizada en este periodo.'));
            const comparison=result.tendencia;
            trend.hidden=!(comparison?.anterior>0&&Number.isFinite(comparison.variacionPorcentual));
            if(!trend.hidden)trend.textContent=`${comparison.variacionPorcentual>0?'+':''}${number.format(comparison.variacionPorcentual)} % frente al periodo anterior (${comparison.anterior} → ${comparison.actual})`;
            hasData=true;lastPeriod=query.toString();status.textContent='Indicadores actualizados. Las finalizaciones y cantidades proceden de entregas confirmadas.';retry.hidden=true;
        }catch(e){if(current===sequence){hasData=false;clear('No se pudo verificar la información.');status.textContent=e.message;status.setAttribute('role','alert');retry.hidden=false;}}
        finally{await usersRequest;if(current===sequence)get('farmaciaDashboardMetrics').setAttribute('aria-busy','false');}
    }
    get('farmaciaDashboardPeriodo').addEventListener('submit',e=>{e.preventDefault();void load();});get('refreshFarmacia').addEventListener('click',()=>void load());retry.addEventListener('click',()=>void load());document.addEventListener('farmacia:solicitudes-actualizadas',()=>void load());void load();
}
