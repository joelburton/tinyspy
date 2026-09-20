// cs-met-connections

import { useState } from 'react'
import { cls } from '@/common/utils/cls'
import type { Board, CategoryRank } from '../lib/board'
import { RANK_TOKEN } from '../lib/rankColors'
import styles from './HintList.module.css'

type Props = {
  // The 4 categories from the active game's board.
  categories: Board['categories']
  // Whether the list is showing — the Hints button toggles this in the info column.
  open: boolean
}

/**
 * Per-category hint reveal, shown inline in the info column. Players who want a
 * nudge push "Hints" (InfoCol's action row) to unfold this list; each of the four
 * rows starts as a colored rank swatch + a "Reveal" link, and clicking Reveal
 * surfaces the first tile in that category — just enough to point them in a
 * direction without giving the whole category away. Pushing "Hints" again hides the
 * list.
 *
 * **Purely client-side.** Revealing a hint doesn't broadcast to peers, doesn't
 * persist to the DB, and doesn't show up in any game history. Each player can
 * independently consult their own hints.
 *
 * The revealed set is this component's own. `open` is a prop and the list stays
 * mounted while it is closed, so closing it with yellow already revealed and
 * reopening it keeps yellow shown; a Restart unmounts the whole play surface
 * (common/game-page/doc.md), so the same board hunted again starts with no
 * hint spent.
 */
export function HintList({ categories, open }: Props) {
  const [revealed, setRevealed] = useState<ReadonlySet<CategoryRank>>(() => new Set())
  const reveal = (rank: CategoryRank) =>
    setRevealed((prev) => (prev.has(rank) ? prev : new Set(prev).add(rank)))

  if (!open) return null

  // Sort the categories by rank so the rows appear in NYT's conventional
  // yellow → purple order regardless of the board's storage order.
  const rows = categories.slice().sort((a, b) => a.rank - b.rank)

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
                  Reveal
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
