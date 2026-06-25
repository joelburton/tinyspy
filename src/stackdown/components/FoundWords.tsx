import { useState, type KeyboardEvent, type MouseEvent } from 'react'
import type { Member } from '../../common/lib/games'
import { colorVarFor } from '../../common/lib/memberColor'
import { cls } from '../../common/lib/cls'
import { DefinitionPopover } from '../../common/components/DefinitionPopover'
import type { SubmissionRow } from '../hooks/useGame'
import styles from './FoundWords.module.css'

/**
 * The submission log — the right-column "found words" list, guess-log
 * style. Every submission lands here in order as a bordered row with a
 * left status-bar: a valid word (green) numbered #1, #2, …, an invalid
 * attempt struck through + tagged "not a word" (red), and the logged
 * cheat requests (orange). All are durable rows in
 * `stackdown.submissions` — this is just a projection of realtime. Only
 * the played words get a number; the requests are asides.
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

  // A played word's number is how many played words appear up to and
  // including it (the requests aren't guesses, so they're skipped).
  // Computed purely from the index — no render-time mutable counter.
  const guessNumber = (i: number) =>
    submissions.slice(0, i + 1).filter((x) => x.kind === 'word').length

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span>Found words:</span>
        <span className={styles.count}>{found}/6</span>
      </div>
      {submissions.length === 0 ? (
        <p className="muted">No words yet.</p>
      ) : (
        <ol className={styles.list}>
          {submissions.map((s, i) => {
            // Cheat-request rows: a logged "Requested hint" / "Requested
            // word" (shown to point out — gently — that someone asked).
            // Orange bar; no guess number (it isn't a guess).
            if (s.kind === 'hint' || s.kind === 'reveal') {
              return (
                <li
                  key={`${s.user_id}-${s.seq}`}
                  className={cls(styles.row, styles.barOrange)}
                >
                  <span className={styles.requestLabel}>
                    Requested {s.kind === 'hint' ? 'hint' : 'word'}
                  </span>
                  {showWho && renderWho(s.user_id)}
                </li>
              )
            }
            // Played-word rows: valid → green bar, clickable to define;
            // invalid → red bar, struck through + tagged.
            return (
              <li
                key={`${s.user_id}-${s.seq}`}
                className={cls(
                  styles.row,
                  s.valid ? styles.barGreen : styles.barRed,
                  !s.valid && styles.invalid,
                )}
              >
                <span className={styles.num}>#{guessNumber(i)}</span>
                {s.valid && s.word ? (
                  <span
                    className={cls(styles.word, styles.clickable)}
                    {...defineActivation(s.word)}
                  >
                    {s.word.toUpperCase()}
                  </span>
                ) : (
                  <span className={styles.word}>{s.word?.toUpperCase()}</span>
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
