const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { URL } = require("url");

const FRONTEND_ROOT = fs.realpathSync(path.resolve(__dirname, "../../frontend"));
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

const isInsideFrontend = candidate => {
    const relative = path.relative(FRONTEND_ROOT, candidate);
    return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
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

    let filePath = path.resolve(FRONTEND_ROOT, `.${decodedPath}`);
    if (!isInsideFrontend(filePath)) return sendJson(res, 403, { ok: false, mensaje: "Acceso denegado." });

    try {
        let info = await fs.promises.stat(filePath);
        if (info.isDirectory()) filePath = path.join(filePath, "index.html");
        filePath = await fs.promises.realpath(filePath);
        if (!isInsideFrontend(filePath)) return sendJson(res, 403, { ok: false, mensaje: "Acceso denegado." });
        info = await fs.promises.stat(filePath);
        if (!info.isFile()) return sendJson(res, 404, { ok: false, mensaje: "Archivo no encontrado." });

        res.writeHead(200, {
            "Content-Type": CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
            "Content-Length": info.size,
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "SAMEORIGIN",
            "Referrer-Policy": "strict-origin-when-cross-origin"
        });
        if (req.method === "HEAD") return res.end();
        fs.createReadStream(filePath).pipe(res);
    } catch {
        sendJson(res, 404, { ok: false, mensaje: "Archivo no encontrado." });
    }
};

const server = http.createServer((req, res) => {
    let url;
    try { url = new URL(req.url, "http://frontend.local"); }
    catch { return sendJson(res, 400, { ok: false, mensaje: "Solicitud invÃ¡lida." }); }

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return proxyApi(req, res);
    if (req.method !== "GET" && req.method !== "HEAD") {
        res.setHeader("Allow", "GET, HEAD");
        return sendJson(res, 405, { ok: false, mensaje: "MÃ©todo no permitido." });
    }
    return serveStatic(req, res, url.pathname);
});

server.listen(FRONTEND_PORT, process.env.FRONTEND_HOST || "127.0.0.1", () => {
    console.log(`Frontend disponible en http://${process.env.FRONTEND_HOST || "127.0.0.1"}:${FRONTEND_PORT}`);
});
