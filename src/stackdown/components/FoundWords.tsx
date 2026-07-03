import { type KeyboardEvent, type MouseEvent } from 'react'
import type { Member } from '../../common/lib/games'
import { cls } from '../../common/lib/cls'
import { memberById } from '../../common/lib/peers'
import { TurnLogActor } from '../../common/components/TurnLogActor'
import { TurnLog, TurnLogBar, type TurnOutcome } from '../../common/components/TurnLog'
import turnLog from '../../common/components/TurnLog.module.css'
import { useDefinePopover } from '../../common/hooks/useDefinePopover'
import type { SubmissionRow } from '../hooks/useGame'
import styles from './FoundWords.module.css'

/**
 * The submission log — the info-column history of every play, rendered on the
 * shared `<TurnLog>` (heading + fixed-height bordered scroll box + table) so it
 * reads the same as the other games' logs. It isn't strictly a "found words"
 * list: it's chronological and carries invalid attempts and cheat requests too,
 * so it's a **turn log**, not a `<WordList>`. Each submission is one `<tr>` with
 * the shared outcome bar:
 *
 *   - a **valid** word    → green bar, the word clickable to define;
 *   - an **invalid** word → red bar, struck through + tagged "not a word";
 *   - a **cheat request**  → amber bar, the muted "Requested hint / word" row.
 *
 * All three are durable rows in `stackdown.submissions` (this is just a
 * projection of realtime). Every row is numbered #1, #2, … in order — including
 * the cheat requests, so asking for a hint reads as having "cost a turn" rather
 * than being free.
 *
 * Coop shows who played each row (`showWho`, via the shared `<ActorTag>`);
 * compete shows only the caller's own attempts (RLS already hides opponents
 * mid-game), so the attribution would be noise and is suppressed.
 *
 * Click-to-define: a valid (real) word opens the shared `DefinitionPopover` (the
 * common read-through cache → Wiktionary lookup every word game gets). Invalid
 * attempts aren't real words, so they stay inert.
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
  // Click-to-define plumbing (a common feature — see common/hooks/useDefinePopover).
  const { define: openDefine, popover } = useDefinePopover()

  // Click / keyboard activation for a clickable word chip (mirrors
  // spellingbee's WordList — same "Click to define" affordance).
  const defineActivation = (word: string) => ({
    onClick: (e: MouseEvent<HTMLSpanElement>) => openDefine(word, e.currentTarget),
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

  return (
    <>
      <TurnLog
        heading="Turn Log"
        empty={submissions.length === 0}
        emptyText="No words yet."
        scrollKey={submissions.length}
      >
        {submissions.map((s, i) => {
          const isRequest = s.kind === 'hint' || s.kind === 'reveal'
          const outcome: TurnOutcome = isRequest
            ? 'partial' // amber bar — a logged cheat request
            : s.valid
              ? 'good'
              : 'bad'
          return (
            // Every submission is its own one-row "turn"; the divider draws the
            // between-rows line (:first-child suppresses it on the first row).
            <tr key={`${s.user_id}-${s.seq}`} className={turnLog.turnLogDivider}>
              <TurnLogBar outcome={outcome} />
              <td className={turnLog.meta}>#{i + 1}</td>
              <td className={turnLog.main}>
                {isRequest ? (
                  // A logged cheat request, now carrying the text it revealed
                  // (stored on the row by reveal_next_hint / reveal_next_word):
                  // "Hint: <clue>" or "Revealed: <WORD>". Normal weight/color —
                  // it's information, not an error. (Falls back to the bare label
                  // if a legacy row has no stored text.)
                  <span className={styles.request}>
                    {s.kind === 'hint'
                      ? s.word
                        ? `Hint: ${s.word}`
                        : 'Requested hint'
                      : s.word
                        ? `Revealed: ${s.word.toUpperCase()}`
                        : 'Requested word'}
                  </span>
                ) : s.valid && s.word ? (
                  <span
                    className={cls(turnLog.primary, 'definable')}
                    {...defineActivation(s.word)}
                  >
                    {s.word.toUpperCase()}
                  </span>
                ) : (
                  // An invalid attempt — struck through + tagged (the red bar
                  // already carries the "rejected" signal).
                  <>
                    <span className={cls(turnLog.primary, styles.invalidWord)}>
                      {s.word?.toUpperCase()}
                    </span>{' '}
                    <span className={styles.tag}>not a word</span>
                  </>
                )}
              </td>
              {showWho && (
                <TurnLogActor actor={memberById(players, s.user_id)} />
              )}
            </tr>
          )
        })}
      </TurnLog>

      {popover}
    </>
  )
}
