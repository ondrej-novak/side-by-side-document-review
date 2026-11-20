
/**
 * A provenance key naming one table cell — `lineItems[3].price`. Table and column names are matched permissively
 * on purpose: a form field name can start with a digit or hold any character at all, and a name this pattern
 * rejected would read as a plain field key. The table group is greedy so the row index binds to the last `[n].`
 * in the key, leaving dotted paths (`invoice.lineItems[3].price`) to the table.
 */
const CELL_KEY = /^(?<table>.+)\[(?<row>\d+)\]\.(?<column>[^.]+)$/;

export interface CellSourceKey {
  table: string;
  row: number;
  column: string;
}

/** Parses a cell provenance key, or null for a plain field key. */
export function parseCellSourceKey(key: string): CellSourceKey | null {
  const match = CELL_KEY.exec(key);
  if (!match?.groups) return null;
  return { table: match.groups.table, row: Number(match.groups.row), column: match.groups.column };
}

/** The provenance key for one cell of a table field — the inverse of {@link parseCellSourceKey}. */
export function cellSourceKey({ table, row, column }: CellSourceKey): string {
  return `${table}[${row}].${column}`;
}

/**
 * How a provenance key reads to a person — used where a region announces the fields it filled. A cell key is
 * spelled out with a 1-based row number, since `lineItems[3].price` is a storage path, not something a reviewer
 * counting rows on a receipt can follow.
 */
export function formatSourceFieldLabel(key: string): string {
  const cell = parseCellSourceKey(key);
  return cell ? `${cell.column} (${cell.table} row ${cell.row + 1})` : key;
}
