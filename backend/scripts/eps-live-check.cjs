// Read-only verification. Diagnostic JWTs remain in process memory, never printed.
const assert = require("node:assert/strict"),
  { Client } = require("pg"),
  jwt = require("jsonwebtoken");
const h = require("./enable-vitalix-visitors.cjs"),
  { hash } = require("./eps-apply-schema.cjs");
async function main() {
  const origin = "http://localhost:3000",
    db = new Client({
      connectionString: h.config(h.env.DATABASE_URL).toString(),
      connectionTimeoutMillis: 15000,
    }),
    source = new Client({
      connectionString: h.config(h.env.EPS_DATABASE_URL).toString(),
      connectionTimeoutMillis: 15000,
    });
  let browser;
  try {
    await db.connect();
    await source.connect();
    await db.query("BEGIN READ ONLY");
    await source.query("BEGIN READ ONLY");
    const before = await h.fingerprints(db),
      epsBefore = await h.epsFingerprint();
    const fields = require("../src/services/afiliados-import.service").CAMPOS,
      projection = fields
        .map((f) => '"' + f + '"::text AS "' + f + '"')
        .join(","),
      a = (
        await db.query(
          "SELECT " +
            projection +
            " FROM afiliados WHERE eps_id=$1 ORDER BY id",
          ["1"],
        )
      ).rows,
      b = (
        await source.query(
          "SELECT " +
            projection +
            " FROM afiliados WHERE eps_id::text=$1 ORDER BY id",
          ["1"],
        )
      ).rows;
    assert.equal(a.length, 50);
    assert.equal(hash(JSON.stringify(a)), hash(JSON.stringify(b)));
    const duplicates = (
      await db.query(
        "SELECT count(*)::int AS n FROM (SELECT documento FROM afiliados WHERE eps_id=$1 GROUP BY documento HAVING count(*)>1) d",
        ["1"],
      )
    ).rows[0].n;
    assert.equal(duplicates, 0);
    const access = (
      await db.query(
        "SELECT usuario_id,eps_id,activo FROM eps_accesos WHERE usuario_id=5",
      )
    ).rows;
    assert.deepEqual(access, [{ usuario_id: 5, eps_id: "1", activo: true }]);
    const accounts = (
        await db.query(
          "SELECT id,rol_id FROM usuarios WHERE estado='ACTIVO' ORDER BY id",
        )
      ).rows,
      eps = accounts.find((u) => u.id === 5);
    assert.equal(eps.rol_id, 4);
    const token = (u) =>
        jwt.sign({ id: u.id, rol: u.rol_id }, h.env.JWT_SECRET, {
          expiresIn: "10m",
        }),
      results = [];
    async function request(route, u, status = 200) {
      const response = await fetch(origin + "/api" + route, {
        headers: u ? { Authorization: "Bearer " + token(u) } : {},
      });
      const text = await response.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        throw Error("NON_JSON_" + response.status + "_" + route);
      }
      results.push({ route, role: u?.rol_id || 0, status: response.status });
      assert.equal(
        response.status,
        status,
        route + ": " + (body.codigo || body.mensaje || ""),
      );
      return body;
    }
    for (const route of [
      "/eps/verificar-acceso",
      "/eps/dashboard",
      "/eps/afiliados",
      "/eps/pacientes",
      "/eps/farmacias",
      "/eps/inventario",
      "/eps/autorizaciones",
      "/eps/solicitudes",
      "/eps/notificaciones",
      "/eps/perfil",
    ]) {
      const body = await request(route, eps);
      if (route === "/eps/dashboard")
        assert.equal(body.estadisticas.afiliados, 50);
      if (route === "/eps/afiliados") assert.equal(body.paginacion.total, 50);
    }
    await request("/eps/dashboard", null, 401);
    for (const u of accounts.filter((x) => x.rol_id !== 4)) {
      await request("/eps/dashboard", u, 403);
      if (u.rol_id === 1) {
        await request("/integracion/admin/eps", u);
        await request("/integracion/admin/eps/1/resumen", u);
        await request("/integracion/admin/eps/1/autorizaciones", u);
        await request("/integracion/paciente/afiliacion", u, 403);
      }
      if (u.rol_id === 2) {
        await request("/integracion/paciente/afiliacion", u);
        await request("/integracion/paciente/autorizaciones", u);
        await request("/integracion/paciente/solicitudes", u);
        await request("/integracion/admin/eps", u, 403);
      }
      if (u.rol_id === 3) {
        await request("/integracion/farmacia/autorizaciones", u);
        await request("/integracion/farmacia/convenios", u);
        await request("/integracion/farmacia/existencias", u);
        await request("/farmacia/pedidos", u);
      }
      await request("/integracion/notificaciones", u);
    }
    if (process.argv.includes("--browser")) {
      browser =
        await require("../tests/support/afiliados-edge.cjs").abrirEdge();
      const { send, evaluate, until } = browser;
      await send("Page.addScriptToEvaluateOnNewDocument", {
        source:
          'sessionStorage.setItem("saludclick_token",' +
          JSON.stringify(token(eps)) +
          ');sessionStorage.setItem("saludclick_user",JSON.stringify({id:5,rol:4,nombre:"EPS VidaPlena"}));',
      });
      await send("Page.navigate", { url: origin + "/pages/eps.html" });
      await until(() =>
        evaluate(
          'document.querySelector("#epsWorkspace")?.getAttribute("aria-busy")==="false"',
        ),
      );
      for (const view of [
        "dashboard",
        "afiliados",
        "pacientes",
        "farmacias",
        "inventario",
        "autorizaciones",
        "solicitudes",
        "notificaciones",
        "perfil",
      ]) {
        await evaluate(
          'document.querySelector("[data-eps-view=' + view + ']").click()',
        );
        await until(() =>
          evaluate(
            'document.querySelector("#epsWorkspace")?.getAttribute("aria-busy")==="false"',
          ),
        );
        assert.equal(
          await evaluate('document.querySelector("#epsMessage").textContent'),
          "",
        );
        assert.ok(
          await evaluate(
            'document.querySelector("#epsWorkspace").textContent.length>10',
          ),
        );
      }
      assert.deepEqual(browser.errores, []);
      await browser.cerrar();
      browser = null;
    }
    await db.query("ROLLBACK");
    await source.query("ROLLBACK");
    await db.query("BEGIN READ ONLY");
    const after = await h.fingerprints(db);
    await db.query("ROLLBACK");
    const changedTables = [
      ...new Set([...Object.keys(before), ...Object.keys(after)]),
    ].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
    if (changedTables.length)
      throw Object.assign(new Error("PRIMARY_CHANGED_DURING_CHECK"), {
        code: "PRIMARY_CHANGED_DURING_CHECK",
        changedTables,
      });
    assert.deepEqual(epsBefore, await h.epsFingerprint());
    console.log(
      JSON.stringify(
        {
          status: "LIVE_READ_ONLY_VERIFIED",
          importedAffiliates: a.length,
          exactSourceFields: fields.length,
          duplicates,
          sourceUnchanged: true,
          primaryUnchangedDuringTests: true,
          epsBrowser: process.argv.includes("--browser"),
          requests: results,
        },
        null,
        2,
      ),
    );
  } finally {
    if (browser) await browser.cerrar();
    await db.end();
    await source.end();
  }
}
if (require.main === module)
  main().catch((e) => {
    console.error(
      JSON.stringify({
        status: "LIVE_CHECK_FAILED",
        changedTables: e.changedTables,
        code: e.code || e.name,
        message: (e.message || "").slice(0, 250),
      }),
    );
    process.exitCode = 1;
  });
