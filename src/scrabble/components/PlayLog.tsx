import { useEffect, useRef } from 'react'
import type { Member } from '../../common/lib/games'
import { colorVarFor } from '../../common/lib/memberColor'
import { cls } from '../../common/lib/cls'
import type { PlayRow } from '../hooks/useGame'
import styles from './PlayLog.module.css'

/**
 * The move log — guess-log style, like StackDown's FoundWords: thin-bordered
 * rows, oldest-first so new moves land at the BOTTOM, auto-scrolled into view.
 * Each word reads "<name>: +<score> <WORD>" — the name in the player's color,
 * the score green, the word bold. The list scrolls inside a fixed-height box
 * so it never grows the page.
 */
export function PlayLog({ plays, players }: { plays: PlayRow[]; players: Member[] }) {
  const listRef = useRef<HTMLOListElement>(null)
  // Keep the newest move in view as the log grows.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [plays.length])

  const renderWho = (userId: string) => {
    const p = players.find((m) => m.user_id === userId)
    return (
      <span className={styles.who} style={p ? { color: colorVarFor(p.color) } : undefined}>
        {p?.username ?? 'someone'}
      </span>
    )
  }

  return (
    <div className={styles.panel}>
      <h3 className={styles.heading}>Moves</h3>
      {plays.length === 0 ? (
        <p className="muted">No moves yet.</p>
      ) : (
        <ol className={styles.list} ref={listRef}>
          {plays.map((p) => (
            <li
              key={p.seq}
              className={cls(styles.row, p.kind === 'word' ? styles.barGreen : styles.barOrange)}
            >
              {renderWho(p.user_id)}:{' '}
              {p.kind === 'word' && (
                <>
                  <span className={styles.score}>+{p.score ?? 0}</span>{' '}
                  <span className={styles.word}>
                    {(p.words ?? []).map((w) => w.toUpperCase()).join(' ')}
                  </span>
                </>
              )}
              {p.kind === 'exchange' && <span className="muted">exchanged {p.tile_count} tiles</span>}
              {p.kind === 'pass' && <span className="muted">passed</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
