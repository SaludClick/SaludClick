function validarUrlActivacion(env = process.env) {
    const url = new URL(env.FRONTEND_URL);
    const local = env.NODE_ENV === 'development' && url.origin === 'http://localhost:4321';
    const privada = /^(localhost|127\.|\[::1\])/.test(url.hostname);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
        (!local && (url.protocol !== 'https:' || privada))) {
        throw new Error('Configura una URL HTTPS pública; localhost:4321 solo se permite en desarrollo.');
    }
    return url;
}
module.exports = { validarUrlActivacion };
