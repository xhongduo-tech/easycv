export function planMigrationLedgerPrefix(appliedNames, expectedNames) {
  const applied = appliedNames.map(String);
  const expected = expectedNames.map(String);
  const valid = applied.length <= expected.length
    && applied.every((name, index) => name === expected[index]);
  return valid
    ? { valid: true, missingNames: expected.slice(applied.length) }
    : { valid: false, missingNames: [] };
}
