import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  LEGACY_MIGRATIONS,
  LEGACY_TABLES,
  inspectLegacyD1,
  isIgnoredD1SystemTable,
  planLegacySchemaAdoption,
} from "./legacy-schema-adoption.mjs";
import { planMigrationLedgerPrefix } from "./migration-ledger.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wranglerBin = resolve(projectRoot, "node_modules/wrangler/bin/wrangler.js");
const wranglerArgs = ["d1", "execute", "DB", "--local", "--config", "wrangler.local.jsonc"];
const availableMigrations = readdirSync(resolve(projectRoot, "drizzle"))
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort();

function runWrangler(args, captureOutput = false) {
  const result = spawnSync(process.execPath, [wranglerBin, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    env: { ...process.env, CI: "true" },
    stdio: captureOutput ? ["ignore", "pipe", "inherit"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error(`Wrangler command failed: ${args.join(" ")}`);
    process.exit(result.status ?? 1);
  }
  return result.stdout ?? "";
}

function queryRows(sql) {
  const output = runWrangler([...wranglerArgs, "--command", sql, "--json"], true);
  return JSON.parse(output)[0]?.results ?? [];
}

function localReadStatement(sql) {
  return { sql, all: async () => ({ results: queryRows(sql) }) };
}

const localReadDatabase = {
  prepare: (sql) => localReadStatement(sql),
  batch: async (statements) => statements.map((statement) => ({ results: queryRows(statement.sql) })),
};

function baselineLegacySchema(migrations) {
  const permitted = new Set(LEGACY_MIGRATIONS);
  for (const migration of migrations) {
    if (!permitted.has(migration) || !availableMigrations.includes(migration)) {
      throw new Error(`Refusing to baseline non-legacy migration: ${migration}`);
    }
  }
  if (migrations.length === 0) return;
  runWrangler([
    ...wranglerArgs,
    "--command",
    `CREATE TABLE IF NOT EXISTS d1_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`,
  ]);
  const values = migrations.map((name) => `('${name.replaceAll("'", "''")}')`).join(", ");
  runWrangler([
    ...wranglerArgs,
    "--command",
    `INSERT INTO d1_migrations (name) VALUES ${values} ON CONFLICT(name) DO NOTHING`,
  ]);
}

function applicationTableNames(snapshot) {
  return snapshot.tableRows
    .map((row) => String(row.name))
    .filter((name) => name !== "d1_migrations" && !isIgnoredD1SystemTable(name))
    .sort();
}

function sameNames(left, right) {
  return left.length === right.length && left.every((name, index) => name === right[index]);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

let snapshot = await inspectLegacyD1(localReadDatabase);
const applicationTables = applicationTableNames(snapshot);
const isFresh = applicationTables.length === 0;
const isExactLegacy = sameNames(applicationTables, LEGACY_TABLES);

if (isFresh || isExactLegacy) {
  const strictPlan = await planLegacySchemaAdoption(snapshot);
  if (strictPlan.state === "refused") {
    fail(`Local D1 strict legacy adoption refused: ${strictPlan.reason}`);
  }
  if (isFresh && strictPlan.state !== "fresh") {
    fail(`Local D1 empty-schema state is inconsistent: ${strictPlan.state}`);
  }
  if (isExactLegacy && strictPlan.state === "adoptable") {
    baselineLegacySchema(strictPlan.missingNames);
    snapshot = await inspectLegacyD1(localReadDatabase);
    const verified = await planLegacySchemaAdoption(snapshot);
    if (verified.state !== "already_baselined") {
      fail(`Local D1 legacy ledger verification failed: ${verified.state}`);
    }
  } else if (isExactLegacy && strictPlan.state !== "already_baselined") {
    fail(`Local D1 legacy state is inconsistent: ${strictPlan.state}`);
  }
} else {
  const hasLedger = snapshot.tableRows.some((row) => row.name === "d1_migrations");
  if (!hasLedger) {
    fail("Local D1 has a non-legacy schema without a migration ledger; refusing to guess.");
  }
  const appliedNames = [...snapshot.ledgerRows]
    .sort((left, right) => Number(left.id) - Number(right.id))
    .map((row) => String(row.name));
  const ledgerPlan = planMigrationLedgerPrefix(appliedNames, availableMigrations);
  if (!ledgerPlan.valid) {
    fail("Local D1 migration ledger is not an ordered prefix of the bundled migrations.");
  }
}

runWrangler([
  "d1",
  "migrations",
  "apply",
  "DB",
  "--local",
  "--config",
  "wrangler.local.jsonc",
]);

const after = await inspectLegacyD1(localReadDatabase);
const finalAppliedNames = [...after.ledgerRows]
  .sort((left, right) => Number(left.id) - Number(right.id))
  .map((row) => String(row.name));
const finalLedgerPlan = planMigrationLedgerPrefix(finalAppliedNames, availableMigrations);
if (!finalLedgerPlan.valid || finalLedgerPlan.missingNames.length > 0) {
  fail("Local D1 migration ledger did not converge to the complete bundled migration list.");
}
