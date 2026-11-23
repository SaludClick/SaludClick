export function rolSinChat() {
    if(typeof window==='undefined')return null;
    try{
        if(!sessionStorage.getItem('saludclick_token')&&!localStorage.getItem('saludclick_token'))return null;
        const user=JSON.parse(sessionStorage.getItem('saludclick_user')||localStorage.getItem('saludclick_user')||'null');
        const role=Number(user?.rol_id??user?.rol);return [3,4].includes(role)?role:null;
    }catch{return null;}
}
