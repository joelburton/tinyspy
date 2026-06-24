import { useState, type KeyboardEvent, type MouseEvent } from 'react'
import type { Member } from '../../common/lib/games'
import { DefinitionPopover } from '../../common/components/DefinitionPopover'
import type { SubmissionRow } from '../hooks/useGame'
import styles from './FoundWords.module.css'

/**
 * The submission log — the right-column "found words" list, guess-log
 * style. Every submission lands here in order: a valid word in its own
 * row, an invalid attempt struck through and tagged "not a word" (both
 * are durable rows in `stackdown.submissions`, so this is just a
 * projection of what realtime delivers).
 *
 * Coop shows who played each word (`showWho`); compete shows only the
 * caller's own attempts (RLS already hides opponents mid-game), so the
 * attribution would be noise and is suppressed.
 *
 * Click-to-define: a valid (real) word is clickable and opens the shared
 * `DefinitionPopover` (the common read-through cache → Wiktionary lookup
 * every word game gets). Invalid attempts aren't real words, so they
 * stay inert.
 */
export function FoundWords({
  submissions,
  players,
  showWho,
}: {
  submissions: SubmissionRow[]
  players: Member[]
  showWho: boolean
}) {
  const nameOf = (userId: string) =>
    players.find((p) => p.user_id === userId)?.username ?? 'someone'

  // The word currently being defined + the element it anchors under.
  const [defining, setDefining] = useState<{ word: string; rect: DOMRect } | null>(
    null,
  )
  const openDefine = (word: string, el: HTMLElement) =>
    setDefining({ word, rect: el.getBoundingClientRect() })

  // Click / keyboard activation for a clickable word chip (mirrors
  // freebee's WordList — same "Click to define" affordance).
  const defineActivation = (word: string) => ({
    onClick: (e: MouseEvent<HTMLSpanElement>) =>
      openDefine(word, e.currentTarget),
    onKeyDown: (e: KeyboardEvent<HTMLSpanElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openDefine(word, e.currentTarget)
      }
    },
    role: 'button' as const,
    tabIndex: 0,
    title: 'Click to define',
  })

  const found = submissions.filter((s) => s.valid).length

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span>Found words</span>
        <span className={styles.count}>{found}/6</span>
      </div>
      {submissions.length === 0 ? (
        <p className="muted">No words yet.</p>
      ) : (
        <ol className={styles.list}>
          {submissions.map((s) => (
            <li
              key={`${s.user_id}-${s.seq}`}
              className={s.valid ? styles.valid : styles.invalid}
            >
              {s.valid ? (
                <span
                  className={`${styles.word} ${styles.clickable}`}
                  {...defineActivation(s.word)}
                >
                  {s.word}
                </span>
              ) : (
                <span className={styles.word}>{s.word}</span>
              )}
              {!s.valid && <span className={styles.tag}>not a word</span>}
              {showWho && s.valid && (
                <span className={styles.who}>{nameOf(s.user_id)}</span>
              )}
            </li>
          ))}
        </ol>
      )}

      {defining && (
        <DefinitionPopover
          initialWord={defining.word}
          anchorRect={defining.rect}
          onClose={() => setDefining(null)}
        />
      )}
    </div>
  )
}
