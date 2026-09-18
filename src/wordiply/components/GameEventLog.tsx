// cs-fixed-outcome-fix

import { cls } from '@/common/utils/cls'
import { memberById } from '@/common/members/memberList'
import { DefinableWord } from '@/common/definitions/DefinableWord'
import { EventLog, EventLogActor, EventLogNumber, EventLogOutcomeBar } from '@/common/event-log/EventLog'
import { ANSWER_OUTCOME } from '../lib/answer'
import gameEventLog from '@/common/event-log/gameEventLog.module.css'
import { useEventLogPlayerPicker } from '@/common/event-log/useEventLogPlayerPicker'
import type { Member } from '@/common/members/member'
import type { EventRow } from '../hooks/useGame'
import styles from './GameEventLog.module.css'

type Props = {
  /** EVERY row the viewer can see — accepted AND rejected. This is the one
   *  place rejects are shown; the board and the scores take `validGuesses`. */
  guesses: EventRow[]
  players: Member[]
  selfId: string
  mode: 'coop' | 'compete'
  /** Distinguishes an opponent's RLS-hidden log from a genuinely empty one. */
  isTerminal: boolean
  /** The row open in the board viewer, or null. */
  historyId: number | null
  onShowHistory: (id: number) => void
}

/** What each rejected row says, in the log's terse voice. The pill that fired
 *  at submit time said more; this is the durable one-word record. */
const REJECT_LABEL: Record<NonNullable<EventRow['reason']>, string> = {
  missing_base: 'no base',
  too_short: 'too short',
  not_a_word: 'not a word',
}

/**
 * wordiply's event log — the answer to "who guessed what?", which coop can't get
 * any other way (the board shows five words with no attribution).
 *
 * **It logs rejects too**, which is what makes it worth having: the reject pill
 * is local, so without this three players independently try the same non-word
 * and nobody can see it happened. Cross-player memory is the part that can't be
 * done client-side. `wordiply.guesses` is the event log — see its table header.
 *
 * Row anatomy, using the shared atoms:
 *   - **outcome bar** — `won` for an accepted guess; `lost` for a structural
 *     reject (a rules error, and in turn-by-turn coop it cost the caller their
 *     go); `warning` for a dictionary miss, which is not a bad move in this
 *     game — you are hunting for the longest word you can think of, and a miss
 *     is a miss (the list may be at fault, or it was a typo). It read `near`
 *     until 2026-09-15; the guess row and the pill say the same word, so all
 *     three had to agree on one outcome, and this is it.
 *   - **the word** — the row's headline, so it takes the slack-absorbing
 *     `gameEventLog.main` column. Definable only when it's a real word: looking up
 *     something the dictionary just rejected would be a dead end.
 *   - **length / reason** — an accepted guess shows its LENGTH (wordiply's one
 *     live readout; scores stay terminal-only). A reject shows why instead.
 *   - **who** — the actor's `<ActorDot>`, right-aligned so the discs line up.
 *
 * **The `#N` handle**, like every other log. Its board is five rows all visible
 * at once, so replaying an ACCEPTED word shows you what you can already see —
 * but most of this log is REJECTS, and they are on no board at all. Opening one
 * is the only way to see the table as it stood when that word was tried, which
 * is the question the log exists to answer.
 */
export function GameEventLog({
  guesses, players, selfId, mode, isTerminal, historyId, onShowHistory,
}: Props) {
  const eventLogPicker = useEventLogPlayerPicker<EventRow>({
    players,
    selfId,
    mode,
    isTerminal,
    label: 'Whose guesses to show',
    emptyLabel: 'No guesses yet.',
  })
  const shown = eventLogPicker.filter(guesses)

  return (
    <EventLog heading="Guesses" picker={eventLogPicker} shown={shown}>
      {shown.map((g, i) => (
        <tr key={g.id} className={gameEventLog.divider}>
          <EventLogOutcomeBar
            outcome={ANSWER_OUTCOME[g.valid ? 'accepted' : (g.reason ?? 'not_a_word')]}
          />
          {/* The number counts the rows on show; the handle carries the row's
              own id. */}
          <EventLogNumber
            n={i + 1}
            isOpenInHistory={historyId === g.id}
            onShowHistory={() => onShowHistory(g.id)}
          />
          <td className={gameEventLog.main}>
            {g.valid ? (
              <DefinableWord word={g.word} />
            ) : (
              // Not definable: the word was just rejected as not-a-word (or
              // as breaking the rules), so a lookup would dead-end.
              <span className={styles.rejected}>{g.word.toUpperCase()}</span>
            )}
          </td>
          <td className={cls(gameEventLog.muted, styles.outcome)}>
            {g.valid ? g.length : REJECT_LABEL[g.reason ?? 'not_a_word']}
          </td>
          <EventLogActor actor={memberById(players, g.user_id)} />
        </tr>
      ))}
    </EventLog>
  )
}
