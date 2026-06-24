import { useState, type KeyboardEvent, type MouseEvent } from 'react'
import type { Member } from '../../common/lib/games'
import { colorVarFor } from '../../common/lib/memberColor'
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
  // The submitter, rendered in their player color (matching the rest of
  // the app's "who did this" treatment). Falls back to muted "someone"
  // when the player isn't in the roster.
  const renderWho = (userId: string) => {
    const p = players.find((p) => p.user_id === userId)
    return (
      <span
        className={styles.who}
        style={p ? { color: colorVarFor(p.color) } : undefined}
      >
        {p?.username ?? 'someone'}
      </span>
    )
  }

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
          {submissions.map((s) => {
            // Cheat-request rows: a logged "Requested hint" / "Requested
            // word" (shown to point out — gently — that someone asked).
            if (s.kind === 'hint' || s.kind === 'reveal') {
              return (
                <li key={`${s.user_id}-${s.seq}`}>
                  <span className={styles.requestLabel}>
                    Requested {s.kind === 'hint' ? 'hint' : 'word'}
                  </span>
                  {showWho && renderWho(s.user_id)}
                </li>
              )
            }
            // Played-word rows: valid → clickable to define; invalid →
            // struck through + tagged.
            return (
              <li
                key={`${s.user_id}-${s.seq}`}
                className={s.valid ? styles.valid : styles.invalid}
              >
                {s.valid && s.word ? (
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
                {showWho && renderWho(s.user_id)}
              </li>
            )
          })}
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
