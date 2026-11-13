export function newMessageKey(){
    if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
    const bytes=globalThis.crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    const hex=[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
let socketLoader;
async function socketClient(origin){
    if(window.io)return window.io;
    if(!socketLoader)socketLoader=new Promise((resolve,reject)=>{
        const src=origin+'/socket.io/socket.io.js';
        let script=[...document.scripts].find(s=>s.src===src);const created=!script;
        script??=document.createElement('script');
        const timer=setTimeout(()=>finish(new Error('Tiempo real no disponible.')),8000);
        function finish(error){clearTimeout(timer);script.removeEventListener('load',loaded);script.removeEventListener('error',failed);if(error){if(created)script.remove();socketLoader=null;reject(error);}else resolve(window.io);}
        const loaded=()=>finish(window.io?null:new Error('Tiempo real no disponible.')),failed=()=>finish(new Error('Tiempo real no disponible.'));
        script.addEventListener('load',loaded,{once:true});script.addEventListener('error',failed,{once:true});
        if(created){script.src=src;script.async=true;document.head.append(script);}
    });
    return socketLoader;
}
let visitorMemory;
export function visitorSession(){
    const key='saludclick_vitalix_visitor_v1';
    let session=visitorMemory;try{session=JSON.parse(localStorage.getItem(key)||'null')||session;}catch{}
    if(!session||!/^[a-f0-9]{64}$/.test(session.token)||!Number.isFinite(session.expiresAt)||session.expiresAt<=Date.now()){
        session={token:[...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,'0')).join(''),expiresAt:Date.now()+30*86400000};
        try{localStorage.setItem(key,JSON.stringify(session));}catch{/* Memory still permits this page's conversation. */}
    }
    visitorMemory=session;return session;
}
export async function connectAdministrative(onUpdate,onStatus=()=>{},visitorToken=null){
    const [{apiUrl},auth]=await Promise.all([import('./api.js'),import('./auth.js')]);
    const origin=new URL(apiUrl('/api/administrativo'),location.href).origin;
    try{
        const io=await socketClient(origin);
        const socket=io(origin+'/administrativo',{auth:done=>done(visitorToken?{visitorToken}:{token:auth.getToken()}),reconnectionAttempts:6,reconnectionDelay:500,reconnectionDelayMax:5000});
        socket.on('administrativo:actualizado',onUpdate);
        socket.on('connect',()=>{onStatus(true);onUpdate({resync:true});});
        socket.on('disconnect',()=>onStatus(false));socket.on('connect_error',()=>onStatus(false));
        return socket;
    }catch{onStatus(false);return null;}
}
