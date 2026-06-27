import { useEffect, useState } from 'react'
import type { GamePageCtx } from '../../common/lib/games'
import { boardToDisplay } from '../lib/dice'
import { db } from '../db'
import styles from './PlayArea.module.css'
import '../theme.css'

/**
 * Phase-4 play surface — renders the rolled board read-only, proving the
 * Start → edge-function → DB → render path end to end. The full two-column play
 * UI (typed input, found-words list, rotate button, client-side board tracing)
 * lands in Phase 5; see docs/games/boggle.md §7.
 */
export function PlayArea({ gameId, brand }: GamePageCtx) {
  const [grid, setGrid] = useState<string[][] | null>(null)

  useEffect(() => {
    let active = true
    void db
      .from('games')
      .select('board, n')
      .eq('id', gameId)
      .single()
      .then(({ data }) => {
        if (active && data) setGrid(boardToDisplay(data.board, data.n))
      })
    return () => {
      active = false
    }
  }, [gameId])

  if (!grid) return <div className={styles.loading}>Loading board…</div>

  return (
    <div className={styles.wrap}>
      <div
        className={styles.board}
        style={{ gridTemplateColumns: `repeat(${grid[0].length}, 1fr)` }}
      >
        {grid.flatMap((row, y) =>
          row.map((cell, x) => (
            <div key={`${y}-${x}`} className={styles.tile}>
              {cell}
            </div>
          )),
        )}
      </div>
      <p className={styles.note}>
        {brand}: the full play UI (input, word list, rotate) lands in Phase 5.
      </p>
    </div>
  )
}
