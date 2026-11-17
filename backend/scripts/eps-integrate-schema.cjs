// Applies only the reviewed additive four-role EPS integration; never migrate deploy.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { Client } = require("pg");
const { env, config } = require("./enable-vitalix-visitors.cjs"),
  { hash, matchRecoverySnapshot } = require("./eps-apply-schema.cjs");
const name = "20261115090000_eps_role_integration",
  checksum = "99b5dca81847e36f95f4f0d1372dd4598705abb5eb98f408ead9d7637212076e",
  targetExpected =
    "7640c9f603b5eb8ae23dd8e47ef8c1057d2a570285547b07acd322e9163baa5d";
const fail = (code) => {
  throw Object.assign(Error(code), { code });
};
function evidence(file) {
  if (!file) fail("VERIFIED_BACKUP_REQUIRED");
  const actual = fs.realpathSync(file),
    rel = path.relative(path.resolve(__dirname, "../database/backups"), actual);
  if (rel.startsWith("..") || path.isAbsolute(rel))
    fail("PRIVATE_BACKUP_REQUIRED");
  const e = JSON.parse(fs.readFileSync(actual, "utf8")),
    archive = fs.realpathSync(e.archive),
    ar = path.relative(path.dirname(actual), archive);
  if (
    ar.startsWith("..") ||
    path.isAbsolute(ar) ||
    !e.verified ||
    !e.localRestoreVerified ||
    !e.localRestoreStopped ||
    !e.checkSemanticsVerified ||
    e.migration !== name ||
    e.sqlHash !== checksum ||
    e.targetFingerprint !== targetExpected
  )
    fail("BACKUP_NOT_CERTIFIED");
  const bytes = fs.readFileSync(archive);
  if (
    bytes.length !== e.bytes ||
    bytes.subarray(0, 5).toString() !== "PGDMP" ||
    hash(bytes) !== e.archiveSha256
  )
    fail("ARCHIVE_CHANGED");
  return e;
}
async function main() {
  const args = Object.fromEntries(
      process.argv
        .slice(2)
        .filter((a) => a.includes("="))
        .map((a) => {
          const i = a.indexOf("=");
          return [a.slice(2, i), a.slice(i + 1)];
        }),
    ),
    apply = process.argv.includes("--apply"),
    url = config(env.DATABASE_URL),
    db = new Client({
      connectionString: url.toString(),
      connectionTimeoutMillis: 15000,
    });
  const sql = fs.readFileSync(
    path.resolve(__dirname, "../prisma/migrations", name, "migration.sql"),
    "utf8",
  );
  if (
    hash(sql) !== checksum ||
    !/^BEGIN;/.test(sql) ||
    !/COMMIT;\s*$/.test(sql) ||
    /\b(DROP|TRUNCATE|DELETE\s+FROM|ALTER\s+ROLE|CREATE\s+ROLE)\b/i.test(sql)
  )
    fail("SQL_REVIEW_REQUIRED");
  try {
    await db.connect();
    await db.query(apply ? "BEGIN" : "BEGIN READ ONLY");
    await db.query("SET LOCAL lock_timeout='5s'");
    await db.query("SET LOCAL statement_timeout='30s'");
    const identity = (
        await db.query(
          "SELECT current_database() AS database,current_schema() AS schema",
        )
      ).rows[0],
      target = hash(
        url.hostname + "/" + identity.database + "/" + identity.schema,
      );
    if (target !== targetExpected) fail("TARGET_MISMATCH");
    const history = (
      await db.query(
        "SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY migration_name",
      )
    ).rows;
    for (const m of history) {
      if (!m.finished_at || m.rolled_back_at)
        fail("MIGRATION_HISTORY_REVIEW_REQUIRED");
      const file = path.resolve(
        __dirname,
        "../prisma/migrations",
        m.migration_name,
        "migration.sql",
      );
      if (!fs.existsSync(file)) fail("UNKNOWN_MIGRATION");
      const bytes = fs.readFileSync(file);
      if (
        hash(bytes) !== m.checksum &&
        hash(bytes.toString().replace(/\r\n/g, "\n")) !== m.checksum
      )
        fail("MIGRATION_SQL_CHANGED");
    }
    const applied = history.some((m) => m.migration_name === name);
    if (applied) {
      await db.query("ROLLBACK");
      console.log(JSON.stringify({ alreadyApplied: true, migration: name }));
      return;
    }
    if (
      !history.some(
        (m) => m.migration_name === "20261114090000_eps_workspace",
      ) ||
      history.length !== 12
    )
      fail("MIGRATION_PREREQUISITES_CHANGED");
    const partial = (
      await db.query(
        "SELECT to_regclass('public.eps_notificaciones_compartidas') AS notifications,EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='eps_autorizaciones' AND column_name='farmacia_vinculo_id') AS assignment",
      )
    ).rows[0];
    if (partial.notifications || partial.assignment)
      fail("PARTIAL_SCHEMA_REVIEW_REQUIRED");
    if (!apply) {
      await db.query("ROLLBACK");
      console.log(
        JSON.stringify({
          mode: "READ_ONLY_PLAN",
          migration: name,
          checksum,
          targetFingerprint: target,
          previousMigrations: history.length,
          sqlAdditive: true,
        }),
      );
      return;
    }
    if (args["confirm-hash"] !== checksum || args.target !== targetExpected)
      fail("EXPLICIT_CONFIRMATION_REQUIRED");
    const backup = evidence(args["backup-manifest"]);
    await db.query(
      "SELECT pg_advisory_xact_lock(hashtext('saludclick_eps_role_integration'))",
    );
    await matchRecoverySnapshot(db, backup);
    await db.query(sql.replace(/^BEGIN;\s*/, "").replace(/\s*COMMIT;\s*$/, ""));
    await db.query(
      "INSERT INTO _prisma_migrations(id,checksum,finished_at,migration_name,started_at,applied_steps_count) VALUES($1,$2,clock_timestamp(),$3,clock_timestamp(),1)",
      [crypto.randomUUID(), checksum, name],
    );
    await db.query("COMMIT");
    console.log(
      JSON.stringify({
        applied: true,
        migration: name,
        checksum,
        targetFingerprint: target,
        existingRowsRewritten: 0,
      }),
    );
  } catch (e) {
    await db.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await db.end();
  }
}
if (require.main === module)
  main().catch((e) => {
    console.error(
      JSON.stringify({
        status: "INTEGRATION_NOT_APPLIED",
        code: e.code || e.name,
      }),
    );
    process.exitCode = 1;
  });
module.exports = { evidence };
