export const LEGACY_MIGRATIONS = Object.freeze([
  "0000_silly_thanos.sql",
  "0001_catalog_meta.sql",
  "0002_model_usage_guards.sql",
  "0003_resume_target_briefs.sql",
  "0004_complete_auth.sql",
]);

export const LEGACY_TABLES = Object.freeze([
  "advice_usage_events",
  "audit_events",
  "auth_accounts",
  "auth_rate_limits",
  "auth_sessions",
  "auth_verifications",
  "catalog_meta",
  "guest_session_usage_events",
  "guest_sessions",
  "model_consent_events",
  "model_provider_state",
  "model_request_leases",
  "model_session_leases",
  "model_usage_events",
  "resume_target_briefs",
  "resume_versions",
  "resumes",
  "suggestion_events",
  "target_profiles",
  "templates",
  "users",
]);

export const EXPECTED_LEGACY_FINGERPRINTS = Object.freeze({
  columns: "fdf171af155990ca2178fff0b46f4e72306d1f9c9f47e05827265ea0643b8de5",
  indexes: "b612ff2118b5586ee0506f9604b20760896911e7fd8fb1e72db7ced23ed3a1d2",
  foreignKeys: "f57b6e2123ec650aa432dd8b8cb564b89b494f1c8719a1109981f383014285eb",
});

export const EXPECTED_LEGACY_COUNTS = Object.freeze({
  columns: 149,
  indexes: 26,
  foreignKeys: 10,
});

export const EXPECTED_LEDGER_COLUMN_FINGERPRINT =
  "ddbacdd46f77ba1d675e0e09d0a205a7b953c569922e7547894966c4d071c25a";

export const CREATE_MIGRATION_LEDGER_SQL = `CREATE TABLE IF NOT EXISTS d1_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
)`;

// Cloudflare owns this table. Keep this a closed allowlist: an unexpected
// `_cf_*` table must not silently become part of an adoptable application DB.
export const D1_SYSTEM_TABLES = Object.freeze(["_cf_METADATA"]);

export function isIgnoredD1SystemTable(name) {
  const value = String(name);
  return value.startsWith("sqlite_") || D1_SYSTEM_TABLES.includes(value);
}

function normalizeDefault(value) {
  if (value === null || value === undefined) return "∅";
  let normalized = String(value).trim();
  while (normalized.startsWith("(") && normalized.endsWith(")")) {
    normalized = normalized.slice(1, -1).trim();
  }
  if (/^true$/i.test(normalized)) return "1";
  if (/^false$/i.test(normalized)) return "0";
  return normalized;
}

function normalizedColumnLine(row) {
  const tableName = String(row.table_name);
  const columnName = String(row.name);
  const primaryKey = Number(row.pk) > 0 ? 1 : 0;
  const notNull = primaryKey
    ? "1"
    : tableName === "users" && columnName === "updated_at"
      ? "*"
      : String(Number(row.notnull));
  return [
    tableName,
    columnName,
    String(row.type ?? "").toUpperCase(),
    notNull,
    normalizeDefault(row.dflt_value),
    String(primaryKey),
  ].join("|");
}

function normalizedIndexLines(rows) {
  const grouped = new Map();
  for (const row of rows) {
    if (String(row.origin) === "pk") continue;
    const key = `${row.table_name}|${row.index_name}`;
    const entry = grouped.get(key) ?? {
      tableName: String(row.table_name),
      unique: Number(row.unique),
      partial: Number(row.partial),
      columns: [],
    };
    entry.columns.push([Number(row.seqno), String(row.column_name)]);
    grouped.set(key, entry);
  }
  const logicalIndexes = new Set();
  for (const index of grouped.values()) {
    const columns = index.columns
      .sort((left, right) => left[0] - right[0])
      .map((entry) => entry[1])
      .join(",");
    logicalIndexes.add(
      `${index.tableName}|${index.unique}|${index.partial}|${columns}`,
    );
  }
  return [...logicalIndexes].sort();
}

