import { useState } from 'react'
import { cls } from '../../common/lib/util/cls'
import type { Board, CategoryRank } from '../lib/board'
import { RANK_TOKEN } from '../lib/rankColors'
import styles from './HintList.module.css'

type Props = {
  /** The 4 categories from the active game's board. */
  categories: Board['categories']
  /** Whether the list is showing — the Hints button toggles this in the info column. */
  open: boolean
}

/**
 * Per-category hint reveal, shown inline in the info column. Players who want a
 * nudge push "Hints" (InfoCol's action row) to unfold this list; each of the four
 * rows starts as a colored rank swatch + a "Reveal" link, and clicking Reveal
 * surfaces the first tile in that category — just enough to point them in a
 * direction without giving the whole group away. Pushing "Hints" again hides the
 * list.
 *
 * **Purely client-side.** Revealing a hint doesn't broadcast to peers, doesn't
 * persist to the DB, and doesn't show up in any game history. Each player can
 * independently consult their own hints.
 *
 * State lives in this component: a Set of ranks the player has revealed. Because
 * `open` is a prop and this component stays mounted while it's play (InfoCol keeps
 * it in the action slot), the revealed set survives hide/show — closing the list
 * with yellow already revealed and reopening it keeps yellow shown. It clears when
 * the play surface unmounts (the same trigger as pause and as navigating away),
 * which is also when the board reveals every answer anyway.
 *
 * This used to be a draggable `<FloatingPanel>` modal rendered over the board; it
 * now lives in the info column so a hint reads as one more info-column readout,
 * not a window to manage.
 */
export function HintList({ categories, open }: Props) {
  const [revealed, setRevealed] = useState<Set<CategoryRank>>(
    () => new Set(),
  )

  function handleReveal(rank: CategoryRank) {
    setRevealed((prev) => {
      if (prev.has(rank)) return prev
      const next = new Set(prev)
      next.add(rank)
      return next
    })
  }

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
                  onClick={() => handleReveal(c.rank)}
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
