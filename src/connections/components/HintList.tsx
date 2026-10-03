// cs-blessed-connections

import { useState } from 'react'
import { cls } from '@/common/utils/cls'
import type { GCatRank, GCategory } from '../types'
import { RANK_TOKEN } from '../lib/rankColors'
import styles from './HintList.module.css'

type Props = {
  // The puzzle's four categories.
  cats: GCategory[]
  // Whether the list is showing — the Hints button toggles this in the info column.
  open: boolean
}

/**
 * The per-category hint list, unfolded under the info column's action row by
 * the Hints toggle: one row per category, a rank swatch and a Show hint link,
 * which shows that category's first tile.
 *
 * Purely client-side — nothing is broadcast, written or logged; each player's
 * hints are their own. The revealed set is this component's own and the list
 * stays mounted while closed, so a hint taken stays shown across toggles; a
 * Restart unmounts the whole play surface (common/game-page/doc.md), so the
 * same puzzle hunted again starts with none spent.
 */
export function HintList({ cats, open }: Props) {
  const [revealed, setRevealed] = useState<ReadonlySet<GCatRank>>(() => new Set())
  function reveal(rank: GCatRank) {
    setRevealed((prev) => (prev.has(rank) ? prev : new Set(prev).add(rank)))
  }

  if (!open) return null

  // Sort the categories by rank so the rows appear in NYT's conventional
  // yellow → purple order regardless of the puzzle's storage order.
  const rows = cats.slice().sort((a, b) => a.rank - b.rank)

  return (
    <div className={styles.panel}>
      <ul className={styles.rows}>
        {rows.map((c) => {
          const isRevealed = revealed.has(c.rank)
          return (
            <li key={c.rank} className={styles.row}>
              <span
                className={styles.swatch}
                style={{ background: RANK_TOKEN[c.rank] }}
                aria-hidden
              />
              {isRevealed ? (
                <span className={styles.revealedTile}>{c.tiles[0]}</span>
              ) : (
                <button
                  type="button"
                  className={cls('link-button', styles.revealButton)}
                  onClick={() => reveal(c.rank)}
                >
                  Show hint
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
