import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type Cell = string | number | boolean

/** Escape one value for COPY's default TEXT format: backslash first,
 *  then the tab / newline delimiters. (Our data has none of these,
 *  but escaping keeps the loader correct for any future column.) */
function escapeCell(v: Cell): string {
  return String(v)
    .replace(/\\/g, '\\\\')
    .replace(/\t/g, '\\t')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
}

/**
 * Bulk-reload a table via psql `COPY`: TRUNCATE, then stream all rows
 * in over a single direct Postgres connection. This is the robust,
 * fast path for seeding a reference table — no PostgREST, no HTTP, no
 * keep-alive failures, no batching/retries. ~50k rows in well under a
 * second.
 *
 * "Reload" semantics (truncate + insert, not upsert) are correct here
 * because these are full reseeds of reference data — there's nothing
 * on the remote to preserve.
 *
 * `rows` are arrays of cell values in `columns` order. The whole load
 * is one transaction: on any error it rolls back, leaving the table's
 * previous contents intact.
 *
 * @param dbUrl   Postgres connection string (psql connects as is).
 * @param table   schema-qualified table name, e.g. 'freebee.pangrams'.
 * @param columns column names matching each row's cell order.
 * @param rows    the data.
 */
export function copyLoad(
  dbUrl: string,
  table: string,
  columns: string[],
  rows: Cell[][],
): void {
  const dir = mkdtempSync(join(tmpdir(), 'copyload-'))
  const tsvPath = join(dir, 'data.tsv')
  try {
    writeFileSync(
      tsvPath,
      rows.map((r) => r.map(escapeCell).join('\t')).join('\n') + '\n',
    )

    const sql = `
\\set ON_ERROR_STOP on
begin;
truncate ${table};
\\copy ${table} (${columns.join(', ')}) from '${tsvPath}'
commit;
select count(*) || ' rows in ${table}' as result from ${table};
`
    execFileSync('psql', [dbUrl], {
      input: sql,
      stdio: ['pipe', 'inherit', 'inherit'],
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
