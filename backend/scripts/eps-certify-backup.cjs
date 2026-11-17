const fs = require("node:fs"),
  path = require("node:path"),
  { spawn } = require("node:child_process"),
  { Client } = require("pg");
const h = require("./enable-vitalix-visitors.cjs"),
  { hash } = require("./eps-apply-schema.cjs");
const fail = (code) => {
  throw Error(code);
};
function canonical(rows) {
  return h.canonicalConstraints(rows).map((c) => {
    const values =
      c.relname === "eps_autorizaciones" &&
      c.conname === "eps_authorization_state"
        ? ["PENDIENTE", "APROBADA", "RECHAZADA"]
        : c.relname === "eps_seguimientos" && c.conname === "eps_followup_state"
          ? ["ABIERTA", "EN_REVISION", "RESUELTA", "CERRADA"]
          : null;
    if (!values) return c;
    const a = `CHECK (estado::text = ANY (ARRAY[${values.map((v) => `'${v}'::character varying`).join(", ")}]::text[]))`,
      b = `CHECK (estado::text = ANY (ARRAY[${values.map((v) => `'${v}'::character varying::text`).join(", ")}]))`;
    return c.definition === a || c.definition === b
      ? { ...c, definition: a }
      : c;
  });
}
async function details(db) {
  return {
    columns: (
      await db.query(
        "SELECT table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default,character_maximum_length FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name COLLATE \"C\",ordinal_position",
      )
    ).rows,
    triggers: (
      await db.query(
        'SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=\'public\' AND NOT t.tgisinternal ORDER BY c.relname COLLATE "C",t.tgname COLLATE "C"',
      )
    ).rows,
    functions: (
      await db.query(
        "SELECT p.proname,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' ORDER BY p.proname COLLATE \"C\",pg_get_function_identity_arguments(p.oid) COLLATE \"C\"",
      )
    ).rows,
  };
}
async function verify(directory, name) {
  directory = fs.realpathSync(directory);
  const relative = path.relative(
    path.resolve(__dirname, "../database/backups"),
    directory,
  );
  if (
    !relative ||
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    !/^saludclick-eps-recovery-[a-f0-9]{12}$/.test(name)
  )
    fail("PRIVATE_DESTINATION_INVALID");
  const archive = path.join(directory, "primary-before-eps.backup"),
    file = path.join(directory, "verified-backup.json"),
    bytes = fs.readFileSync(archive);
  if (fs.existsSync(file) || bytes.subarray(0, 5).toString() !== "PGDMP")
    fail("ARCHIVE_INVALID_OR_ALREADY_VERIFIED");
  const run = (args, input) =>
    new Promise((resolve, reject) => {
      const p = spawn("docker", args, {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
      let out = "",
        err = "";
      p.stdout.on("data", (b) => (out += b));
      p.stderr.on("data", (b) => (err += b));
      p.on("error", reject);
      p.stdin.on("error", () => {});
      p.stdin.end(input);
      p.on("close", (code) => {
        if (err)
          fs.appendFileSync(
            path.join(directory, "verification.private.log"),
            err,
          );
        code ? reject(Error("DOCKER_FAILED")) : resolve(out.trim());
      });
    });
  let primary,
    restore,
    started = false;
  try {
    await run(["start", name]);
    started = true;
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try {
        await run([
          "exec",
          name,
          "pg_isready",
          "-h",
          "127.0.0.1",
          "-U",
          "eps_restore",
        ]);
        ready = true;
        break;
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!ready) fail("LOCAL_NOT_READY");
    const obj = JSON.parse(await run(["inspect", name]))[0],
      bindings = obj.NetworkSettings.Ports["5432/tcp"];
    if (
      bindings.length !== 1 ||
      bindings[0].HostIp !== "127.0.0.1" ||
      obj.Config.Image !== "postgres:18.7"
    )
      fail("LOCAL_IDENTITY_INVALID");
    const vars = Object.fromEntries(
      obj.Config.Env.map((v) => {
        let i = v.indexOf("=");
        return [v.slice(0, i), v.slice(i + 1)];
      }),
    );
    await run(["exec", name, "createdb", "-U", "eps_restore", "eps_certified"]);
    await run(
      [
        "exec",
        "-i",
        name,
        "pg_restore",
        "--exit-on-error",
        "--no-owner",
        "--no-privileges",
        "-U",
        "eps_restore",
        "-d",
        "eps_certified",
      ],
      bytes,
    );
    const url = h.config(h.env.DATABASE_URL);
    primary = new Client({
      connectionString: url.toString(),
      connectionTimeoutMillis: 15000,
    });
    restore = new Client({
      host: "127.0.0.1",
      port: Number(bindings[0].HostPort),
      user: "eps_restore",
      password: vars.POSTGRES_PASSWORD,
      database: "eps_certified",
    });
    await primary.connect();
    await restore.connect();
    await primary.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await restore.query("BEGIN READ ONLY");
    const identity = (
        await primary.query(
          "SELECT current_database() AS database,current_schema() AS schema",
        )
      ).rows[0],
      target = hash(
        url.hostname + "/" + identity.database + "/" + identity.schema,
      );
    if (
      target !==
      "7640c9f603b5eb8ae23dd8e47ef8c1057d2a570285547b07acd322e9163baa5d"
    )
      fail("TARGET_MISMATCH");
    const tables = await h.fingerprints(primary),
      relations = await h.structure(primary),
      recovered = await h.fingerprints(restore),
      restoredRelations = await h.structure(restore),
      extra = await details(primary),
      restoredExtra = await details(restore),
      sourceEPS = await h.epsFingerprint();
    if (
      JSON.stringify(tables) !== JSON.stringify(recovered) ||
      JSON.stringify({
        ...relations,
        constraints: canonical(relations.constraints),
      }) !==
        JSON.stringify({
          ...restoredRelations,
          constraints: canonical(restoredRelations.constraints),
        }) ||
      JSON.stringify(extra) !== JSON.stringify(restoredExtra)
    )
      fail("RESTORE_CONTENT_OR_SCHEMA_MISMATCH");
    for (const [table, constraint, field] of [
      ["eps_autorizaciones", "eps_authorization_state", "estado"],
      ["eps_seguimientos", "eps_followup_state", "estado"],
      ["administrative_cases", "administrative_cases_estado_check", "estado"],
      ["administrative_cases", "administrative_cases_tipo_check", "tipo"],
    ]) {
      const values = [
        "PENDIENTE",
        "APROBADA",
        "RECHAZADA",
        "ABIERTA",
        "EN_REVISION",
        "RESUELTA",
        "CERRADA",
        "EN_ATENCION",
        "SOLICITUD",
        "CONVERSACION",
        "INVALIDO",
        "",
        null,
        "aprobada",
        "APROBADA ",
      ];
      let results = [];
      for (const db of [primary, restore]) {
        const c = (
          await db.query(
            "SELECT pg_get_constraintdef(c.oid,true) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relname=$1 AND c.conname=$2",
            [table, constraint],
          )
        ).rows[0];
        if (!c) fail("CHECK_MISSING");
        results.push(
          (
            await db.query(
              `WITH candidate(${field}) AS (SELECT unnest($1::varchar[])) SELECT ${field},(${c.definition.slice(7, -1)}) AS accepted FROM candidate`,
              [values],
            )
          ).rows,
        );
      }
      if (JSON.stringify(results[0]) !== JSON.stringify(results[1]))
        fail("CHECK_SEMANTICS_MISMATCH");
    }
    const toc = await run(["exec", "-i", name, "pg_restore", "--list"], bytes);
    if (
      !toc.includes("TABLE DATA public usuarios") ||
      !toc.includes("FK CONSTRAINT")
    )
      fail("ARCHIVE_CATALOGUE_INCOMPLETE");
    await primary.query("ROLLBACK");
    await restore.query("ROLLBACK");
    await primary.query("BEGIN READ ONLY");
    const current = await h.fingerprints(primary);
    await primary.query("ROLLBACK");
    if (
      JSON.stringify(current) !== JSON.stringify(tables) ||
      JSON.stringify(sourceEPS) !== JSON.stringify(await h.epsFingerprint())
    )
      fail("SOURCE_CHANGED");
    await restore.end();
    restore = null;
    await run(["stop", name]);
    started = false;
    const migration = "20261115090000_eps_role_integration",
      manifest = {
        verified: true,
        verifiedAt: new Date().toISOString(),
        migration,
        sqlHash: hash(
          fs.readFileSync(
            path.resolve(
              __dirname,
              "../prisma/migrations",
              migration,
              "migration.sql",
            ),
          ),
        ),
        targetFingerprint: target,
        primaryHost: url.hostname,
        ...identity,
        archive,
        bytes: bytes.length,
        archiveSha256: hash(bytes),
        nativePostgreSQL: "18.7 Docker",
        localRestoreVerified: true,
        localRestoreStopped: true,
        backupPreservesOwnersAndPrivileges: true,
        restoreIgnoredOwnersAndPrivileges: true,
        tables,
        relations,
        details: extra,
        sourceEPS,
        primaryWrites: 0,
        container: name,
        checkSemanticsVerified: true,
        sqlAdapted: false,
      };
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
    console.log(
      JSON.stringify({
        status: "EPS_BACKUP_RECOVERABLE",
        manifestFile: file,
        bytes: bytes.length,
        sha256: manifest.archiveSha256,
        tables: Object.keys(tables).length,
        sourceAffiliates: sourceEPS.afiliados.count,
        sqlAdapted: false,
        primaryWrites: 0,
      }),
    );
  } finally {
    if (restore) await restore.end();
    if (primary) await primary.end();
    if (started) await run(["stop", name]);
  }
}
if (require.main === module)
  verify(process.argv[2], process.argv[3]).catch((e) => {
    console.error(
      JSON.stringify({
        status: "BACKUP_NOT_VERIFIED",
        code: /^[A-Z_]+$/.test(e.message) ? e.message : e.code || e.name,
      }),
    );
    process.exitCode = 1;
  });
module.exports = { canonical, details, verify };