function normalizedForeignKeyLine(row) {
  return [
    row.table_name,
    row.from,
    row.to_table ?? row.table,
    row.to,
    row.on_update,
    row.on_delete,
    row.match,
  ].map(String).join("|");
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function fingerprint(lines) {
  const uniqueLines = [...new Set(lines)].sort();
  return {
    count: uniqueLines.length,
    sha256: await sha256(uniqueLines.join("\n")),
  };
}

function isSameStringArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function refusal(reason, details = {}) {
  return { state: "refused", reason, ...details };
}

/**
 * Plans a metadata-only adoption. It never emits a plan unless the old schema
 * is logically identical to the post-0004 schema and the ledger is absent or
 * contains a valid migration-name prefix.
 */
export async function planLegacySchemaAdoption(snapshot) {
  const tableNames = [...new Set(snapshot.tableRows.map((row) => String(row.name)))]
    .filter((name) => !isIgnoredD1SystemTable(name))
    .sort();
  const hasLedger = tableNames.includes("d1_migrations");
  const applicationTables = tableNames.filter((name) => name !== "d1_migrations");

  if (hasLedger) {
    const ledgerColumns = snapshot.columnRows
      .filter((row) => row.table_name === "d1_migrations")
      .map(normalizedColumnLine);
    const ledgerFingerprint = await fingerprint(ledgerColumns);
    if (
      ledgerFingerprint.count !== 3
      || ledgerFingerprint.sha256 !== EXPECTED_LEDGER_COLUMN_FINGERPRINT
    ) {
      return refusal("invalid_migration_ledger_schema", { ledgerFingerprint });
    }
    const ledgerIndexes = normalizedIndexLines(
      snapshot.indexRows.filter((row) => row.table_name === "d1_migrations"),
    );
    if (
      ledgerIndexes.length !== 1
      || ledgerIndexes[0] !== "d1_migrations|1|0|name"
    ) {
      return refusal("invalid_migration_ledger_unique_index");
    }
  }

  const appliedRows = [...snapshot.ledgerRows].sort((left, right) => Number(left.id) - Number(right.id));
  const appliedNames = appliedRows.map((row) => String(row.name));
  const prefix = LEGACY_MIGRATIONS.slice(0, appliedNames.length);
  const validPrefix = appliedNames.length <= LEGACY_MIGRATIONS.length
    && isSameStringArray(appliedNames, prefix)
    && appliedRows.every((row) => typeof row.applied_at === "string" && row.applied_at.length > 0);
  if (!validPrefix) {
    return refusal("migration_ledger_is_not_a_valid_legacy_prefix", { appliedNames });
  }

  if (applicationTables.length === 0) {
    if (appliedNames.length > 0) {
      return refusal("migration_ledger_has_entries_but_database_is_empty", { appliedNames });
    }
    return { state: "fresh", appliedNames, missingNames: [] };
  }

  if (!isSameStringArray(applicationTables, LEGACY_TABLES)) {
    return refusal("unexpected_or_partial_application_tables", { applicationTables });
  }

  const legacyTableSet = new Set(LEGACY_TABLES);
  const columnFingerprint = await fingerprint(
    snapshot.columnRows
      .filter((row) => legacyTableSet.has(String(row.table_name)))
      .map(normalizedColumnLine),
  );
  const indexLines = normalizedIndexLines(
    snapshot.indexRows.filter((row) => legacyTableSet.has(String(row.table_name))),
  );
  const indexFingerprint = await fingerprint(indexLines);
  const foreignKeyFingerprint = await fingerprint(
    snapshot.foreignKeyRows
      .filter((row) => legacyTableSet.has(String(row.table_name)))
      .map(normalizedForeignKeyLine),
  );
  const fingerprints = {
    columns: columnFingerprint,
    indexes: indexFingerprint,
    foreignKeys: foreignKeyFingerprint,
  };

  if (
    columnFingerprint.count !== EXPECTED_LEGACY_COUNTS.columns
    || columnFingerprint.sha256 !== EXPECTED_LEGACY_FINGERPRINTS.columns
    || indexFingerprint.count !== EXPECTED_LEGACY_COUNTS.indexes
    || indexFingerprint.sha256 !== EXPECTED_LEGACY_FINGERPRINTS.indexes
    || foreignKeyFingerprint.count !== EXPECTED_LEGACY_COUNTS.foreignKeys
    || foreignKeyFingerprint.sha256 !== EXPECTED_LEGACY_FINGERPRINTS.foreignKeys
  ) {
    return refusal("legacy_schema_fingerprint_mismatch", { fingerprints });
  }

  if (Number(snapshot.invalidUpdatedAtCount) !== 0) {
    return refusal("users_updated_at_backfill_incomplete", {
      invalidUpdatedAtCount: Number(snapshot.invalidUpdatedAtCount),
    });
  }
  if (Number(snapshot.foreignKeyViolationCount) !== 0) {
    return refusal("foreign_key_check_failed", {
      foreignKeyViolationCount: Number(snapshot.foreignKeyViolationCount),
    });
  }

  const missingNames = LEGACY_MIGRATIONS.slice(appliedNames.length);
  return {
    state: missingNames.length > 0 ? "adoptable" : "already_baselined",
    appliedNames,
    missingNames,
    fingerprints,
  };
}

export function buildLedgerInsertSql(migrationCount) {
  if (!Number.isSafeInteger(migrationCount) || migrationCount < 1) {
    throw new Error("migrationCount must be a positive integer");
  }
  return `INSERT INTO d1_migrations (name) VALUES ${Array.from(
    { length: migrationCount },
    () => "(?)",
  ).join(", ")} ON CONFLICT(name) DO NOTHING`;
}

const TABLES_SQL = `SELECT name FROM sqlite_schema
  WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`;

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const INSPECTION_TABLES = [...LEGACY_TABLES, "d1_migrations"];

const COLUMN_SELECTS = INSPECTION_TABLES.map((tableName) => `SELECT
    ${sqlLiteral(tableName)} AS table_name, c.cid, c.name, c.type,
    c."notnull" AS "notnull", c.dflt_value, c.pk
  FROM pragma_table_info(${sqlLiteral(tableName)}) AS c`);

const INDEX_LIST_SELECTS = INSPECTION_TABLES.map((tableName) => `SELECT
    ${sqlLiteral(tableName)} AS table_name, il.name AS index_name,
    il."unique" AS "unique", il.origin, il.partial
  FROM pragma_index_list(${sqlLiteral(tableName)}) AS il`);

const FOREIGN_KEY_SELECTS = INSPECTION_TABLES.map((tableName) => `SELECT
    ${sqlLiteral(tableName)} AS table_name,
    fk."table" AS to_table, fk."from" AS "from", fk."to" AS "to",
    fk.on_update, fk.on_delete, fk.match
  FROM pragma_foreign_key_list(${sqlLiteral(tableName)}) AS fk`);

// D1 caps compound SELECT terms below stock SQLite's default. Five terms is
// accepted by both remote D1 and Wrangler local and stays under 50 queries.
const MAX_COMPOUND_SELECT_TERMS = 5;

function chunkedUnionQueries(selects) {
  const queries = [];
  for (let index = 0; index < selects.length; index += MAX_COMPOUND_SELECT_TERMS) {
    queries.push(selects.slice(index, index + MAX_COMPOUND_SELECT_TERMS).join(" UNION ALL "));
  }
  return queries;
}

function buildIndexDetailQueries(indexRows) {
  const selects = indexRows.map((row) => `SELECT
      ${sqlLiteral(row.table_name)} AS table_name,
      ${sqlLiteral(row.index_name)} AS index_name,
      ${Number(row.unique)} AS "unique",
      ${sqlLiteral(row.origin)} AS origin,
      ${Number(row.partial)} AS partial,
      ii.seqno, ii.name AS column_name
    FROM pragma_index_info(${sqlLiteral(row.index_name)}) AS ii`);
  return chunkedUnionQueries(selects);
}

function resultsOf(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

export async function inspectLegacyD1(db) {
  const tablesResult = await db.prepare(TABLES_SQL).all();
  const tableRows = resultsOf(tablesResult);
  const tableNames = new Set(tableRows.map((row) => String(row.name)));
  const columnQueries = chunkedUnionQueries(COLUMN_SELECTS);
  const indexListQueries = chunkedUnionQueries(INDEX_LIST_SELECTS);
  const foreignKeyQueries = chunkedUnionQueries(FOREIGN_KEY_SELECTS);
  const baseStatements = [
    ...columnQueries.map((sql) => db.prepare(sql)),
    ...indexListQueries.map((sql) => db.prepare(sql)),
    ...foreignKeyQueries.map((sql) => db.prepare(sql)),
    db.prepare("SELECT COUNT(*) AS count FROM pragma_foreign_key_check"),
  ];
  const results = await db.batch(baseStatements);
  let cursor = 0;
  const takeRows = (count) => {
    const rows = results.slice(cursor, cursor + count).flatMap(resultsOf);
    cursor += count;
    return rows;
  };
  const columnRows = takeRows(columnQueries.length);
  const indexListRows = takeRows(indexListQueries.length);
  const foreignKeyRows = takeRows(foreignKeyQueries.length);
  const foreignKeyCheckResult = results[cursor];
  const followUpStatements = [];
  const indexDetailQueries = buildIndexDetailQueries(indexListRows);
  const indexDetailsStart = followUpStatements.length;
  followUpStatements.push(...indexDetailQueries.map((sql) => db.prepare(sql)));
  let invalidUpdatedAtSlot;
  const hasUpdatedAt = columnRows.some(
    (row) => row.table_name === "users" && row.name === "updated_at",
  );
  if (hasUpdatedAt) {
    invalidUpdatedAtSlot = followUpStatements.length;
    followUpStatements.push(db.prepare(`SELECT COUNT(*) AS count FROM users
      WHERE updated_at IS NULL OR trim(updated_at) = ''`));
  }
  let ledgerSlot;
  if (tableNames.has("d1_migrations")) {
    ledgerSlot = followUpStatements.length;
    followUpStatements.push(
      // Validate the exact ledger schema before reading expected fields. This
      // lets malformed ledgers return `refused` instead of throwing.
      db.prepare("SELECT * FROM d1_migrations"),
    );
  }
  const followUpResults = followUpStatements.length > 0
    ? await db.batch(followUpStatements)
    : [];
  const scalarCount = (result) => Number(resultsOf(result)[0]?.count ?? 0);
  return {
    tableRows,
    columnRows,
    indexRows: followUpResults
      .slice(indexDetailsStart, indexDetailsStart + indexDetailQueries.length)
      .flatMap(resultsOf),
    foreignKeyRows,
    ledgerRows: ledgerSlot === undefined ? [] : resultsOf(followUpResults[ledgerSlot]),
    invalidUpdatedAtCount: tableNames.has("users") && !hasUpdatedAt
      ? 1
      : invalidUpdatedAtSlot === undefined
        ? 0
        : scalarCount(followUpResults[invalidUpdatedAtSlot]),
    foreignKeyViolationCount: scalarCount(foreignKeyCheckResult),
  };
}

async function replan(db) {
  return planLegacySchemaAdoption(await inspectLegacyD1(db));
}

/**
 * Writes migration metadata only. A refused/fresh database is never mutated.
 * A lost response is safe: retrying re-reads the prefix and converges.
 */
export async function adoptLegacyD1(db) {
  const initial = await replan(db);
  if (initial.state !== "adoptable") return initial;

  const hadLedger = (await inspectLegacyD1(db)).tableRows
    .some((row) => row.name === "d1_migrations");
  if (!hadLedger) {
    try {
      await db.prepare(CREATE_MIGRATION_LEDGER_SQL).run();
    } catch (error) {
      const afterCreateError = await replan(db);
      if (afterCreateError.state !== "adoptable") throw error;
    }
  }

  const beforeInsert = await replan(db);
  if (beforeInsert.state === "already_baselined") {
    return { ...beforeInsert, state: "adopted" };
  }
  if (beforeInsert.state !== "adoptable") return beforeInsert;

  if (beforeInsert.missingNames.length > 0) {
    try {
      await db
        .prepare(buildLedgerInsertSql(beforeInsert.missingNames.length))
        .bind(...beforeInsert.missingNames)
        .run();
    } catch (error) {
      const afterInsertError = await replan(db);
      if (afterInsertError.state !== "already_baselined") throw error;
    }
  }

  const verified = await replan(db);
  if (verified.state !== "already_baselined") {
    throw new Error(`Legacy D1 adoption verification failed: ${verified.state}`);
  }
  return { ...verified, state: "adopted" };
}
