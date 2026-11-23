const path = require("node:path");
const fs = require("node:fs/promises");

const publicExtensions = new Set([
    ".html", ".css", ".js", ".mjs", ".json", ".svg", ".png", ".jpeg", ".jpg",
    ".webp", ".gif", ".ico", ".avif", ".woff", ".woff2", ".ttf", ".txt", ".xml",
    ".webmanifest"
]);
const privateName = /^(?:private(?:[_-]uploads)?|backups?|respaldos?|auditor[ií]as?|credentials)(?:[._-]|$)|(?:^|[._-])(?:private|backup|respaldo|dump|credentials?|secret)(?:[._-]|$)/i;
const publicEntryPoints = new Set([
    "index.html", "login.html", "recuperar.html", "registro.html", "restablecer.html",
    "recaptcha-config.json"
]);
const assetDirectories = new Map([
    ["_astro", publicExtensions],
    ["css", new Set([".css"])],
    ["images", new Set([".svg", ".png", ".jpeg", ".jpg", ".webp", ".gif", ".ico", ".avif"])],
    ["js", new Set([".js", ".mjs"])],
    ["pages", new Set([".html"])]
]);

function isPublicPath(segments) {
    const extension = path.extname(segments.at(-1) || "").toLowerCase();
    const root = segments[0];
    const extensions = assetDirectories.get(root);
    const allowed = !root || (segments.length === 1 && publicEntryPoints.has(root)) ||
        (extensions && (!extension || extensions.has(extension)));
    return allowed &&
        segments.every(segment => !segment.startsWith(".") &&
            !/[\u0000-\u0020:%]|[. ]$/.test(segment) &&
            !/^(?:api|src|node_modules|tests?|config|package(?:-lock)?\.json|tsconfig\.json)$/i.test(segment) &&
            !privateName.test(segment));
}

async function resolvePublicFile(root, pathname) {
    const segments = pathname.split(/[/\\]/).filter(Boolean);
    if (!isPublicPath(segments)) return null;
    try {
        const directory = await fs.realpath(root);
        const expectedRoot = path.join(await fs.realpath(path.dirname(root)), path.basename(root));
        if (directory !== expectedRoot) return null;
        let target = path.resolve(directory, ...segments);
        if (await fs.realpath(target) !== target) return null;
        if ((await fs.stat(target)).isDirectory()) {
            if (segments.length && segments[0] !== "pages") return null;
            target = path.join(target, "index.html");
        }
        if (!publicExtensions.has(path.extname(target).toLowerCase())) return null;
        if (await fs.realpath(target) !== target || !(await fs.stat(target)).isFile()) return null;
        return target;
    } catch (error) {
        if (["ENOENT", "ENOTDIR", "EACCES", "EPERM", "ELOOP"].includes(error.code)) return null;
        throw error;
    }
}

module.exports = { resolvePublicFile };
