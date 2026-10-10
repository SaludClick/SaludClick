import { checkAuthGuard, initAuth, getCurrentUser, setSession, getToken } from './auth.js';
import { apiFetch } from './api.js';

if (checkAuthGuard()) document.addEventListener('DOMContentLoaded', async () => {
    initAuth();
    const form=document.querySelector('form'), mensaje=document.getElementById('mensajePerfil');
    const nombre=document.getElementById('nombre'), email=document.getElementById('email'), tipo=document.getElementById('tipoDocumento'), documento=document.getElementById('numeroDocumento'), telefono=document.getElementById('telefono'), ciudad=document.getElementById('ciudad');
    function pintar(u){ nombre.value=`${u.nombre||''} ${u.apellido||''}`.trim(); email.value=u.correo||''; tipo.value=u.tipo_documento||u.tipoDocumento||''; documento.value=u.numeroDocumento||''; telefono.value=u.telefono||''; ciudad.value=u.ciudad||''; }
    try { const r=await apiFetch('/api/auth/profile'); pintar(r.usuario); } catch(e){ mensaje.textContent=e.message; pintar(getCurrentUser()||{}); }
    form.addEventListener('submit',async e=>{e.preventDefault(); if(!form.reportValidity())return; const parts=nombre.value.trim().split(/\s+/); const first=parts.shift(); const last=parts.join(' ')||first; try { const r=await apiFetch('/api/auth/profile',{method:'PUT',body:JSON.stringify({nombre:first,apellido:last,telefono:telefono.value,tipoDocumento:tipo.value,ciudad:ciudad.value})}); mensaje.textContent=r.mensaje; pintar(r.usuario); const old=getCurrentUser()||{}; setSession(getToken(),{...old,nombre:r.usuario.nombre,apellido:r.usuario.apellido,correo:r.usuario.correo}); }catch(err){mensaje.textContent=err.message;} });
    document.getElementById('cancelarPerfil').addEventListener('click',async()=>{try{pintar((await apiFetch('/api/auth/profile')).usuario);mensaje.textContent='Cambios descartados.';}catch(e){mensaje.textContent=e.message;}});
});
