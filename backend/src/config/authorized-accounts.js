// Operational allowlist, configured privately. No account is changed by reading it.
function obtenerCuentasAutorizadas(env = process.env) {
    const entries = [
        { key: 'AUTHORIZED_FARMACIA_EMAIL', rol_id: 3 },
        { key: 'AUTHORIZED_EPS_EMAIL', rol_id: 4 }
    ];
    const accounts = entries.map(({key,rol_id}) => {
        const correo = String(env[key] || '').trim().toLowerCase();
        if (!correo || correo.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(correo)) {
            throw Object.assign(new Error(`Configura ${key} con un correo válido en el entorno privado.`), { code:'AUTHORIZED_ACCOUNTS_NOT_CONFIGURED' });
        }
        return Object.freeze({correo,rol_id});
    });
    if (accounts[0].correo === accounts[1].correo) {
        throw Object.assign(new Error('Las cuentas autorizadas deben utilizar correos distintos.'), { code:'AUTHORIZED_ACCOUNTS_NOT_CONFIGURED' });
    }
    return Object.freeze(accounts);
}
module.exports = { obtenerCuentasAutorizadas };
