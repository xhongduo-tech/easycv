export function planMigrationLedgerPrefix(
  appliedNames: readonly string[],
  expectedNames: readonly string[],
): { valid: boolean; missingNames: string[] };
