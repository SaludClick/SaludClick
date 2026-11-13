import {newMessageKey} from './administrative-transport.js';
// The administrative inbox uses the existing cases/messages storage exclusively.
export function createAdministrativeChat({api,mutate,client,notice,userId}){
    const $=id=>document.getElementById(id);
    const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const date=value=>value?new Date(value).toLocaleString('es-CO',{dateStyle:'medium',timeStyle:'short'}):'';
    const stateNames={ABIERTA:'Pendiente',EN_ATENCION:'En atención',RESUELTA:'Atendida',CERRADA:'Cerrada'};
    const drafts=new Map(),messages=new Map(),requests=new Map();
    let generation=0,selected=null,detailVersion=0,listVersion=0,items=[],page=1,total=0,filters={},refreshing=false,refreshAgain=false,sending=false,administrators=[],reading=false,hasOlder=false,readMarker='';
    const active=()=>!!$('administrativeChat');
    const closed=c=>['RESUELTA','CERRADA'].includes(c?.estado);
    function saveDraft(){if(selected&&$('chatReply'))drafts.set(selected.id,$('chatReply').value);}
    function shell(){return `<section id="administrativeChat" class="ac-workspace" aria-label="Chat administrativo">
      <aside class="ac-inbox" aria-label="Conversaciones de clientes">
        <div class="ac-inbox-heading"><div><h2>${client?'Tu atención administrativa':'Conversaciones'}</h2><p>Atención humana · SaludClick</p></div><span class="ac-live" id="chatConnection">Conectando…</span></div>
        <form id="chatFilters" class="ac-filters"><label>Buscar conversación<input type="search" name="buscar" maxlength="120" placeholder="${client?'Buscar en conversaciones':'Cliente o mensaje inicial'}"></label><label>Bandeja<select name="bandeja"><option value="">Todas</option><option value="PENDIENTES">Pendientes</option><option value="ATENDIDAS">Atendidas</option></select></label><button type="submit">Buscar</button></form>
        <p id="chatListStatus" role="status" class="ac-status"></p><div id="chatInbox" class="ac-conversations"></div>
        <div class="ac-pagination"><button id="chatPrevious" type="button" aria-label="Conversaciones anteriores">‹</button><span id="chatPage"></span><button id="chatNext" type="button" aria-label="Conversaciones siguientes">›</button></div>
      </aside>
      <section id="chatThread" class="ac-thread" aria-label="Conversación seleccionada"><div class="ac-placeholder"><span aria-hidden="true">◌</span><h2>Conversemos</h2><p>${client?'Abre tu conversación con Administración.':'Selecciona un cliente para consultar y responder su conversación.'}</p></div></section>
    </section>`;}
    function unmount(){saveDraft();generation++;detailVersion++;listVersion++;selected=null;messages.clear();refreshing=false;readMarker='';}
    async function task(fn,button){if(button)button.disabled=true;try{await fn();}catch(error){notice(error.message,true);}finally{if(button?.isConnected)button.disabled=false;}}
    async function mount({id}={}){
      unmount();const current=generation;page=1;filters={};items=[];
      $('chatFilters').addEventListener('submit',event=>{event.preventDefault();filters=Object.fromEntries(new FormData(event.currentTarget));page=1;task(()=>loadInbox());});
      $('chatInbox').addEventListener('click',event=>{const button=event.target.closest('[data-chat]');if(button)task(()=>select(Number(button.dataset.chat)));});
      $('chatPrevious').addEventListener('click',()=>{if(page>1){page--;task(()=>loadInbox());}});
      $('chatNext').addEventListener('click',()=>{if(page*20<total){page++;task(()=>loadInbox());}});
      $('chatConnection').textContent=connectionLabel;
      await loadInbox();if(current!==generation)return;
      if(client&&!items.length&&!id){const r=await mutate('/conversacion',{});if(current!==generation)return;await loadInbox();id=r.caso.id;}
      if(current!==generation)return;
      if(id||items.length)await select(Number(id||items[0].id));
    }
    function paintInbox(){
      if(!active())return;
      $('chatInbox').innerHTML=items.map(c=>`<button type="button" class="ac-conversation ${selected?.id===c.id?'is-selected':''}" data-chat="${c.id}" ${selected?.id===c.id?'aria-current="true"':''}>
        <span class="ac-avatar" aria-hidden="true">${esc((c.cliente_nombre||'C').slice(0,1))}</span><span class="ac-preview"><span class="ac-person">${client?'Administración':`${esc(c.cliente_nombre)} ${esc(c.cliente_apellido)}`}</span><span class="ac-excerpt">${esc(c.ultimo_mensaje||'Conversación iniciada desde atención humana')}</span><span class="ac-case-state">${stateNames[c.estado]||esc(c.estado)}</span></span><span class="ac-meta"><time>${date(c.updated_at)}</time>${c.pendientes?`<span class="ac-unread" aria-label="${Number(c.pendientes)} mensajes nuevos">${Number(c.pendientes)}</span>`:''}</span></button>`).join('')||'<p class="ac-empty">No hay conversaciones en esta bandeja.</p>';
      $('chatPage').textContent=`${total} conversaciones · ${page}`;
      $('chatPrevious').disabled=page<=1;$('chatNext').disabled=page*20>=total;
    }
    async function loadInbox(){
      const current=generation,version=++listVersion;
      if(!active())return;
      $('chatListStatus').textContent='Actualizando conversaciones…';
      try{
        const r=await api('/atenciones?'+new URLSearchParams({...filters,page,limit:20}));
        if(current!==generation||version!==listVersion||!active())return;
        items=r.casos;total=r.total;paintInbox();$('chatListStatus').textContent='';
      }catch(error){if(current===generation&&active())$('chatListStatus').textContent='No se pudo actualizar la bandeja.';throw error;}
    }
    async function select(id){
      if(selected?.id===id&&$('chatReply')){$('administrativeChat').classList.add('ac-has-selection');return refresh();}
      saveDraft();const current=generation,version=++detailVersion;
      const r=await api('/atenciones/'+id);
      if(!client&&!administrators.length)administrators=(await api('/responsables')).administradores;
      if(current!==generation||version!==detailVersion||!active())return;
      selected=r.caso;hasOlder=r.hayAnteriores;messages.clear();for(const m of r.mensajes)messages.set(m.id,m);
      $('administrativeChat').classList.add('ac-has-selection');
      $('chatThread').innerHTML=`<header class="ac-thread-header"><button id="chatBack" type="button" class="ac-back" aria-label="Volver a conversaciones">‹</button><span class="ac-avatar" aria-hidden="true">${client?'A':esc((selected.cliente_nombre||'C').slice(0,1))}</span><div class="ac-thread-identity"><h2 id="chatTitle"></h2><p id="chatState"></p></div><button id="chatClose" type="button"></button></header>
        ${!client?`<div class="ac-management"><label>Responsable<select id="chatResponsible"><option value="">Sin asignar</option>${administrators.map(a=>`<option value="${a.id}">${esc(a.nombre)} ${esc(a.apellido)}</option>`).join('')}</select></label><button type="button" id="chatAssign">Asignar</button><button type="button" id="chatResolve">Marcar atendida</button></div>`:''}
        <div class="ac-history-tools"><button type="button" id="chatOlder">Ver mensajes anteriores</button><span id="chatThreadStatus" role="status"></span></div>
        <div id="chatLog" class="ac-log" role="log" aria-label="Mensajes administrativos en orden cronológico" aria-live="polite"></div>
        <form id="chatComposer" class="ac-composer"><label for="chatReply">Mensaje para ${client?'Administración':'el cliente'}</label><div><textarea id="chatReply" name="contenido" maxlength="2000" required rows="2" placeholder="Escribe un mensaje administrativo…"></textarea><button type="submit" id="chatSend" class="ad-primary">Enviar <span aria-hidden="true">↗</span></button></div><small id="chatComposerHint">No compartas contraseñas ni información clínica.</small></form>`;
      $('chatReply').value=drafts.get(id)||'';
      $('chatBack').addEventListener('click',()=>{$('administrativeChat').classList.remove('ac-has-selection');});
      $('chatClose').addEventListener('click',event=>task(()=>changeState(closed(selected)?'reopen':'close'),event.currentTarget));
      $('chatResolve')?.addEventListener('click',event=>task(()=>changeState('resolve'),event.currentTarget));
      $('chatAssign')?.addEventListener('click',event=>task(async()=>{const value=$('chatResponsible').value;await mutate('/atenciones/'+selected.id,{responsable_id:value?Number(value):null},'PATCH');await refresh();},event.currentTarget));
      $('chatOlder').addEventListener('click',event=>task(loadOlder,event.currentTarget));
      $('chatComposer').addEventListener('submit',send);
      $('chatReply').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();if($('chatReply').value.trim()&&!sending)$('chatComposer').requestSubmit();}});
      paintThread(r,true);paintInbox();await markVisibleRead();
    }
    function paintThread(r,initial=false){
      selected=r.caso;
      $('chatTitle').textContent=client?'Administración SaludClick':`${selected.cliente_nombre} ${selected.cliente_apellido}`;
      $('chatState').textContent=`${stateNames[selected.estado]} · Inicio ${date(selected.created_at)}`;
      const isClosed=closed(selected);
      $('chatClose').textContent=isClosed?'Reabrir conversación':'Cerrar conversación';
      $('chatClose').hidden=client&&!isClosed;
      if($('chatResponsible')&&document.activeElement!==$('chatResponsible'))$('chatResponsible').value=selected.responsable_id??'';
      if($('chatResolve'))$('chatResolve').disabled=isClosed;
      $('chatReply').disabled=isClosed;$('chatSend').disabled=isClosed||sending;
      $('chatComposerHint').textContent=isClosed?'La conversación está cerrada. Puedes reabrirla para continuar.':'Enter para enviar · Mayús+Enter para una nueva línea. No compartas datos clínicos.';
      $('chatOlder').hidden=!hasOlder;
      paintMessages(initial);
    }
    function paintMessages(forceBottom=false){
      const log=$('chatLog');if(!log)return;
      const nearBottom=log.scrollHeight-log.scrollTop-log.clientHeight<90;
      const ordered=[...messages.values()].sort((a,b)=>a.id-b.id);
      // Do not replace an unchanged log: keep its scroll position and selection.
      const signature=ordered.map(m=>`${m.id}:${Number(m.remitente_id)===userId()&&m.leido_at?'read':''}`).join('|');
      if(log.dataset.signature!==signature){
        log.innerHTML=ordered.map(m=>`<article class="ac-message ${Number(m.remitente_id)===userId()?'ac-mine':'ac-theirs'}" data-message="${m.id}"><strong>${esc(m.nombre)} · ${Number(m.rol_id)===1?'Administrador':'Cliente'}</strong><p>${esc(m.contenido)}</p><footer><time datetime="${esc(m.created_at)}">${date(m.created_at)}</time>${Number(m.remitente_id)===userId()?`<span>${m.leido_at?'Leído':'Enviado'}</span>`:''}</footer></article>`).join('')||'<p class="ac-empty">Tu conversación está abierta. Escribe el primer mensaje para comenzar.</p>';
        log.dataset.signature=signature;
      }
      if(forceBottom||nearBottom)log.scrollTop=log.scrollHeight;
    }
    async function markVisibleRead(){
      if(reading||document.hidden||!selected||!active())return;
      const incoming=[...messages.values()].filter(m=>Number(m.remitente_id)!==userId()&&!m.leido_at);
      const latest=Math.max(0,...messages.keys()),marker=`${selected.id}:${latest}`;
      if(!latest||readMarker===marker)return;readMarker=marker;
      const id=selected.id,current=generation;reading=true;
      try{
        await mutate(`/atenciones/${id}/leido`,{hasta:latest});
        document.dispatchEvent(new Event('administrative:read'));
        if(current!==generation||selected?.id!==id)return;
        for(const m of incoming)m.leido_at=new Date().toISOString();
        const row=items.find(c=>c.id===id);if(row){row.pendientes=0;paintInbox();}
      }catch(error){readMarker='';throw error;}finally{reading=false;}
    }
    async function refresh(){
      if(!active())return;if(refreshing){refreshAgain=true;return;}
      const current=generation,id=selected?.id,version=detailVersion;refreshing=true;
      try{
        await loadInbox();if(current!==generation||!active())return;
        if(!id){if(items.length)await select(items[0].id);return;}
        const r=await api('/atenciones/'+id);
        if(current!==generation||version!==detailVersion||selected?.id!==id||!active())return;
        for(const m of r.mensajes)messages.set(m.id,m);
        paintThread(r);await markVisibleRead();
      }finally{if(current===generation){refreshing=false;if(refreshAgain){refreshAgain=false;await refresh();}}}
    }
    async function loadOlder(){
      if(!selected||!messages.size)return;
      const current=generation,id=selected.id,oldest=Math.min(...messages.keys());
      const log=$('chatLog'),height=log.scrollHeight,top=log.scrollTop;
      const r=await api(`/atenciones/${id}?antes=${oldest}`);
      if(current!==generation||selected?.id!==id||!active())return;
      for(const m of r.mensajes)messages.set(m.id,m);paintMessages();
      log.scrollTop=top+log.scrollHeight-height;hasOlder=r.hayAnteriores;$('chatOlder').hidden=!hasOlder;
    }
    async function send(event){
      event.preventDefault();if(sending||!selected||closed(selected))return;
      const textarea=$('chatReply'),content=textarea.value.trim();if(!content)return;
      const id=selected.id,current=generation;drafts.set(id,textarea.value);sending=true;$('chatSend').disabled=true;
      const request=requests.get(id)?.content===content?requests.get(id):{content,key:newMessageKey()};requests.set(id,request);
      try{
        await mutate(`/atenciones/${id}/mensajes`,{contenido:content,idempotency_key:request.key});requests.delete(id);
        if(drafts.get(id)?.trim()===content)drafts.delete(id);
        if(current!==generation||selected?.id!==id)return;
        // Preserve anything typed while the submitted message was in flight.
        if(textarea.value.trim()===content)textarea.value='';
        await refresh();paintMessages(true);$('chatThreadStatus').textContent='Mensaje enviado.';
      }catch(error){if(current===generation&&selected?.id===id)$('chatThreadStatus').textContent='No se pudo enviar. Tu mensaje se conserva.';notice(error.message,true);}
      finally{sending=false;if(active()&&$('chatSend'))$('chatSend').disabled=closed(selected);}
    }
    async function changeState(action){
      if(!selected)return;const id=selected.id;
      if(action==='reopen')await mutate(`/atenciones/${id}/reabrir`,{});
      else{
        // Keep the existing validated progression for administrative resolution.
        if(action==='resolve'&&selected.estado==='ABIERTA')await mutate('/atenciones/'+id,{estado:'EN_ATENCION'},'PATCH');
        await mutate('/atenciones/'+id,{estado:action==='close'?'CERRADA':'RESUELTA'},'PATCH');
      }
      await refresh();
    }
    let connectionLabel='Actualización periódica';
    function connection(connected){connectionLabel=connected?'En tiempo real':'Actualización periódica';if($('chatConnection'))$('chatConnection').textContent=connectionLabel;}
    return {shell,mount,unmount,select,refresh,connection,get selectedId(){return selected?.id;}};
}
