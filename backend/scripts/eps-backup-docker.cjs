const fs = require("node:fs"),
  path = require("node:path"),
  { spawn } = require("node:child_process"),
  { randomBytes } = require("node:crypto"),
  { Client } = require("pg");
const {
  env,
  config,
  fingerprints,
  structure,
  epsFingerprint,
  equivalentStructure,
} = require("./enable-vitalix-visitors.cjs");
const { hash } = require("./eps-apply-schema.cjs");
const targetExpected =
  "7640c9f603b5eb8ae23dd8e47ef8c1057d2a570285547b07acd322e9163baa5d";
async function main(directory) {
  directory = fs.realpathSync(directory);
  const rel = path.relative(
    path.resolve(__dirname, "../database/backups"),
    directory,
  );
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel))
    throw Error("INVALID_PRIVATE_DIRECTORY");
  const archive = path.join(directory, "primary-before-eps.backup"),
    manifestFile = path.join(directory, "verified-backup.json");
  if (fs.existsSync(archive) || fs.existsSync(manifestFile))
    throw Error("BACKUP_EXISTS");
  const run = (args, { input, out, extra = {} } = {}) =>
    new Promise((resolve, reject) => {
      const p = spawn("docker", args, {
        windowsHide: true,
        env: { ...process.env, ...extra },
        stdio: ["pipe", out || "pipe", "pipe"],
      });
      let stdout = "",
        stderr = "";
      p.on("error", reject);
      if (!out) p.stdout.on("data", (b) => (stdout += b));
      p.stderr.on("data", (b) => (stderr += b));
      p.stdin.on("error", () => {});
      p.stdin.end(input);
      p.on("close", (c) => {
        if (stderr)
          fs.appendFileSync(path.join(directory, "docker.private.log"), stderr);
        c === 0
          ? resolve(stdout.trim())
          : reject(Error("DOCKER_COMMAND_FAILED"));
      });
    });
  const url = config(env.DATABASE_URL),
    primary = new Client({
      connectionString: url.toString(),
      connectionTimeoutMillis: 15000,
    });
  let restore,
    started = false;
  const container = "saludclick-eps-recovery-" + randomBytes(6).toString("hex"),
    password = randomBytes(32).toString("hex");
  try {
    await primary.connect();
    await primary.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const identity = (
      await primary.query(
        "SELECT current_database() AS database,current_schema() AS schema",
      )
    ).rows[0];
    const target = hash(
      url.hostname + "/" + identity.database + "/" + identity.schema,
    );
    if (target !== targetExpected) throw Error("TARGET_MISMATCH");
    const before = await fingerprints(primary),
      relations = await structure(primary),
      eps = await epsFingerprint(),
      snapshot = (
        await primary.query("SELECT pg_export_snapshot() AS snapshot")
      ).rows[0].snapshot;
    console.log(
      JSON.stringify({ stage: "dump-current-primary", primaryWrites: 0 }),
    );
    const fd = fs.openSync(archive, "wx", 0o600);
    const shell =
      'read -r PGHOST; read -r PGPORT; read -r PGDATABASE; read -r PGUSER; read -r PGPASSWORD; read -r SNAPSHOT; read -r PGCHANNELBINDING; cat > /tmp/roots.pem; export PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD PGCHANNELBINDING; export PGSSLMODE=verify-full PGSSLROOTCERT=/tmp/roots.pem; exec pg_dump --format=custom --snapshot="$SNAPSHOT"';
    try {
      await run(["run", "--rm", "-i", "postgres:18.7", "sh", "-c", shell], {
        input: [
          url.hostname,
          url.port || "5432",
          identity.database,
          decodeURIComponent(url.username),
          decodeURIComponent(url.password),
          snapshot,
          url.searchParams.get("channel_binding") || "prefer",
          require("node:tls").rootCertificates.join("\n"),
          "",
        ].join("\n"),
        out: fd,
      });
    } finally {
      fs.closeSync(fd);
    }
    await primary.query("ROLLBACK");
    const bytes = fs.readFileSync(archive);
    if (bytes.length < 1000 || bytes.subarray(0, 5).toString() !== "PGDMP")
      throw Error("INVALID_ARCHIVE");
    console.log(
      JSON.stringify({
        stage: "restore-isolated-postgres-18.7",
        bytes: bytes.length,
      }),
    );
    await run(
      [
        "run",
        "-d",
        "--name",
        container,
        "-p",
        "127.0.0.1::5432",
        "-e",
        "POSTGRES_PASSWORD",
        "-e",
        "POSTGRES_USER=eps_restore",
        "-e",
        "POSTGRES_DB=eps_recovery",
        "postgres:18.7",
      ],
      { extra: { POSTGRES_PASSWORD: password } },
    );
    started = true;
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try {
        await run([
          "exec",
          container,
          "pg_isready",
          "-h",
          "127.0.0.1",
          "-U",
          "eps_restore",
          "-d",
          "eps_recovery",
        ]);
        ready = true;
        break;
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!ready) throw Error("LOCAL_POSTGRES_NOT_READY");
    await run(
      [
        "exec",
        "-i",
        container,
        "pg_restore",
        "--exit-on-error",
        "--no-owner",
        "--no-privileges",
        "-U",
        "eps_restore",
        "-d",
        "eps_recovery",
      ],
      { input: bytes },
    );
    const binding = JSON.parse(
      await run([
        "inspect",
        "--format",
        "{{json .NetworkSettings.Ports}}",
        container,
      ]),
    )["5432/tcp"][0];
    if (binding.HostIp !== "127.0.0.1") throw Error("RESTORE_NOT_LOOPBACK");
    restore = new Client({
      host: "127.0.0.1",
      port: Number(binding.HostPort),
      user: "eps_restore",
      password,
      database: "eps_recovery",
    });
    await restore.connect();
    await restore.query("BEGIN READ ONLY");
    const recovered = await fingerprints(restore),
      recoveredStructure = await structure(restore);
    await restore.query("ROLLBACK");
    if (
      JSON.stringify(before) !== JSON.stringify(recovered) ||
      !equivalentStructure(relations, recoveredStructure)
    )
      throw Error("RESTORE_MISMATCH");
    await restore.end();
    restore = null;
    await primary.query("BEGIN READ ONLY");
    const current = await fingerprints(primary);
    await primary.query("ROLLBACK");
    if (
      JSON.stringify(before) !== JSON.stringify(current) ||
      JSON.stringify(eps) !== JSON.stringify(await epsFingerprint())
    )
      throw Error("DATA_CHANGED_DURING_BACKUP");
    await run(["stop", container]);
    started = false;
    const migration = "20261115090000_eps_role_integration",
      sqlHash = hash(
        fs.readFileSync(
          path.resolve(
            __dirname,
            "../prisma/migrations",
            migration,
            "migration.sql",
          ),
        ),
      );
    const manifest = {
      verified: true,
      verifiedAt: new Date().toISOString(),
      migration,
      sqlHash,
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
      tables: before,
      relations,
      sourceEPS: eps,
      primaryWrites: 0,
      container,
    };
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
    console.log(
      JSON.stringify({
        status: "EPS_BACKUP_RECOVERABLE",
        manifestFile,
        sha256: manifest.archiveSha256,
        tables: Object.keys(before).length,
        sourceAffiliates: eps.afiliados.count,
        primaryWrites: 0,
      }),
    );
  } finally {
    if (restore) await restore.end();
    await primary.end();
    if (started) await run(["stop", container]);
  }
}
if (require.main === module)
  main(process.argv[2]).catch((e) => {
    console.error(
      JSON.stringify({
        status: "BACKUP_NOT_VERIFIED",
        code: /^[A-Z_]+$/.test(e.message) ? e.message : e.code || e.name,
      }),
    );
    process.exitCode = 1;
  });
