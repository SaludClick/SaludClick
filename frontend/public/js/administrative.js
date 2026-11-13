import {connectAdministrative} from './administrative-transport.js';
import {createAdministrativeChat} from './administrative-chat.js';
import {apiFetch,apiUrl} from './api.js';
import {checkAuthGuard,getCurrentUser,getToken,logout,actualizarUsuarioSesion} from './auth.js';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>v?new Date(v).toLocaleString('es-CO'):'—';
const role=v=>({1:'Administrador',2:'Cliente',3:'Farmacia',4:'EPS'}[v]||'Sin definir');
const api=(path,options)=>apiFetch('/api/administrativo'+path,options);
const mutate=(path,body,method='POST')=>api(path,{method,body:JSON.stringify(body)});
const client=document.body.dataset.client==='true';
const labels={dashboard:'Dashboard',usuarios:'Usuarios',solicitudes:'Solicitudes',notificaciones:'Notificaciones',informes:'Informes',configuracion:'Configuración'};
let section=client?'solicitudes':'dashboard',page=1,filters={},users=[],currentCase=null,loading=false,loadVersion=0;
function updateNotificationCount(value){
    const n=Number(value)||0,link=document.querySelector('[data-section=notificaciones]');if(link)link.textContent=`Notificaciones (${n})`;
    const bell=$('adminNotificationBell'),count=$('adminNotificationCount');if(!bell||!count)return;
    const previous=Number(count.textContent)||0;count.textContent=String(n);count.hidden=n===0;bell.classList.toggle('has-unread',n>0);bell.setAttribute('aria-label',`Notificaciones: ${n} sin leer`);
    if(n>previous){bell.classList.remove('is-new');requestAnimationFrame(()=>bell.classList.add('is-new'));}
}
async function refreshNotificationCount(){if(!document.hidden){try{updateNotificationCount((await api('/notificaciones?limit=1')).sinLeer);}catch{}}}
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
    const d=s.directorio;
    const cards=[['Registros en Usuarios',d.registros_unicos,'Sin duplicar coincidencias entre fuentes'],['Cuentas de acceso',d.cuentas_acceso,`${d.cuentas_activas} activas · ${d.cuentas_inactivas} inactivas · ${d.cuentas_sin_estado} sin estado`],['Afiliados EPS',d.afiliados_eps,'Registros consultados en su origen'],['Coincidencias',d.coincidencias,`${d.solo_eps} afiliados sin cuenta local vinculada`],['Solicitudes pendientes',s.solicitudes.pendientes,'Estado ABIERTA'],['Solicitudes en atención',s.solicitudes.en_atencion,'Estado EN_ATENCION'],['Solicitudes resueltas',s.solicitudes.resueltas,`${s.solicitudes.cerradas} cerradas`],['Notificaciones sin leer',s.notificaciones.sin_leer,'Avisos dirigidos a tu cuenta']];
    return `<div class="ad-grid">${cards.map(([title,n,sub])=>`<article class="ad-card ad-stat"><span>${title}</span><strong>${esc(n)}</strong><small>${esc(sub)}</small></article>`).join('')}</div><div class="ad-quick">${['usuarios','solicitudes','notificaciones','informes','configuracion'].map(k=>`<a class="ad-button" href="#${k}">${labels[k]}</a>`).join('')}</div>`;
}
function recordDialog(title,html){
    $('recordDialog')?.remove();const dialog=document.createElement('dialog');dialog.id='recordDialog';dialog.setAttribute('aria-labelledby','recordDialogTitle');
    dialog.innerHTML=`<h2 id="recordDialogTitle">${esc(title)}</h2>${html}<button type="button" id="closeRecord">Cerrar</button>`;document.body.append(dialog);$('closeRecord').addEventListener('click',()=>dialog.close());dialog.showModal();return dialog;
}
async function userDetail(key){
    const {registro:u}=await api('/usuarios/directorio/'+encodeURIComponent(key));
    recordDialog('Detalle del registro',`<dl>${[['Nombre',`${u.nombre} ${u.apellido}`],['Correo',u.correo],['Documento',u.cedula],['Tipo de documento',u.tipo_documento],['Origen',u.origen],['Rol / tipo',u.id===null?'Afiliado EPS sin cuenta de acceso':role(u.rol_id)],['Estado de cuenta',u.estado_cuenta],['Registro de cuenta',u.created_at?date(u.created_at):'No disponible en origen']].map(([label,value])=>`<dt>${label}</dt><dd>${esc(value||'Sin registrar')}</dd>`).join('')}</dl>${u.afiliados_eps.length?`<h3>Datos originales EPS · solo lectura</h3>${table(['Identificador','Nombre y apellidos','Documento','Correo','Estado original'],u.afiliados_eps.map(a=>`<tr><td>${esc(a.id)}</td><td>${esc(a.nombres)} ${esc(a.apellidos)}</td><td>${esc(a.tipo_documento)} ${esc(a.documento)}</td><td>${esc(a.correo)}</td><td>${esc(a.estado)}</td></tr>`).join(''))}`:''}${u.revision_identidad?'<p role="status">Hay una posible coincidencia de documento que requiere revisión. Los registros se conservan por separado.</p>':''}`);
}
function directoryToolbar(available){
    const select=(name,label,options)=>`<label>${label}<select name="${name}"><option value="">Todos</option>${options.map(([key,value])=>`<option value="${esc(key)}" ${String(filters[name]||'')===String(key)?'selected':''}>${esc(value)}</option>`).join('')}</select></label>`;
    return `<form id="filterForm" class="ad-toolbar"><label>Buscar<input type="search" name="buscar" maxlength="120" value="${esc(filters.buscar||'')}" placeholder="Nombre, correo o documento"></label>${select('origen','Origen',[['SALUDCLICK','SaludClick'],['EPS','EPS']])}${select('tipo_registro','Tipo de registro',[['CUENTAS','Cuentas de acceso'],['AFILIADOS','Afiliados EPS'],['SIN_CUENTA','Afiliados sin cuenta'],['VINCULADOS','Coincidencias vinculadas']])}${select('rol_id','Rol de cuenta',[1,2,3,4].map(r=>[r,role(r)]))}${select('estado','Estado de cuenta',[['ACTIVO','Activa'],['INACTIVO','Inactiva'],['SIN_ESTADO','Sin estado definido'],['SIN_CUENTA','Sin cuenta de acceso']])}${select('estado_afiliacion','Estado de afiliación',(available.estados_afiliacion||[]).map(s=>[s,s]))}<button type="submit" class="ad-primary">Aplicar filtros</button><button type="button" id="clearFilters">Limpiar</button></form>`;
}
async function userList(){
    const r=await api('/usuarios?'+query());users=r.usuarios;page=r.page;const s=r.resumen;
    return `<section class="ad-card"><div class="ad-heading"><h2>Usuarios · directorio unificado</h2><button type="button" id="newUser" class="ad-primary">Crear cuenta local</button></div><p id="directorySummary">${s.registros_unicos} registros únicos · ${s.cuentas_acceso} cuentas SaludClick · ${s.afiliados_eps} afiliados EPS · ${s.coincidencias} coincidencias.</p><p class="ad-muted">Las coincidencias se muestran una sola vez. Los registros EPS se consultan en origen y no reciben acceso automáticamente.</p>${s.revision_identidad?`<p role="status">${s.revision_identidad} coincidencias posibles requieren revisión de identidad.</p>`:''}${directoryToolbar(r.filtros)}${table(['Nombre y correo','Documento','Rol o tipo de registro','Estado','Origen','Acciones'],users.map(u=>`<tr data-record="${esc(u.clave)}"><td>${esc(u.nombre)} ${esc(u.apellido)}<small>${esc(u.correo||'Sin correo')}</small></td><td>${esc(u.tipo_documento||'')} ${esc(u.cedula||'Sin documento')}</td><td>${u.id===null?'Afiliado EPS · sin acceso':role(u.rol_id)}${u.id!==null&&u.afiliados_eps.length?'<small>Cuenta y afiliación EPS</small>':''}</td><td>${badge(u.id===null?u.estado:u.estado_cuenta)}${u.id===null?'<small>Sin cuenta de acceso</small>':u.afiliados_eps.map(a=>`<small>Afiliación: ${esc(a.estado)}</small>`).join('')}</td><td>${badge(u.origen)}${u.revision_identidad?'<small>Revisar identidad</small>':''}</td><td><button type="button" data-user-detail="${esc(u.clave)}">Consultar</button> ${u.acciones.editar?`<button type="button" data-user="${u.id}">Editar cuenta</button>`:u.id===null?'Solo lectura':'Cuenta protegida'}</td></tr>`).join(''))}${pagination(r.total,r.limit)}</section>`;
}
function bindUsers(){
    $('newUser').addEventListener('click',()=>openUser());
    document.querySelectorAll('[data-user]').forEach(b=>b.addEventListener('click',()=>openUser(users.find(u=>u.id===Number(b.dataset.user)))));
    document.querySelectorAll('[data-user-detail]').forEach(b=>b.addEventListener('click',()=>run(()=>userDetail(b.dataset.userDetail),b)));
}
function openUser(user){
    const form=$('userForm');form.reset();$('userFormNotice').textContent='';
    for(const key of ['id','nombre','apellido','correo','cedula','telefono','ciudad','rol_id','estado']) if(user&&form.elements[key]) form.elements[key].value=user[key]??'';
    if(user&&!user.estado){form.elements.estado.value='INACTIVO';$('userFormNotice').textContent='Esta cuenta no tiene estado definido. Revisa su habilitación antes de guardar.';}
    $('initialPasswordLabel').hidden=Boolean(user);form.elements.password.required=!user;form.elements.password.disabled=Boolean(user);
    $('userDialogTitle').textContent=user?'Editar cuenta':'Crear usuario';$('userDialog').showModal();
}
const chat=createAdministrativeChat({api,mutate,client,notice,userId:()=>Number(getCurrentUser()?.id)});
function caseList(){return chat.shell();}
async function notifications(){
    const r=await api('/notificaciones?'+query());updateNotificationCount(r.sinLeer);
    return `<section class="ad-card"><h2>${r.sinLeer} notificaciones sin leer</h2><button type="button" id="readAllNotifications" ${r.sinLeer?'':'disabled'}>Marcar todas como leídas</button>${toolbar({states:['NO_LEIDA','LEIDA']})}${r.notificaciones.map(n=>`<article class="ad-notification"><div><strong>${esc(n.titulo)}</strong><small class="ad-muted"> · ${date(n.created_at)}</small><p>${n.caso_id?`<a data-notification-open="${n.id}" href="#solicitudes/${n.caso_id}">Abrir atención #${n.caso_id}</a>`:'Actividad general del panel'}</p>${badge(n.leida_at?'LEÍDA':'NO LEÍDA')}</div>${!n.leida_at?`<button type="button" data-read="${n.id}">Marcar leída</button>`:''}</article>`).join('')||'<p class="ad-empty">No hay notificaciones para esta consulta.</p>'}${pagination(r.total)}</section>`;
}
function reports(){return `<section class="ad-card"><h2>Informes administrativos</h2><p class="ad-muted">Máximo 1.000 registros por informe. Acota las fechas para exportaciones mayores. No incluyen contraseñas, documentos ni información clínica.</p><form id="reportForm" class="ad-toolbar"><label>Informe<select name="tipo">${[['usuarios','Directorio unificado'],['afiliados','Afiliados EPS'],['origenes','Resumen por origen'],['estados','Cuentas de acceso por estado'],['clientes','Cuentas de clientes'],['roles','Cuentas de acceso por rol'],['solicitudes','Solicitudes recibidas'],['atendidas','Solicitudes atendidas'],['tiempos','Tiempos de atención']].map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label><label>Buscar<input name="buscar" type="search" maxlength="120"></label>${dates()}<button type="submit" class="ad-primary">Consultar</button><button type="button" data-export="csv">Exportar CSV</button><button type="button" data-export="pdf">Exportar PDF</button></form><div id="reportResult"></div></section>`;}
async function getReport(format='json'){
    const form=$('reportForm');if(!form.reportValidity())return;const data=Object.fromEntries(new FormData(form));const type=data.tipo;delete data.tipo;data.formato=format;
    const path='/informes/'+type+'?'+new URLSearchParams(data);
    if(format==='json'){const {informe:r}=await api(path);const keys=r.columnas||Object.keys(r.filas[0]||{});$('reportResult').innerHTML=`<p>${r.filas.length} registros mostrados de ${esc(r.resumen?.registros??r.filas.length)}; total: ${esc(r.resumen?.total??r.filas.length)} · ${date(r.generadoEn)}${r.limitado?' · Límite alcanzado: acota las fechas.':''}</p>${r.resumen?.cuentas_acceso!==undefined?`<p>${r.resumen.cuentas_acceso} cuentas de acceso; ${r.resumen.afiliados_eps} afiliados EPS; ${r.resumen.coincidencias} coincidencias ya incluidas.</p>`:''}${r.aviso?`<p role="status">${esc(r.aviso)}</p>`:''}${table(keys,r.filas.map(row=>`<tr>${keys.map(k=>`<td>${esc(row[k])}</td>`).join('')}</tr>`).join(''))}`;return;}
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
    return `<div class="ad-columns"><section class="ad-card"><h2>Mi perfil administrativo</h2><form id="profileForm" class="ad-form">${['nombre','apellido','telefono','ciudad'].map(k=>`<label>${esc(k)}<input name="${k}" value="${esc(u[k]||'')}" maxlength="${k==='telefono'?20:100}" ${['nombre','apellido'].includes(k)?'required':''}></label>`).join('')}<p class="ad-wide ad-muted">Correo: ${esc(u.correo)} · Documento protegido: ${esc(u.cedula||'sin registrar')}</p><button type="submit" class="ad-primary">Guardar perfil</button></form></section><section class="ad-card"><h2>Seguridad</h2><form id="passwordForm" class="ad-form"><label class="ad-wide">Contraseña actual<input type="password" name="actual" autocomplete="current-password" required></label><label class="ad-wide">Nueva contraseña<input type="password" name="nueva" minlength="12" maxlength="72" autocomplete="new-password" required></label><p class="ad-wide ad-muted">El cambio cierra las sesiones administrativas anteriores. No modifica otras cuentas.</p><button type="submit" class="ad-primary">Cambiar contraseña</button></form></section><section class="ad-card"><h2>Preferencias</h2><form id="preferencesForm"><label class="ad-check"><input type="checkbox" name="notificaciones" ${p.notificaciones?'checked':''}>Recibir nuevas notificaciones</label><label class="ad-check"><input type="checkbox" name="compacto" ${p.compacto?'checked':''}>Vista compacta</label><p class="ad-muted">El historial existente se conserva.</p><button type="submit" class="ad-primary">Guardar preferencias</button></form></section><section class="ad-card"><h2>Parámetros del panel</h2><form id="generalForm" class="ad-form"><label class="ad-wide">Nombre del panel<input name="nombrePanel" value="${esc(general.nombrePanel)}" maxlength="80" required></label><label class="ad-wide">Mensaje de soporte<textarea name="mensajeSoporte" maxlength="500" required>${esc(general.mensajeSoporte)}</textarea></label><button type="submit" class="ad-primary">Guardar parámetros</button></form></section></div><section class="ad-card"><h2>Preguntas frecuentes de VITALIX</h2><p>Solo orientación administrativa. No introduzcas recomendaciones médicas ni secretos.</p><form id="faqForm"><div id="faqRows">${faq.map(f=>faqRow(f)).join('')}</div><div class="ad-actions"><button type="button" id="addFaq">Añadir pregunta</button><button type="submit" class="ad-primary">Guardar respuestas</button></div></form></section>`;
}
function faqRow(f={pregunta:'',respuesta:''}){return `<fieldset class="ad-faq"><label>Pregunta<input name="pregunta" required maxlength="160" value="${esc(f.pregunta)}"></label><label>Respuesta<textarea name="respuesta" required maxlength="1000">${esc(f.respuesta)}</textarea></label><button type="button" data-remove-faq>Retirar pregunta</button></fieldset>`;}
function bindConfig(){
    for(const [id,path,build] of [['profileForm','/perfil',f=>Object.fromEntries(new FormData(f))],['preferencesForm','/preferencias',f=>({notificaciones:f.elements.notificaciones.checked,compacto:f.elements.compacto.checked})],['generalForm','/configuracion/general',f=>({valor:Object.fromEntries(new FormData(f))})],['faqForm','/configuracion/faq',f=>({valor:[...f.querySelectorAll('fieldset')].map(row=>({pregunta:row.querySelector('[name=pregunta]').value,respuesta:row.querySelector('[name=respuesta]').value}))})]]){
        $(id).addEventListener('submit',e=>{e.preventDefault();const form=e.currentTarget;run(async()=>{const data=build(form);const result=await mutate(path,data,'PUT');if(id==='profileForm'){actualizarUsuarioSesion({...getCurrentUser(),...result.usuario});$('adminIdentity').textContent=result.usuario.nombre;}if(id==='preferencesForm')document.body.classList.toggle('compact',data.compacto);notice('Cambios guardados.');},form.querySelector('button[type=submit],button.ad-primary'));});
    }
    $('addFaq').addEventListener('click',()=>{if($('faqRows').children.length>=30)return notice('Máximo 30 preguntas.',true);$('faqRows').insertAdjacentHTML('beforeend',faqRow());});
    $('faqRows').addEventListener('click',e=>{if(e.target.closest('[data-remove-faq]'))e.target.closest('fieldset').remove();});
    $('passwordForm').addEventListener('submit',e=>{e.preventDefault();const form=e.currentTarget;run(async()=>{const result=await mutate('/password',Object.fromEntries(new FormData(form)));form.reset();alert(result.mensaje||'Contraseña actualizada. Inicia sesión de nuevo.');logout();},form.querySelector('button'));});
}
async function load(){
    const version=++loadVersion;loading=true;$('adminLoading').hidden=false;$('adminView').setAttribute('aria-busy','true');$('adminRefresh').disabled=true;
    try{
        const views={dashboard,usuarios:userList,solicitudes:caseList,notificaciones:notifications,informes:reports,configuracion:configuration};
        const html=await views[section]();if(version!==loadVersion)return;$('adminView').innerHTML=html;
        bindFilters();bindPagination();
        if(section==='usuarios')bindUsers();if(section==='solicitudes')await chat.mount({id:currentCase});else chat.unmount();
        if(section==='notificaciones')document.querySelectorAll('[data-notification-open]').forEach(a=>a.addEventListener('click',event=>{event.preventDefault();run(async()=>{await mutate(`/notificaciones/${a.dataset.notificationOpen}/leida`,{},'PATCH');await refreshNotificationCount();location.hash=a.getAttribute('href').slice(1);});}));
        if(section==='notificaciones')$('readAllNotifications').addEventListener('click',e=>run(async()=>{await mutate('/notificaciones/leidas',{},'PATCH');await load();notice('Notificaciones actualizadas.');},e.currentTarget));
        if(section==='notificaciones')document.querySelectorAll('[data-read]').forEach(b=>b.addEventListener('click',()=>run(async()=>{await mutate(`/notificaciones/${b.dataset.read}/leida`,{},'PATCH');await load();},b)));
        if(section==='informes'){$('reportForm').addEventListener('submit',e=>{e.preventDefault();run(()=>getReport());});document.querySelectorAll('[data-export]').forEach(b=>b.addEventListener('click',()=>run(()=>getReport(b.dataset.export),b)));}
        if(section==='configuracion')bindConfig();
    }catch(error){if(version!==loadVersion)return;$('adminView').innerHTML='<section class="ad-card"><h2>Información no disponible</h2><p>Los datos no se han cargado. Puedes volver a intentarlo con Actualizar.</p></section>';notice(error.message,true);}
    finally{if(version===loadVersion){loading=false;$('adminLoading').hidden=true;$('adminRefresh').disabled=false;$('adminView').setAttribute('aria-busy','false');}}
}
async function navigate(){let [target,id]=location.hash.slice(1).split('/');if(target==='mensajes')target='solicitudes';if(target==='pacientes')target='usuarios';const allowed=client?['solicitudes','notificaciones']:['dashboard','usuarios','solicitudes','notificaciones','informes','configuracion'];section=allowed.includes(target)?target:allowed[0];page=1;filters={};currentCase=id&&/^\d+$/.test(id)?Number(id):null;chat.unmount();$('caseDetail').hidden=true;$('sectionTitle').textContent=labels[section];document.querySelectorAll('[data-section]').forEach(a=>{if(a.dataset.section===section)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});notice();await load();}
async function start(){
    const status=document.createElement('p');status.id='adminLoading';status.setAttribute('role','status');status.textContent='Cargando datos...';status.hidden=true;$('adminView').before(status);
    if(!checkAuthGuard())return;const user=getCurrentUser();const expected=client?2:1;
    const actual=Number(user?.rol_id??user?.rol);
    if(actual!==expected){location.replace({1:'/pages/admin.html',2:'/pages/dashboard.html',3:'/pages/farmacia.html',4:'/pages/eps.html'}[actual]||'/login.html');return;}
    $('adminIdentity').textContent=user.nombre||role(expected);$('adminLogout').addEventListener('click',logout);
    $('adminRefresh').addEventListener('click',()=>run(async()=>{notice();if(section==='solicitudes')await chat.refresh();else await load();}));
    $('adminMenu').addEventListener('click',()=>{const open=$('adminSidebar').classList.toggle('open');$('adminMenu').setAttribute('aria-expanded',String(open));});
    $('cancelUser')?.addEventListener('click',()=>$('userDialog').close());
    $('userForm')?.addEventListener('submit',e=>{e.preventDefault();const form=e.currentTarget,button=form.querySelector('button[type=submit]');run(async()=>{const data=Object.fromEntries(new FormData(form)),id=data.id;delete data.id;data.rol_id=Number(data.rol_id);if(id){delete data.password;const old=users.find(u=>u.id===Number(id));if(old&&(data.rol_id!==old.rol_id||data.estado!==old.estado)&&!confirm('Confirmar cambio de rol o estado de la cuenta. Esta acci\u00f3n revoca sus sesiones administrativas.'))return;}try{await mutate('/usuarios'+(id?'/'+id:''),data,id?'PATCH':'POST');form.reset();$('userDialog').close();await load();notice('Cuenta guardada.');}catch(error){$('userFormNotice').textContent=error.message;}},button);});
    window.addEventListener('hashchange',navigate);await navigate();
    // Poll only counters: never replace an unsent reply or an edited form.
    const refreshCounts=refreshNotificationCount;
    document.addEventListener('administrative:read',refreshCounts);
    refreshCounts();const refreshVisible=()=>{refreshCounts();if(section==='solicitudes'&&!document.hidden){run(()=>chat.refresh());return;}if(document.hidden||loading||!['dashboard','notificaciones'].includes(section))return;const form=$('filterForm');if(form&&([...new FormData(form)].some(([k,v])=>v!==(filters[k]||''))||form.contains(document.activeElement)))return;run(load);};const timer=setInterval(refreshVisible,20000);
    const socket=await connectAdministrative(refreshVisible,value=>chat.connection(value));
    window.addEventListener('pagehide',()=>{clearInterval(timer);socket?.disconnect();document.removeEventListener('administrative:read',refreshCounts);},{once:true});
}
start();
