import {apiUrl} from './api.js';
import {getToken,logout} from './auth.js';
export async function descargarProtegido(path,filename,{mostrar=false}={}) {
    const preview = mostrar ? window.open('about:blank', '_blank') : null;
    if (mostrar && !preview) throw new Error('Permite abrir pestañas para ver la fórmula.');
    if (preview) preview.opener = null;
    try {
        const response = await fetch(apiUrl(path), { headers: { Authorization: `Bearer ${getToken()}` }, cache: 'no-store' });
        if (response.status === 401) { logout(); throw new Error('Inicia sesión nuevamente.'); }
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.mensaje || 'No se pudo consultar el archivo.');
        }
        const type = (response.headers.get('Content-Type') || '').split(';')[0].toLowerCase();
        if (path.split('?')[0].endsWith('.xlsx') && !type.includes('spreadsheetml.sheet')) throw new Error('La respuesta no contiene un archivo Excel válido.');
        if (preview && !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(type)) throw new Error('El formato del archivo no permite vista previa.');
        const blob = await response.blob();
        if (!blob.size) throw new Error('El archivo recibido está vacío.');
        if (preview?.closed) return;
        const url = URL.createObjectURL(blob);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        if (preview) {
            preview.location.replace(url);
        } else {
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.append(link);
            link.click();
            link.remove();
        }
    } catch (error) {
        preview?.close();
        throw error;
    }
}
