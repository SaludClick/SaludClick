import {checkAuthGuard,initAuth,getToken} from "./auth.js";
import {apiFetch} from "./api.js";
if(checkAuthGuard()) document.addEventListener("DOMContentLoaded",()=>{
 initAuth();
 const form=document.getElementById("formulaForm"), fileInput=document.getElementById("formulaArchivo"), msg=document.getElementById("formulaMensaje"), list=document.getElementById("listaFormulas");
 const fmt=n=>n<1024?`${n} B`:n<1024*1024?`${(n/1024).toFixed(0)} KB`:`${(n/1024/1024).toFixed(2)} MB`;
 async function cargar(){list.innerHTML="<p>Cargando...</p>";try{const {formulas,adjuntarASolicitud}=await apiFetch("/api/formulas");if(!formulas.length){list.innerHTML="<div class='empty-state'><i class='fa-solid fa-file-circle-plus'></i><h3>Aún no tienes fórmulas</h3><p>Carga tu primera fórmula médica para verla aquí.</p></div>";return;}list.innerHTML="";formulas.forEach(f=>{const el=document.createElement("article");el.className="formula-card";el.innerHTML=`<div class="formula-icon"><i class="fa-solid ${f.tipo_mime==="application/pdf"?"fa-file-pdf":"fa-file-image"}"></i></div><div><h3>${escapeHtml(f.nombre)}</h3><p>${escapeHtml(f.descripcion||"Sin descripción")}</p><small>${fmt(Number(f.tamano))} · ${new Date(f.created_at).toLocaleDateString("es-CO")}</small></div><div class="formula-actions"><span class="status-badge" data-state="${escapeHtml(f.estado)}">${escapeHtml(f.estado)}</span><button type="button" class="btn-primary" data-id="${f.id}"><i class="fa-solid fa-eye"></i> Ver</button></div>`;el.querySelector("button").addEventListener("click", async () => {
        const token = getToken();
        if (!checkAuthGuard() || !Number.isSafeInteger(Number(f.id)) || Number(f.id) < 1) return;
        const preview = window.open("about:blank", "_blank");
        if (!preview) {
            msg.textContent = "El navegador bloqueó la ventana. Permite ventanas emergentes.";
            return;
        }
        preview.opener = null;
        try {
            const blob = await apiFetch(`/api/formulas/${Number(f.id)}`, {}, "blob");
            if (getToken() !== token || preview.closed) {
                preview.close();
                return;
            }
            const url = URL.createObjectURL(blob);
            preview.location.replace(url);
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (error) {
            preview.close();
            msg.textContent = error.message;
        }
    });
if (adjuntarASolicitud !== true) { list.append(el); return; }
const share=document.createElement('form');share.className='formula-share';
const label=document.createElement('label');label.textContent='Vincular a mi solicitud: ';const number=document.createElement('input');number.type='number';number.min='1';number.max='2147483647';number.required=true;number.placeholder='Número de solicitud';number.setAttribute('aria-label','Número de solicitud para vincular la fórmula');label.append(number);
const consent=document.createElement('button');consent.type='submit';consent.textContent='Autorizar consulta a la farmacia asignada';
const allow=document.createElement('input');allow.type='checkbox';const allowLabel=document.createElement('label');allowLabel.append(allow,document.createTextNode(' Permitir descarga a la farmacia asignada'));
const status=document.createElement('p');status.setAttribute('role','status');share.append(label,allowLabel,consent,status);
share.addEventListener('submit',async event=>{event.preventDefault();if(consent.disabled||!share.reportValidity())return;consent.disabled=true;try{await apiFetch(`/api/formulas/${Number(f.id)}/solicitud/${Number(number.value)}`,{method:'POST',body:JSON.stringify({permiteDescarga:allow.checked})});status.textContent='Fórmula vinculada a tu solicitud. Esto no aprueba ni modifica la prescripción.';}catch(error){status.textContent=error.message;}finally{consent.disabled=false;}});
el.append(share);list.append(el);});}catch(e){list.innerHTML=`<p class="error-text">${escapeHtml(e.message)}</p>`;}}
 function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}

 const upload = form.querySelector('button[type="submit"]');
 const allowed = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
 const zone = document.getElementById("formulaZona");
 const summary = document.getElementById("formulaSeleccion");
 const fileDetails = document.getElementById("formulaDatosArchivo");
 const remove = document.getElementById("formulaRetirar");
 let uploading = false;
 const validFile = file => file?.size > 0 && file.size <= 5 * 1024 * 1024 && allowed.has(file.type);
 function showFile() {
    const file = fileInput.files[0];
    const valid = validFile(file);
    summary.hidden = !valid;
    fileDetails.textContent = valid ? `${file.name} · ${fmt(file.size)}` : "";
    if (file && !valid) fileInput.value = "";
    msg.textContent = file && !valid ? "Elige un PDF, JPG, PNG o WEBP con contenido de máximo 5 MB." : "";
    msg.dataset.state = file && !valid ? "error" : "";
 }
 fileInput.addEventListener("change", showFile);
 zone.addEventListener("dragover", event => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = uploading ? "none" : "copy";
    zone.classList.toggle("dragging", !uploading);
 });
 zone.addEventListener("dragleave", () => zone.classList.remove("dragging"));
 zone.addEventListener("drop", event => {
    event.preventDefault();
    zone.classList.remove("dragging");
    if (uploading || !event.dataTransfer.files.length) return;
    if (event.dataTransfer.files.length !== 1) {
        msg.textContent = "Selecciona un archivo por fórmula.";
        msg.dataset.state = "error";
        return;
    }
    fileInput.files = event.dataTransfer.files;
    showFile();
 });
 remove.addEventListener("click", () => {
    fileInput.value = "";
    showFile();
    fileInput.focus();
 });
 form.addEventListener("submit", async event => {
    event.preventDefault();
    if (uploading || !checkAuthGuard()) return;
    const file = fileInput.files[0];
    const nombre = document.getElementById("formulaNombre").value.trim();
    const descripcion = document.getElementById("formulaDescripcion").value.trim();
    if (!nombre || !file?.size) {
        msg.textContent = "Ingresa un nombre y selecciona un archivo con contenido.";
        return;
    }
    if (!validFile(file)) {
        msg.textContent = "Elige un PDF, JPEG, PNG o WEBP de máximo 5 MB.";
        return;
    }
    const token = getToken();
    upload.disabled = uploading = true;
    fileInput.disabled = remove.disabled = true;
    form.setAttribute("aria-busy", "true");
    msg.dataset.state = "loading";
    msg.textContent = "Cargando fórmula…";
    try {
        const archivo = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reader.onabort = () => reject(new Error("No se pudo leer el archivo seleccionado."));
            reader.readAsDataURL(file);
        });
        if (getToken() !== token) return;
        const result = await apiFetch("/api/formulas", { method: "POST", body: JSON.stringify({ nombre, descripcion, archivo }) });
        if (getToken() !== token) return;
        form.reset();
        showFile();
        msg.dataset.state = "success";
        msg.textContent = result.mensaje;
        await cargar();
    } catch (error) {
        msg.dataset.state = "error";
        msg.textContent = error.message;
    } finally {
        upload.disabled = uploading = false;
        fileInput.disabled = remove.disabled = false;
        form.setAttribute("aria-busy", "false");
    }
 });
 document.getElementById("recargarFormulas").addEventListener("click",cargar);cargar();
});
