import {apiFetch,apiUrl} from './api.js';
import {checkAuthGuard,getCurrentUser,getToken,logout} from './auth.js';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>v?new Date(v).toLocaleString('es-CO'):'—';
const role=v=>({1:'Administrador',2:'Cliente',3:'Farmacia',4:'EPS'}[v]||'Sin definir');
const api=(path,options)=>apiFetch('/api/administrativo'+path,options);
const mutate=(path,body,method='POST')=>api(path,{method,body:JSON.stringify(body)});
const client=document.body.dataset.client==='true';
const labels={dashboard:'Resumen',usuarios:'Usuarios',solicitudes:client?'Mis solicitudes':'Solicitudes administrativas',mensajes:client?'Mis conversaciones':'Mensajes',notificaciones:'Notificaciones',informes:'Informes',auditoria:'Auditoría',configuracion:'Configuración'};
let section=client?'solicitudes':'dashboard',page=1,filters={},users=[],admins=[],currentCase=null,loading=false;
function notice(message='',error=false){$('adminNotice').textContent=message;$('adminNotice').dataset.error=String(error);$('adminNotice').setAttribute('role',error?'alert':'status');}
async function run(fn,button){if(button)button.disabled=true;try{await fn();}catch(e){notice(e.message,true);}finally{if(button)button.disabled=false;}}
const badge=v=>`<span class="ad-badge">${esc(v||'SIN ESTADO')}</span>`;
function table(headers,body){return `<div class="ad-table-wrap"><table><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${body||`<tr><td colspan="${headers.length}" class="ad-empty">No hay resultados para esta consulta.</td></tr>`}</tbody></table></div>`;}
function dates(){return `<label>Desde<input name="desde" type="date" value="${esc(filters.desde||'')}"></label><label>Hasta<input name="hasta" type="date" value="${esc(filters.hasta||'')}"></label>`;}
function toolbar({states=[],roles=false,withDates=false}={}){
    return `<form id="filterForm" class="ad-toolbar"><label>Buscar<input name="buscar" type="search" maxlength="120" value="${esc(filters.buscar||'')}" placeholder="Nombre, asunto o identificador"></label>${states.length?`<label>Estado<select name="estado"><option value="">Todos</option>${states.map(s=>`<option ${filters.estado===s?'selected':''}>${s}</option>`).join('')}</select></label>`:''}${roles?`<label>Rol<select name="rol_id"><option value="">Todos</option>${[1,2,3,4].map(r=>`<option value="${r}" ${Number(filters.rol_id)===r?'selected':''}>${role(r)}</option>`).join('')}</select></label>`:''}${withDates?dates():''}<button type="submit" class="ad-primary">Aplicar filtros</button><button type="button" id="clearFilters">Limpiar</button></form>`;
}
function bindFilters(){const form=$('filterForm');form?.addEventListener('submit',e=>{e.preventDefault();filters=Object.fromEntries(new FormData(form));page=1;run(load);});$('clearFilters')?.addEventListener('click',()=>{filters={};page=1;run(load);});}
function pagination(total,limit=20){return `<div class="ad-pagination"><button type="button" id="prevPage" ${page===1?'disabled':''}>Anterior</button><span>Página ${page} · ${total} resultados</span><button type="button" id="nextPage" ${page*limit>=total?'disabled':''}>Siguiente</button></div>`;}
function bindPagination(){for(const [id,delta] of [['prevPage',-1],['nextPage',1]])$(id)?.addEventListener('click',()=>{page+=delta;run(load);});}
const query=extra=>new URLSearchParams({...filters,page,...extra}).toString();
async function dashboard(){
    const {estadisticas:s}=await api('/dashboard');
    const cards=[['Usuarios registrados',s.usuarios.total,'Cuentas de todos los roles'],['Usuarios activos',s.usuarios.activos,`${s.usuarios.inactivos} inactivos · ${s.usuarios.sin_estado} sin estado`],['Clientes',s.usuarios.clientes,'Cuentas con rol cliente'],['Solicitudes abiertas',s.solicitudes.abiertas,`${s.solicitudes.atendidas} atendidas`],['Mensajes pendientes',s.mensajes.pendientes,'Sin responsable o asignados a ti'],['Notificaciones sin leer',s.notificaciones.sin_leer,'Avisos dirigidos a tu cuenta']];
    return `<div class="ad-grid">${cards.map(([title,n,sub])=>`<article class="ad-card ad-stat"><span>${title}</span><strong>${esc(n)}</strong><small>${esc(sub)}</small></article>`).join('')}</div><div class="ad-quick">${['usuarios','solicitudes','informes','mensajes','auditoria','configuracion'].map(k=>`<a class="ad-button" href="#${k}">${labels[k]}</a>`).join('')}</div><article class="ad-card"><h2>Actividad reciente</h2>${table(['Fecha','Responsable','Acción','Registro'],s.actividad.map(x=>`<tr><td>${date(x.created_at)}</td><td>#${x.actor_id}</td><td>${esc(x.accion)}</td><td>${esc(x.entidad)} #${esc(x.registro_id)}</td></tr>`).join(''))}</article>`;
}
async function userList(){
    const r=await api('/usuarios?'+query());users=r.usuarios;
    return `<section class="ad-card"><div class="ad-heading"><h2>Directorio de usuarios</h2><button type="button" id="newUser" class="ad-primary">Crear usuario</button></div>${toolbar({states:['ACTIVO','INACTIVO','SIN_ESTADO'],roles:true})}${table(['Usuario','Documento','Rol','Estado','Registro','Acciones'],users.map(u=>`<tr><td>${esc(u.nombre)} ${esc(u.apellido)}<small>${esc(u.correo)}</small></td><td>${esc(u.cedula||'—')}</td><td>${role(u.rol_id)}</td><td>${badge(u.estado)}</td><td>${date(u.created_at)}</td><td>${u.rol_id===1?'Cuenta protegida':`<button type="button" data-user="${u.id}">Editar</button>`}</td></tr>`).join(''))}${pagination(r.total)}</section>`;
}
function bindUsers(){
    $('newUser').addEventListener('click',()=>openUser());
    document.querySelectorAll('[data-user]').forEach(b=>b.addEventListener('click',()=>openUser(users.find(u=>u.id===Number(b.dataset.user)))));
}
function openUser(user){
    const form=$('userForm');form.reset();$('userFormNotice').textContent='';
    for(const key of ['id','nombre','apellido','correo','cedula','telefono','ciudad','rol_id','estado']) if(user&&form.elements[key]) form.elements[key].value=user[key]??'';
    if(user&&!user.estado){form.elements.estado.value='INACTIVO';$('userFormNotice').textContent='Esta cuenta no tiene estado definido. Revisa su habilitación antes de guardar.';}
    $('initialPasswordLabel').hidden=Boolean(user);form.elements.password.required=!user;form.elements.password.disabled=Boolean(user);
    $('userDialogTitle').textContent=user?'Editar cuenta':'Crear usuario';$('userDialog').showModal();
}
function caseForm(){return `<details class="ad-card"><summary>Crear ${section==='mensajes'?'conversación con Administración':'solicitud administrativa'}</summary><form id="newCase" class="ad-form"><label class="ad-wide">Asunto<input name="asunto" required maxlength="160"></label><label>Categoría<select name="categoria"><option value="ACCESO">Acceso</option><option value="CUENTA">Cuenta</option><option value="DATOS_PERSONALES">Datos personales</option><option value="SOPORTE">Soporte</option><option value="OTRA_ADMINISTRATIVA">Otra consulta administrativa</option></select></label><label class="ad-wide">Mensaje<textarea name="contenido" required maxlength="2000" placeholder="Describe tu consulta administrativa. No incluyas contraseñas ni información clínica."></textarea></label><div class="ad-wide"><button type="submit" class="ad-primary">Enviar a Administración</button></div></form></details>`;}
async function caseList(){
    const type=section==='mensajes'?'CONVERSACION':'SOLICITUD';
    const r=await api('/atenciones?'+query({tipo:type}));
    return `${client?caseForm():''}<section class="ad-card">${toolbar({states:['ABIERTA','EN_ATENCION','RESUELTA','CERRADA'],withDates:true})}${table(['Atención','Cliente','Estado','Responsable','Actualización','Acciones'],r.casos.map(c=>`<tr><td>#${c.id} · ${esc(c.asunto)}<small>${c.pendientes} mensajes pendientes</small></td><td>${esc(c.cliente_nombre)} ${esc(c.cliente_apellido)}</td><td>${badge(c.estado)}</td><td>${esc(c.responsable_nombre||'Sin asignar')}</td><td>${date(c.updated_at)}</td><td><button type="button" data-case="${c.id}">Abrir atención</button></td></tr>`).join(''))}${pagination(r.total)}</section>`;
}
function bindCases(){
    document.querySelectorAll('[data-case]').forEach(b=>b.addEventListener('click',()=>run(()=>detail(Number(b.dataset.case)),b)));
    $('newCase')?.addEventListener('submit',e=>{e.preventDefault();const form=e.currentTarget;run(async()=>{const r=await mutate('/atenciones',{...Object.fromEntries(new FormData(form)),tipo:section==='mensajes'?'CONVERSACION':'SOLICITUD'});await load();await detail(r.caso.id);notice('Tu consulta fue enviada a Administración.');},form.querySelector('button'));});
}
async function detail(id,before){
    const r=await api(`/atenciones/${id}${before?'?antes='+before:''}`);currentCase=id;
    if(!client&&!admins.length)admins=(await api('/responsables')).administradores;
    const c=r.caso;
    $('caseDetail').hidden=false;
    $('caseDetail').innerHTML=`<div class="ad-heading"><div><h2>#${c.id} · ${esc(c.asunto)}</h2><p>${esc(c.categoria)} · ${badge(c.estado)}</p></div><button type="button" id="closeCase">Cerrar detalle</button></div>${!client?`<form id="caseState" class="ad-toolbar"><label>Estado<select name="estado">${['ABIERTA','EN_ATENCION','RESUELTA','CERRADA'].map(s=>`<option ${s===c.estado?'selected':''}>${s}</option>`).join('')}</select></label><label>Responsable<select name="responsable_id"><option value="">Sin asignar</option>${admins.map(a=>`<option value="${a.id}" ${a.id===c.responsable_id?'selected':''}>${esc(a.nombre)} ${esc(a.apellido)}</option>`).join('')}</select></label><button type="submit" class="ad-primary">Guardar atención</button></form>`:''}<div class="ad-actions">${r.hayAnteriores?'<button type="button" id="olderMessages">Ver mensajes anteriores</button>':''}<button type="button" id="latestMessages">Actualizar mensajes</button><button type="button" id="markCaseRead">Marcar mensajes visibles como leídos</button></div><div class="ad-log" role="log" aria-label="Historial de mensajes">${r.mensajes.map(m=>`<article class="ad-message ${m.rol_id===1?'staff':''}"><strong>${esc(m.nombre)} · ${role(m.rol_id)}</strong><p>${esc(m.contenido)}</p><time>${date(m.created_at)}${m.leido_at?' · Leído':''}</time></article>`).join('')||'<p class="ad-empty">No hay mensajes.</p>'}</div>${['ABIERTA','EN_ATENCION'].includes(c.estado)?`<form id="replyForm"><label>Respuesta administrativa<textarea name="contenido" required maxlength="2000"></textarea></label><button type="submit" class="ad-primary">Enviar respuesta</button></form>`:'<p>Esta atención está resuelta o cerrada.</p>'}<details><summary>Historial de atención</summary>${table(['Fecha','Acción','Responsable'],r.historial.map(h=>`<tr><td>${date(h.created_at)}</td><td>${esc(h.accion)}</td><td>#${h.actor_id}</td></tr>`).join(''))}</details>`;
    $('closeCase').addEventListener('click',()=>{currentCase=null;$('caseDetail').hidden=true;});
    $('olderMessages')?.addEventListener('click',()=>run(()=>detail(id,r.mensajes[0].id)));
    $('latestMessages').addEventListener('click',()=>run(()=>detail(id)));
    $('markCaseRead').addEventListener('click',()=>run(async()=>{if(r.mensajes.length)await mutate(`/atenciones/${id}/leido`,{hasta:r.mensajes.at(-1).id});notice('Mensajes visibles marcados como leídos.');}));
    $('caseState')?.addEventListener('submit',e=>{e.preventDefault();const input=Object.fromEntries(new FormData(e.currentTarget));const changes={};if(input.estado!==c.estado)changes.estado=input.estado;const assigned=input.responsable_id?Number(input.responsable_id):null;if(assigned!==c.responsable_id)changes.responsable_id=assigned;run(async()=>{if(!Object.keys(changes).length)return notice('No hay cambios para guardar.');await mutate('/atenciones/'+id,changes,'PATCH');await detail(id);notice('Atención actualizada.');},e.currentTarget.querySelector('button'));});
    $('replyForm')?.addEventListener('submit',e=>{e.preventDefault();const form=e.currentTarget;run(async()=>{await mutate(`/atenciones/${id}/mensajes`,Object.fromEntries(new FormData(form)));await detail(id);notice('Respuesta enviada.');},form.querySelector('button'));});
}
async function notifications(){
    const r=await api('/notificaciones?'+query());
    return `<section class="ad-card"><h2>${r.sinLeer} notificaciones sin leer</h2>${toolbar({states:['NO_LEIDA','LEIDA']})}${r.notificaciones.map(n=>`<article class="ad-notification"><div><strong>${esc(n.titulo)}</strong><small class="ad-muted"> · ${date(n.created_at)}</small><p>${n.caso_id?`<a href="#${n.caso_tipo==='CONVERSACION'?'mensajes':'solicitudes'}/${n.caso_id}">Abrir atención #${n.caso_id}</a>`:'Actividad general del panel'}</p>${badge(n.leida_at?'LEÍDA':'NO LEÍDA')}</div>${!n.leida_at?`<button type="button" data-read="${n.id}">Marcar leída</button>`:''}</article>`).join('')||'<p class="ad-empty">No hay notificaciones para esta consulta.</p>'}${pagination(r.total)}</section>`;
}
async function audit(){const r=await api('/auditoria?'+query());const total=r.actividades[0]?.total||0;return `<section class="ad-card">${toolbar({withDates:true})}${table(['Fecha','Actor','Acción','Entidad','Registro','Resultado'],r.actividades.map(a=>`<tr><td>${date(a.created_at)}</td><td>#${a.actor_id}</td><td>${esc(a.accion)}</td><td>${esc(a.entidad)}</td><td>${esc(a.registro_id)}</td><td>${badge(a.resultado)}</td></tr>`).join(''))}${pagination(total)}</section>`;}
function reports(){return `<section class="ad-card"><h2>Informes administrativos</h2><p class="ad-muted">Máximo 1.000 registros por informe. Acota las fechas para exportaciones mayores. No incluyen contraseñas, documentos ni información clínica.</p><form id="reportForm" class="ad-toolbar"><label>Informe<select name="tipo">${[['usuarios','Usuarios registrados'],['clientes','Clientes y estados'],['roles','Usuarios por rol'],['solicitudes','Solicitudes y estados'],['tiempos','Tiempos de atención'],['conversaciones','Conversaciones atendidas y pendientes'],['actividad','Actividad administrativa']].map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label><label>Buscar<input name="buscar" type="search" maxlength="120"></label>${dates()}<button type="submit" class="ad-primary">Consultar</button><button type="button" data-export="csv">Exportar CSV</button><button type="button" data-export="pdf">Exportar PDF</button></form><div id="reportResult"></div></section>`;}
async function getReport(format='json'){
    const form=$('reportForm');if(!form.reportValidity())return;const data=Object.fromEntries(new FormData(form));const type=data.tipo;delete data.tipo;data.formato=format;
    const path='/informes/'+type+'?'+new URLSearchParams(data);
    if(format==='json'){const {informe:r}=await api(path);const keys=Object.keys(r.filas[0]||{});$('reportResult').innerHTML=`<p>${r.filas.length} registros · ${date(r.generadoEn)}${r.limitado?' · Límite alcanzado: acota las fechas.':''}</p>${table(keys,r.filas.map(row=>`<tr>${keys.map(k=>`<td>${esc(row[k])}</td>`).join('')}</tr>`).join(''))}`;return;}
    const response=await fetch(apiUrl('/api/administrativo'+path),{headers:{Authorization:'Bearer '+getToken()}});
    if(response.status===401){logout();return;}
    if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.mensaje||'No se pudo exportar el informe.');}
    const url=URL.createObjectURL(await response.blob());const a=document.createElement('a');a.href=url;a.download=`saludclick-${type}.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
async function configuration(){
    const [settings,{usuario:u},{preferencias:p}]=await Promise.all([api('/configuracion'),api('/perfil'),api('/preferencias')]);
    const general=settings.configuracion.find(s=>s.clave==='general')?.valor||{nombrePanel:'Administración SaludClick',mensajeSoporte:'Atención de cuentas y consultas administrativas.'};
    const faq=settings.configuracion.find(s=>s.clave==='faq')?.valor||[];
    document.body.classList.toggle('compact',p.compacto);
    return `<div class="ad-columns"><section class="ad-card"><h2>Mi perfil administrativo</h2><form id="profileForm" class="ad-form">${['nombre','apellido','telefono','ciudad'].map(k=>`<label>${esc(k)}<input name="${k}" value="${esc(u[k]||'')}" maxlength="${k==='telefono'?20:100}" ${['nombre','apellido'].includes(k)?'required':''}></label>`).join('')}<p class="ad-wide ad-muted">Correo: ${esc(u.correo)} · Documento protegido: ${esc(u.cedula||'sin registrar')}</p><button type="submit" class="ad-primary">Guardar perfil</button></form></section><section class="ad-card"><h2>Seguridad</h2><form id="passwordForm" class="ad-form"><label class="ad-wide">Contraseña actual<input type="password" name="actual" autocomplete="current-password" required></label><label class="ad-wide">Nueva contraseña<input type="password" name="nueva" minlength="12" maxlength="72" autocomplete="new-password" required></label><p class="ad-wide ad-muted">El cambio cierra las sesiones administrativas anteriores. No modifica otras cuentas.</p><button type="button" class="ad-primary">Cambiar contraseña</button></form></section><section class="ad-card"><h2>Preferencias</h2><form id="preferencesForm"><label class="ad-check"><input type="checkbox" name="notificaciones" ${p.notificaciones?'checked':''}>Recibir nuevas notificaciones</label><label class="ad-check"><input type="checkbox" name="compacto" ${p.compacto?'checked':''}>Vista compacta</label><p class="ad-muted">El historial existente se conserva.</p><button type="submit" class="ad-primary">Guardar preferencias</button></form></section><section class="ad-card"><h2>Parámetros del panel</h2><form id="generalForm" class="ad-form"><label class="ad-wide">Nombre del panel<input name="nombrePanel" value="${esc(general.nombrePanel)}" maxlength="80" required></label><label class="ad-wide">Mensaje de soporte<textarea name="mensajeSoporte" maxlength="500" required>${esc(general.mensajeSoporte)}</textarea></label><button type="button" class="ad-primary">Guardar parámetros</button></form></section></div><section class="ad-card"><h2>Preguntas frecuentes de VITALIX</h2><p>Solo orientación administrativa. No introduzcas recomendaciones médicas ni secretos.</p><form id="faqForm"><div id="faqRows">${faq.map(f=>faqRow(f)).join('')}</div><div class="ad-actions"><button type="button" id="addFaq">Añadir pregunta</button><button type="submit" class="ad-primary">Guardar respuestas</button></div></form></section>`;
}
function faqRow(f={pregunta:'',respuesta:''}){return `<fieldset class="ad-faq"><label>Pregunta<input name="pregunta" required maxlength="160" value="${esc(f.pregunta)}"></label><label>Respuesta<textarea name="respuesta" required maxlength="1000">${esc(f.respuesta)}</textarea></label><button type="button" data-remove-faq>Retirar pregunta</button></fieldset>`;}
function bindConfig(){
    for(const [id,path,build] of [['profileForm','/perfil',f=>Object.fromEntries(new FormData(f))],['preferencesForm','/preferencias',f=>({notificaciones:f.elements.notificaciones.checked,compacto:f.elements.compacto.checked})],['generalForm','/configuracion/general',f=>({valor:Object.fromEntries(new FormData(f))})],['faqForm','/configuracion/faq',f=>({valor:[...f.querySelectorAll('fieldset')].map(row=>({pregunta:row.querySelector('[name=pregunta]').value,respuesta:row.querySelector('[name=respuesta]').value}))})]]){
        $(id).addEventListener('submit',e=>{e.preventDefault();const form=e.currentTarget;run(async()=>{const data=build(form);await mutate(path,data,'PUT');if(id==='preferencesForm')document.body.classList.toggle('compact',data.compacto);notice('Cambios guardados.');},form.querySelector('button[type=submit],button.ad-primary'));});
    }
    $('addFaq').addEventListener('click',()=>{if($('faqRows').children.length>=30)return notice('Máximo 30 preguntas.',true);$('faqRows').insertAdjacentHTML('beforeend',faqRow());});
    $('faqRows').addEventListener('click',e=>{if(e.target.closest('[data-remove-faq]'))e.target.closest('fieldset').remove();});
    $('passwordForm').addEventListener('submit',e=>{e.preventDefault();const form=e.currentTarget;run(async()=>{await mutate('/password',Object.fromEntries(new FormData(form)));form.reset();logout();},form.querySelector('button'));});
}
async function load(){
    if(loading)return;loading=true;$('adminView').setAttribute('aria-busy','true');$('adminRefresh').disabled=true;
    try{
        const views={dashboard,usuarios:userList,solicitudes:caseList,mensajes:caseList,notificaciones:notifications,informes:reports,auditoria:audit,configuracion:configuration};
        const html=await views[section]();$('adminView').innerHTML=html;
        bindFilters();bindPagination();
        if(section==='usuarios')bindUsers();if(['solicitudes','mensajes'].includes(section))bindCases();
        if(section==='notificaciones')document.querySelectorAll('[data-read]').forEach(b=>b.addEventListener('click',()=>run(async()=>{await mutate(`/notificaciones/${b.dataset.read}/leida`,{},'PATCH');await load();},b)));
        if(section==='informes'){$('reportForm').addEventListener('submit',e=>{e.preventDefault();run(()=>getReport());});document.querySelectorAll('[data-export]').forEach(b=>b.addEventListener('click',()=>run(()=>getReport(b.dataset.export),b)));}
        if(section==='configuracion')bindConfig();
    }catch(error){$('adminView').innerHTML='<section class="ad-card"><h2>Información no disponible</h2><p>Los datos no se han cargado. Puedes volver a intentarlo con Actualizar.</p></section>';notice(error.message,true);}
    finally{loading=false;$('adminRefresh').disabled=false;$('adminView').setAttribute('aria-busy','false');}
}
async function navigate(){const [target,id]=location.hash.slice(1).split('/');const allowed=client?['solicitudes','mensajes','notificaciones']:Object.keys(labels);section=allowed.includes(target)?target:allowed[0];page=1;filters={};currentCase=null;$('caseDetail').hidden=true;$('sectionTitle').textContent=labels[section];document.querySelectorAll('[data-section]').forEach(a=>{if(a.dataset.section===section)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});notice();await load();if(id&&['solicitudes','mensajes'].includes(section)&&/^\d+$/.test(id))await run(()=>detail(Number(id)));}
async function start(){
    if(!checkAuthGuard())return;const user=getCurrentUser();const expected=client?2:1;
    const actual=Number(user?.rol_id??user?.rol);
    if(actual!==expected){location.replace({1:'/pages/admin.html',2:'/pages/dashboard.html',3:'/pages/farmacia.html',4:'/pages/eps.html'}[actual]||'/login.html');return;}
    $('adminIdentity').textContent=user.nombre||role(expected);$('adminLogout').addEventListener('click',logout);
    $('adminRefresh').addEventListener('click',()=>run(async()=>{notice();await load();if(currentCase)await detail(currentCase);}));
    $('adminMenu').addEventListener('click',()=>{const open=$('adminSidebar').classList.toggle('open');$('adminMenu').setAttribute('aria-expanded',String(open));});
    $('cancelUser')?.addEventListener('click',()=>$('userDialog').close());
    $('userForm')?.addEventListener('submit',e=>{e.preventDefault();const form=e.currentTarget,button=form.querySelector('button[type=submit]');run(async()=>{const data=Object.fromEntries(new FormData(form)),id=data.id;delete data.id;data.rol_id=Number(data.rol_id);if(id)delete data.password;try{await mutate('/usuarios'+(id?'/'+id:''),data,id?'PATCH':'POST');form.reset();$('userDialog').close();await load();notice('Cuenta guardada.');}catch(error){$('userFormNotice').textContent=error.message;}},button);});
    window.addEventListener('hashchange',navigate);await navigate();
    // Poll only counters: never replace an unsent reply or an edited form.
    const refreshCounts=()=>{if(document.hidden)return;api('/notificaciones?limit=1').then(r=>{const link=document.querySelector('[data-section=notificaciones]');if(link)link.textContent=`Notificaciones (${r.sinLeer})`;}).catch(()=>{});};
    refreshCounts();const timer=setInterval(refreshCounts,20000);
    const socket=window.io?.('/administrativo',{auth:{token:getToken()},reconnectionAttempts:3});
    socket?.on('administrativo:actualizado',()=>{refreshCounts();if(currentCase)notice('Hay actividad nueva. Actualiza los mensajes cuando termines tu respuesta.');});
    window.addEventListener('pagehide',()=>{clearInterval(timer);socket?.disconnect();},{once:true});
}
start();
