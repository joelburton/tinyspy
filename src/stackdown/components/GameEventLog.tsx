// cs-fixed-outcome-fix

import type { Member } from '@/common/members/member'
import { cls } from '@/common/utils/cls'
import { memberById } from '@/common/members/memberList'
import { EventLog, EventLogActor, EventLogOutcomeBar, EventLogNumber } from '@/common/event-log/EventLog'
import gameEventLog from '@/common/event-log/gameEventLog.module.css'
import { DefinableWord } from '@/common/definitions/DefinableWord'
import { useEventLogPlayerPicker } from '@/common/event-log/useEventLogPlayerPicker'
import { ANSWER_OUTCOME, answerOf } from '../lib/answer'
import type { EventRow } from '../hooks/useGame'
import styles from './GameEventLog.module.css'

/**
 * The submission log — the info-column history of every play, rendered on the
 * shared `<EventLog>` (heading + fixed-height bordered scroll box + table) so it
 * reads the same as the other games' logs. It isn't strictly a "found words"
 * list: it's chronological and carries invalid attempts and cheat requests too,
 * so it's a **event log**, not a `<WordList>`. Each submission is one `<tr>` with
 * the shared outcome bar, whose color is `lib/answer.ts`'s — the bar never names
 * a word of its own, so it cannot disagree with the pill that reported the same
 * turn. The row's text is this log's:
 *
 *   - a **valid** word    → the word, clickable to define;
 *   - an **invalid** word → struck through + tagged "not a word";
 *   - a **cheat request**  → the muted "Hint: …" / "Spoiler: …" row.
 *
 * All three are durable rows in `stackdown.events` (this is just a
 * projection of realtime). Every row is numbered #1, #2, … in order — including
 * the cheat requests, so asking for a hint reads as having "cost a turn" rather
 * than being free.
 *
 * Every row names its player (the shared `<ActorDot>`), unconditionally — the
 * v3 log shape. **Whose rows** are shown is picked by the shared
 * `useEventLogPlayerPicker` dropdown in the header, one vocabulary across every
 * event-log game: solo is your handle, coop is "Team" plus each player, compete
 * is "All" plus each player. In compete an opponent's rows are RLS-hidden during
 * play and open at terminal, which is what the picker's empty text says.
 *
 * Click-to-define: a valid (real) word opens the shared `DefinitionPopover` (the
 * common read-through cache → Wiktionary lookup every word game gets). Invalid
 * attempts aren't real words, so they stay inert.
 */
export function GameEventLog({
  submissions,
  players,
  selfId,
  mode,
  isTerminal,
  historyId,
  onShowHistory,
}: {
  /** Every submission the viewer can see. Coop: the whole shared game. Compete:
   *  the viewer's own during play, and (once terminal, when RLS opens) everyone's. */
  submissions: EventRow[]
  players: Member[]
  selfId: string
  mode: 'coop' | 'compete'
  /** Distinguishes an opponent's RLS-hidden log from a genuinely empty one. */
  isTerminal: boolean
  /** The turn currently open in the board viewer (highlights its row), or null.
   *  The row's own id (see lib/history). */
  historyId: number | null
  /** Open a turn in the board viewer (click any row — words, misses, cheats) —
   *  the row's id, and the `#N` this log printed beside it, which is what the
   *  banner shows back. */
  onShowHistory: (id: number, n: number) => void
}) {
  const eventLogPicker = useEventLogPlayerPicker<EventRow>({
    players,
    selfId,
    mode,
    isTerminal,
    emptyLabel: 'No words yet.',
  })
  const shown = eventLogPicker.filter(submissions)

  return (
    <EventLog heading="Turns" picker={eventLogPicker} shown={shown}>
      {shown.map((s, i) => {
        const isRequest = s.kind === 'hint' || s.kind === 'spoiler'
        return (
          // Every submission is its own one-row "turn"; the divider draws the
          // between-rows line (:first-child suppresses it on the first row). The
          // "#N" handle opens that turn on the board viewer (words / misses /
          // cheats all viewable), addressed by the row's own id (see lib/history).
          <tr key={s.id} className={gameEventLog.divider}>
            <EventLogOutcomeBar outcome={ANSWER_OUTCOME[answerOf(s)]} />
            {/* The "#N" handle opens that turn on the board viewer. The number
                counts the rows on show — a filter renumbers them — while the
                handle is the row's own id, so it always opens the row its
                number sits beside. */}
            <EventLogNumber
              n={i + 1}
              isOpenInHistory={historyId === s.id}
              onShowHistory={() => onShowHistory(s.id, i + 1)}
            />
            <td className={gameEventLog.main}>
              {isRequest ? (
                // A logged cheat request, now carrying the text it revealed
                // (stored on the row by reveal_next_hint / reveal_next_word):
                // "Hint: <clue>" or "Spoiler: <WORD>". Normal weight/color —
                // it's information, not an error. (Falls back to the bare label
                // if a legacy row has no stored text.)
                <span className={styles.request}>
                  {s.kind === 'hint'
                    ? s.word
                      ? `Hint: ${s.word}`
                      : 'Requested hint'
                    : s.word
                      ? `Spoiler: ${s.word.toUpperCase()}`
                      : 'Requested word'}
                </span>
              ) : s.valid && s.word ? (
                <DefinableWord word={s.word} className={gameEventLog.primary} />
              ) : (
                // An invalid attempt — struck through + tagged (the red bar
                // already carries the "rejected" signal).
                <>
                  <span className={cls(gameEventLog.primary, styles.invalidWord)}>
                    {s.word?.toUpperCase()}
                  </span>{' '}
                  <span className={styles.tag}>not a word</span>
                </>
              )}
            </td>
            <EventLogActor actor={memberById(players, s.user_id)} />
          </tr>
        )
      })}
    </EventLog>
  )
}
