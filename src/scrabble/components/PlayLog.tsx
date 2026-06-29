import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react'
import type { Member } from '../../common/lib/games'
import { colorVarFor } from '../../common/lib/memberColor'
import { cls } from '../../common/lib/cls'
import { useDefinePopover } from '../../common/hooks/useDefinePopover'
import type { PlayRow } from '../hooks/useGame'
import styles from './PlayLog.module.css'

/**
 * The move log — guess-log style, like stackdown's FoundWords: a framed,
 * scrollable box of thin-bordered rows (green left bar for a word, orange for
 * an exchange/pass), oldest-first so new moves land at the BOTTOM and
 * auto-scroll into view. Each word reads "<name>: +<score> <WORD>" — the name
 * in the player's color, the score green, the word bold and **clickable to
 * define** (the shared DefinitionPopover → common.words/Wiktionary lookup
 * every word game gets).
 */
export function PlayLog({ plays, players }: { plays: PlayRow[]; players: Member[] }) {
  const listRef = useRef<HTMLOListElement>(null)
  // Keep the newest move in view as the log grows.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [plays.length])

  // Click-to-define plumbing (a common feature — see common/hooks/useDefinePopover).
  // Words display uppercase in the log; the lookup wants them lowercase.
  const { define, popover } = useDefinePopover()
  const openDefine = (word: string, el: HTMLElement) => define(word.toLowerCase(), el)
  // Click / keyboard activation for a clickable word (mirrors FoundWords).
  const defineProps = (word: string) => ({
    className: cls(styles.word, styles.clickable),
    role: 'button' as const,
    tabIndex: 0,
    title: 'Click to define',
    onClick: (e: MouseEvent<HTMLSpanElement>) => openDefine(word, e.currentTarget),
    onKeyDown: (e: KeyboardEvent<HTMLSpanElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openDefine(word, e.currentTarget)
      }
    },
  })

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
              className={cls(
                styles.row,
                p.kind === 'word' ? styles.barGreen : p.kind === 'forfeit' ? styles.barRed : styles.barOrange,
              )}
            >
              {renderWho(p.user_id)}:{' '}
              {p.kind === 'word' && (
                <>
                  <span className={styles.score}>+{p.score ?? 0}</span>{' '}
                  {(p.words ?? []).map((w, i) => (
                    <span key={`${w}-${i}`}>
                      {i > 0 ? ' ' : ''}
                      <span {...defineProps(w)}>{w.toUpperCase()}</span>
                    </span>
                  ))}
                </>
              )}
              {p.kind === 'exchange' && <span className="muted">exchanged {p.tile_count} tiles</span>}
              {p.kind === 'pass' && <span className="muted">passed</span>}
              {p.kind === 'forfeit' && (
                <>
                  <span className={styles.scoreNeg}>{p.score}</span> tiles unplayed
                </>
              )}
            </li>
          ))}
        </ol>
      )}

      {popover}
    </div>
  )
}
