import { useEffect, useRef } from 'react'
import { colorVarFor } from '../../common/lib/memberColor'
import type { Member } from '../../common/lib/games'
import { coord } from '../lib/waffle'
import type { WaffleSwap } from '../hooks/useGame'
import styles from './SwapLog.module.css'

type Props = {
  swaps: WaffleSwap[]
  players: Member[]
}

/**
 * The coop move log — the shared swap history, in the spirit of
 * psychicnum's GuessHistory and wordknit's guess log. Coop only;
 * PlayArea doesn't render it in compete (where a swap sequence would
 * leak an opponent's hidden-board deductions, and the table is empty
 * anyway).
 *
 * Each row reads "Swap #N — <name>" plus the move itself,
 * "A (A1) ↔ B (C2)": the swapped letters stand out while the
 * coordinates sit in a smaller, lighter font. Stateless and
 * presentational — renders the rows it's handed and auto-scrolls to
 * the latest, same as the other logs.
 */
export function SwapLog({ swaps, players }: Props) {
  const playerFor = (userId: string) =>
    players.find((m) => m.user_id === userId)
  const listRef = useRef<HTMLOListElement>(null)

  // Auto-scroll to the newest swap — same pattern as GuessHistory.
  useEffect(
    function scrollToLatest() {
      const el = listRef.current
      if (!el) return
      el.scrollTop = el.scrollHeight
    },
    [swaps],
  )

  return (
    <section className={styles.log}>
      <h3 className={styles.heading}>Swaps</h3>
      {swaps.length === 0 ? (
        <p className="muted">No swaps yet.</p>
      ) : (
        <ol ref={listRef} className={styles.list}>
          {swaps.map((s) => {
            const swapper = playerFor(s.user_id)
            return (
              <li key={s.swap_index} className={styles.item}>
                <div className={styles.metaRow}>
                  <span className={styles.index}>Swap #{s.swap_index}</span>
                  <span
                    className={styles.user}
                    style={{ color: colorVarFor(swapper?.color) }}
                  >
                    {swapper?.username ?? 'someone'}
                  </span>
                </div>
                <div className={styles.move}>
                  <span className={styles.letter}>
                    {s.letter_a.toUpperCase()}
                  </span>
                  <span className={styles.coord}>({coord(s.pos_a)})</span>
                  <span className={styles.arrow}>↔</span>
                  <span className={styles.letter}>
                    {s.letter_b.toUpperCase()}
                  </span>
                  <span className={styles.coord}>({coord(s.pos_b)})</span>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
