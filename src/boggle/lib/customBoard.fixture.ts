// cs-unmet

import { faceToDisplay } from './dice'

/**
 * A raw board string as ROWS of written tiles — `"ABQuD-EFGH-IJKL-MNOP"`, the
 * form the setup field takes back — for the round-trip test of
 * `parseCustomBoard`. The `Letters` setup row writes the same form from the
 * tiles (`lib/setupRows.ts`).
 */
export function ZTest_formatBoard(board: string, n: number): string {
  const rows: string[] = []
  for (let y = 0; y < n; y++) {
    let row = ''
    for (let x = 0; x < n; x++) row += faceToDisplay(board[y * n + x])
    rows.push(row)
  }
  return rows.join('-')
}
