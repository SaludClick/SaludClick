import {apiFetch} from './api.js';
import {logout} from './auth.js';
export function initFarmaciaPassword() {
    const form=document.getElementById('farmaciaPasswordForm'),status=document.getElementById('farmaciaPasswordStatus'),button=document.getElementById('farmaciaPasswordGuardar');
    const enabled=document.getElementById('farmaciaApp').dataset.operacion==='true';button.disabled=!enabled;
    if(enabled)status.textContent='Verifica tu contraseña actual para guardar una nueva.';
    let busy=false;
    form.addEventListener('submit',async e=>{
        e.preventDefault();if(busy||!enabled||!form.reportValidity())return;
        const actual=document.getElementById('farmaciaPasswordActual').value,nueva=document.getElementById('farmaciaPasswordNueva').value;
        if(nueva!==document.getElementById('farmaciaPasswordConfirmar').value){status.textContent='Las contraseñas nuevas no coinciden.';return;}
        busy=true;button.disabled=true;status.textContent='Actualizando contraseña…';
        try{await apiFetch('/api/farmacia/perfil/password',{method:'POST',body:JSON.stringify({actual,nueva})});form.reset();logout();}
        catch(error){status.textContent=error.message;status.setAttribute('role','alert');}finally{busy=false;button.disabled=false;}
    });
}
