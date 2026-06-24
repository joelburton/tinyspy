import type { Member } from '../../common/lib/games'
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
              <span className={styles.word}>{s.word}</span>
              {!s.valid && <span className={styles.tag}>not a word</span>}
              {showWho && s.valid && (
                <span className={styles.who}>{nameOf(s.user_id)}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
