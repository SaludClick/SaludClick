import {useEffect,useRef,useState} from 'react';
import {connectAdministrative,newMessageKey,visitorSession} from '../../public/js/administrative-transport.js';

export function useAdministrativeConversation(visible=true){
    const [identity,setIdentity]=useState(null),[checking,setChecking]=useState(true);
    const [messages,setMessages]=useState([]),[conversation,setConversation]=useState(null),[error,setError]=useState('');
    const [sending,setSending]=useState(false),[connected,setConnected]=useState(false),[hasOlder,setHasOlder]=useState(false),[pendingContent,setPendingContent]=useState('');
    const context=useRef(null),visibleRef=useRef(visible);
    visibleRef.current=visible;
    useEffect(()=>{
        let active=true,read=()=>{};
        Promise.all([import('../../public/js/auth.js'),import('../../public/js/api.js')]).then(([auth,api])=>{
            read=()=>{
                if(!active)return;
                const user=auth.getCurrentUser(),token=auth.getToken(),role=Number(user?.rol_id??user?.rol);
                const visitor=!token,guest=visitor?visitorSession():null;
                const signature=`${user?.id||''}:${role}:${token||guest?.token||''}`;
                const guestApi={apiFetch:async(path,options={})=>{const response=await fetch(api.apiUrl(path),{...options,headers:{'Content-Type':'application/json',Authorization:'Vitalix '+guest.token}});const data=await response.json();if(!response.ok||data.ok===false)throw new Error(data.mensaje||'No fue posible contactar con Administracion.');return data;}};
                setIdentity(old=>old?.signature===signature?old:{signature,id:Number(user?.id),name:user?.nombre||'Cliente',enabled:visitor||(role===2&&!!token),visitor,visitorToken:guest?.token,auth,api:visitor?guestApi:api});setChecking(false);
            };
            read();for(const event of ['storage','focus','pageshow'])window.addEventListener(event,read);
        }).catch(()=>{if(active)setChecking(false);});
        return()=>{active=false;for(const event of ['storage','focus','pageshow'])window.removeEventListener(event,read);};
    },[]);
    useEffect(()=>{
        setMessages([]);setConversation(null);setError('');setConnected(false);setSending(false);setHasOlder(false);setPendingContent('');
        if(!identity?.enabled){context.current=null;return;}
        let active=true,socket,connecting=false;
        const key=`saludclick_admin_pending_v1:${identity.visitor?identity.visitorToken:identity.id}`;
        const ctx={identity,key,map:new Map(),caseId:null,pending:null,sending:false,syncing:false,resync:false,readMarker:'',initialized:false,older:false};
        context.current=ctx;
        try{const pending=JSON.parse(sessionStorage.getItem(key)||'null');if(pending&&typeof pending.content==='string'&&pending.content.length<=2000&&typeof pending.key==='string'){ctx.pending=pending;setPendingContent(pending.content);}}catch{/* A draft can still be retained in memory when storage is unavailable. */}
        const current=()=>active&&context.current===ctx;
        const paint=()=>{if(current())setMessages([...ctx.map.values()].sort((a,b)=>a.id-b.id));};
        ctx.sync=async()=>{
            if(!current())return;if(ctx.syncing){ctx.resync=true;return;}ctx.syncing=true;
            try{
                const data=await identity.api.apiFetch('/api/administrativo/'+(identity.visitor?'visitante/conversacion':ctx.caseId?'atenciones/'+ctx.caseId:'conversacion'));
                if(!current())return;
                if(data.caso){ctx.caseId=data.caso.id;setConversation(data.caso);if(identity.visitor&&!socket&&!connecting){connecting=true;connectAdministrative(()=>ctx.sync(),value=>{if(current())setConnected(value);},identity.visitorToken).then(value=>{connecting=false;if(!current())value?.disconnect();else socket=value;});}}
                for(const message of data.mensajes||[])ctx.map.set(message.id,message);
                if(!ctx.initialized){ctx.older=!!data.hayAnteriores;setHasOlder(ctx.older);ctx.initialized=true;}paint();
                if(!ctx.pending)setError('');
                const latest=Math.max(0,...ctx.map.keys()),marker=`${ctx.caseId}:${latest}`;
                if(ctx.caseId&&latest&&marker!==ctx.readMarker&&visibleRef.current&&!document.hidden){
                    ctx.readMarker=marker;
                    try{await Promise.resolve(identity.api.apiFetch(identity.visitor?'/api/administrativo/visitante/leido':`/api/administrativo/atenciones/${ctx.caseId}/leido`,{method:'POST',body:JSON.stringify({hasta:latest})}));}catch{ctx.readMarker='';}
                }
            }catch(e){if(current())setError(e.message);}
            finally{ctx.syncing=false;if(ctx.resync&&current()){ctx.resync=false;await ctx.sync();}}
        };
        ctx.send=async(content)=>{
            if(!current()||ctx.sending)return false;ctx.sending=true;setSending(true);setError('');
            const pending=ctx.pending?.content===content?ctx.pending:{key:newMessageKey(),content};ctx.pending=pending;setPendingContent(pending.content);
            try{sessionStorage.setItem(key,JSON.stringify(pending));}catch{/* The same request key remains available in memory. */}
            try{
                const data=await identity.api.apiFetch(identity.visitor?'/api/administrativo/visitante/mensajes':'/api/administrativo/vitalix/mensajes',{method:'POST',body:JSON.stringify({contenido:content,idempotency_key:pending.key})});
                if(!current())return false;
                ctx.caseId=data.caso.id;setConversation(data.caso);
                ctx.map.set(data.mensaje.id,{...data.mensaje,nombre:identity.visitor?'Visitante':identity.name,rol_id:identity.visitor?0:2});paint();
                ctx.pending=null;setPendingContent('');try{sessionStorage.removeItem(key);}catch{}
                await ctx.sync();return true;
            }catch(e){if(current())setError(e.message+' Tu mensaje se conserva; puedes reintentar.');return false;}
            finally{ctx.sending=false;if(current())setSending(false);}
        };
        ctx.loadOlder=async()=>{
            if(!ctx.caseId||!ctx.map.size||!current())return;
            try{
                const data=await identity.api.apiFetch(identity.visitor?`/api/administrativo/visitante/conversacion?antes=${Math.min(...ctx.map.keys())}`:`/api/administrativo/atenciones/${ctx.caseId}?antes=${Math.min(...ctx.map.keys())}`);
                if(!current())return;for(const m of data.mensajes)ctx.map.set(m.id,m);ctx.older=!!data.hayAnteriores;setHasOlder(ctx.older);paint();
            }catch(e){if(current())setError(e.message);}
        };
        ctx.sync();
        if(!identity.visitor)connectAdministrative(()=>ctx.sync(),value=>{if(current())setConnected(value);}).then(value=>{if(!current())value?.disconnect();else socket=value;});
        const timer=setInterval(()=>{if(!document.hidden)ctx.sync();},5000);
        const focus=()=>{if(!document.hidden)ctx.sync();};document.addEventListener('visibilitychange',focus);
        return()=>{active=false;clearInterval(timer);socket?.disconnect();document.removeEventListener('visibilitychange',focus);if(context.current===ctx)context.current=null;};
    },[identity]);
    useEffect(()=>{if(visible)context.current?.sync?.();},[visible]);
    return {eligible:!!identity?.enabled,enabled:!!identity?.enabled&&!!(conversation||pendingContent||sending),operational:context.current?.identity.signature===identity?.signature&&!!context.current?.send,checking,messages,conversation,error,sending,connected,hasOlder,pendingContent,userId:identity?.visitor?null:identity?.id,visitor:!!identity?.visitor,send:content=>context.current?.send(content)??Promise.resolve(false),sync:()=>context.current?.sync?.(),loadOlder:()=>context.current?.loadOlder?.()};
}
