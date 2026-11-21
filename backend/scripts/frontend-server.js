const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { URL } = require("url");
const { resolvePublicFile } = require("../src/utils/public-assets");
const securityHeaders = require("../src/config/security-headers");

const buildRoot = path.resolve(__dirname, "../../frontend/dist");
const FRONTEND_ROOT = fs.existsSync(buildRoot) ? buildRoot : path.resolve(__dirname, "../../frontend/public");
const BACKEND_URL = new URL(process.env.BACKEND_URL || "http://127.0.0.1:3000");
const FRONTEND_PORT = Number(process.env.FRONTEND_PORT || 8080);
const CONTENT_TYPES = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".ico": "image/x-icon"
};

const sendJson = (res, status, body) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
};

const proxyApi = (req, res) => {
    const transport = BACKEND_URL.protocol === "https:" ? https : http;
    const headers = { ...req.headers, host: BACKEND_URL.host };
    const proxyRequest = transport.request({
        protocol: BACKEND_URL.protocol,
        hostname: BACKEND_URL.hostname,
        port: BACKEND_URL.port || undefined,
        method: req.method,
        path: req.url,
        headers
    }, proxyResponse => {
        res.writeHead(proxyResponse.statusCode || 502, proxyResponse.statusMessage, proxyResponse.headers);
        proxyResponse.pipe(res);
    });

    proxyRequest.on("error", () => {
        if (!res.headersSent) sendJson(res, 502, { ok: false, mensaje: "No se pudo conectar con el backend." });
        else res.destroy();
    });
    req.pipe(proxyRequest);
};

const serveStatic = async (req, res, pathname) => {
    let decodedPath;
    try { decodedPath = decodeURIComponent(pathname); }
    catch { return sendJson(res, 400, { ok: false, mensaje: "Ruta invÃ¡lida." }); }

    try {
        const filePath = await resolvePublicFile(FRONTEND_ROOT, decodedPath);
        if (!filePath) return sendJson(res, 404, { ok: false, mensaje: "Archivo no encontrado." });
        const info = await fs.promises.stat(filePath);
        res.writeHead(200, {
            "Content-Type": CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
            "Content-Length": info.size,
            ...(path.basename(filePath) === "restablecer.html" ? { "Referrer-Policy": "no-referrer" } : {})
        });
        if (req.method === "HEAD") return res.end();
        const stream = fs.createReadStream(filePath);
        stream.on("error", () => res.destroy());
        stream.pipe(res);
    } catch {
        sendJson(res, 404, { ok: false, mensaje: "Archivo no encontrado." });
    }
};

const server = http.createServer((req, res) => securityHeaders(req, res, () => {
    let url;
    try { url = new URL(req.url, "http://frontend.local"); }
    catch { return sendJson(res, 400, { ok: false, mensaje: "Solicitud invÃ¡lida." }); }

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return proxyApi(req, res);
    if (req.method !== "GET" && req.method !== "HEAD") {
        res.setHeader("Allow", "GET, HEAD");
        return sendJson(res, 405, { ok: false, mensaje: "MÃ©todo no permitido." });
    }
    return serveStatic(req, res, url.pathname);
}));

if (require.main === module) server.listen(FRONTEND_PORT, process.env.FRONTEND_HOST || "127.0.0.1", () => {
    console.log(`Frontend disponible en http://${process.env.FRONTEND_HOST || "127.0.0.1"}:${FRONTEND_PORT}`);
});

module.exports = server;
