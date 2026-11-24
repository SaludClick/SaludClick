const tonos = new Map([
    ['CONVENIO ACTIVO', 'green'], ['ACTIVO', 'green'], ['ACTIVA', 'green'], ['VIGENTE', 'green'], ['ENTREGADA', 'green'],
    ['APROBADA', 'blue'], ['PREPARANDO', 'blue'], ['LISTA', 'blue'], ['NO LEÍDA', 'blue'],
    ['PENDIENTE', 'amber'], ['CANCELADA', 'red']
]);

export function insigniaEstado(texto) {
    const insignia = document.createElement('span');
    insignia.className = 'eps-badge';
    insignia.dataset.tone = tonos.get(String(texto).trim().toUpperCase()) ?? 'neutral';
    insignia.textContent = texto;
    return insignia;
}
