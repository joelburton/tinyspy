import { useState } from 'react'
import { FloatingPanel } from '../../common/components/FloatingPanel'
import { cls } from '../../common/lib/cls'
import type { Board, CategoryRank } from '../lib/board'
import { RANK_TOKEN } from '../lib/rankColors'
import actionRow from '../../common/components/modalActions.module.css'
import styles from './HintModal.module.css'

type Props = {
  /** The 4 categories from the active game's board. */
  categories: Board['categories']
  open: boolean
  onClose: () => void
}

/**
 * Per-category hint reveal. Players who want a nudge can open
 * this modal and click "Reveal" for any of the four categories
 * — that surfaces the first tile in that category, just enough
 * to point them in a direction without giving the whole group
 * away.
 *
 * **Purely client-side.** Revealing a hint doesn't broadcast to
 * peers, doesn't persist to the DB, and doesn't show up in any
 * game history. Each player can independently consult the hint
 * modal on their own machine.
 *
 * State lives in this component: a Set of ranks the player has
 * revealed during this session. The state persists across
 * close/open of the modal (so closing the modal with yellow
 * already revealed and reopening it later keeps yellow shown).
 * It clears when the play surface unmounts — same trigger as
 * pause and as navigating away from the game — because PlayArea
 * mounts this modal as part of its tree.
 *
 * Uses the shared `<FloatingPanel>` shell — draggable but not
 * resizable (the 4-row list is compact, resizing creates
 * awkward empty space), no backdrop (other UI stays
 * interactable while reading hints).
 */
export function HintModal({ categories, open, onClose }: Props) {
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

  // Sort the categories by rank so the rows appear in NYT's
  // conventional yellow → purple order regardless of the
  // board's storage order.
  const rows = categories.slice().sort((a, b) => a.rank - b.rank)

  return (
    <FloatingPanel
      title="Hints"
      onClose={onClose}
      resizable={false}
      defaultSize={{ width: 360, height: 320 }}
      minWidth={300}
      minHeight={240}
    >
      <p className="muted">
        Reveal the first tile in a category. Hints are local to
        you — your partner won't see them.
      </p>

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

      <div className={actionRow.modalActions}>
        <button type="button" autoFocus onClick={onClose}>
          Close
        </button>
      </div>
    </FloatingPanel>
  )
}
