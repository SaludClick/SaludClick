require("./support/isolate-database.cjs");

const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { spawnSync } = require("node:child_process");
const { resolvePublicFile } = require("../src/utils/public-assets");

test("HTTP rechaza archivos privados y rutas ambiguas en Express y el servidor auxiliar", async t => {
    const servers = [
        http.createServer(require("../src/app")),
        require("../scripts/frontend-server")
    ];
    for (const server of servers) {
        server.listen(0, "127.0.0.1");
        await once(server, "listening");
        t.after(() => new Promise(resolve => server.close(resolve)));
        const read = pathname => new Promise((resolve, reject) => {
            http.get({ host: "127.0.0.1", port: server.address().port, path: pathname }, response => {
                response.resume();
                resolve(response);
            }).on("error", reject);
        });
        const page = await read("/restablecer.html");
        assert.equal(page.statusCode, 200);
        assert.equal(page.headers["referrer-policy"], "no-referrer");
        assert.equal(page.headers["x-content-type-options"], "nosniff");
        assert.equal(page.headers["x-frame-options"], "SAMEORIGIN");
        assert.match(page.headers["content-security-policy"], /script-src-attr 'none'/);
        for (const pathname of [
            "/.env", "/.env.local", "/%2eenv", "/%252eenv", "/config/settings.json",
            "/src/config.json", "/package-lock.json", "/frontend/.env", "/_astro/app.js.map",
            "/%2e%2e%2f.env", "/%2e%2e%5c.env", "/private_uploads%5cfile.pdf",
            "/backups/file.json", "/%61pi/backup.json", "/backup.json::$DATA"
        ]) assert.equal((await read(pathname)).statusCode, 404, pathname);
        assert.equal((await read("/%ZZ")).statusCode, 400);
    }
    const expressServer = servers[0];
    const response = await fetch(`http://127.0.0.1:${expressServer.address().port}/api/health`, {
        headers: { Origin: "https://origin.example.test" }
    });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
});

test("el resolvedor rechaza enlaces a carpetas y archivos ajenos aunque existan", async t => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "saludclick-static-"));
    t.after(() => fs.rm(base, { recursive: true, force: true }));
    const root = path.join(base, "public");
    const privateDir = path.join(base, "restricted");
    await fs.mkdir(root);
    await fs.mkdir(privateDir);
    await fs.mkdir(path.join(root, "pages"));
    await fs.writeFile(path.join(root, "index.html"), "fixture");
    await fs.writeFile(path.join(root, "backup.json"), "{}");
    await fs.writeFile(path.join(root, "internal"), "fixture");
    await fs.writeFile(path.join(privateDir, "index.html"), "fixture");
    await fs.symlink(privateDir, path.join(root, "pages", "alias"), process.platform === "win32" ? "junction" : "dir");
    const aliasRoot = path.join(base, "dist");
    await fs.symlink(privateDir, aliasRoot, process.platform === "win32" ? "junction" : "dir");
    assert.equal(await resolvePublicFile(aliasRoot, "/index.html"), null);
    assert.equal(await resolvePublicFile(root, "/"), path.join(await fs.realpath(root), "index.html"));
    for (const pathname of ["/pages/alias", "/pages/alias/index.html", "/backup.json", "/internal"]) {
        assert.equal(await resolvePublicFile(root, pathname), null, pathname);
    }
});

test("la configuración PostgreSQL exige TLS remoto y redacta errores de arranque", () => {
    const config = require.resolve("../src/config/database");
    const run = (url, verify) => spawnSync(process.execPath, ["-e", verify, config], {
        encoding: "utf8",
        env: { ...process.env, DATABASE_URL: url, DOTENV_CONFIG_QUIET: "true" }
    });
    const marker = "fake-audit-database-password";
    const bad = run(`malformed-connection-${marker}`, "require(process.argv[1])");
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /DATABASE_URL no es una conexi/);
    assert.equal((bad.stdout + bad.stderr).includes(marker), false);
    const good = run(`postgresql://fixture:${marker}@db.example.test/db?sslmode=disable`, `
        const assert = require('node:assert/strict');
        const pool = require(process.argv[1]);
        assert.equal(new URL(pool.options.connectionString).searchParams.get('sslmode'), 'verify-full');
        assert.equal(new URL(process.env.DATABASE_URL).searchParams.get('sslmode'), 'disable');
    `);
    assert.equal(good.status, 0);
});
