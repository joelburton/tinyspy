// cs-fixed-outcome-fix

import { cls } from '@/common/utils/cls'
import { DefinableWord } from '@/common/definitions/DefinableWord'
import { EventLog, EventLogActor, EventLogNumber, EventLogOutcomeBar } from '@/common/event-log/EventLog'
import { eventToOutcome, getRejectLabel } from '../lib/answer'
import gameEventLog from '@/common/event-log/gameEventLog.module.css'
import { useEventLogPlayerPicker } from '@/common/event-log/useEventLogPlayerPicker'
import type { Member } from '@/common/members/member'
import type { GEvent, GHistoryView } from '../types'
import styles from './GameEventLog.module.css'

type Props = {
  // EVERY row the viewer can see (`gd.events`) — accepted AND rejected. This
  // is the one place rejects are shown.
  events: GEvent[]
  players: Member[]
  myId: string
  mode: 'coop' | 'compete'
  // Tells a rival's withheld log from a genuinely empty one.
  isGameEnded: boolean
  // The row open on the board: its `#N` wears the history-blue ring, and a
  // `#N` click opens another.
  historyView: GHistoryView
}

/**
 * wordiply's event log — the answer to "who guessed what?", which coop can't get
 * any other way (the board shows five words with no attribution).
 *
 * **It logs rejects too**, which is what makes it worth having: the reject pill
 * is local, so without this three players independently try the same non-word
 * and nobody can see it happened. Cross-player memory is the part that can't be
 * done client-side. `wordiply.events` is the event log — see its table header.
 *
 * Row anatomy, using the shared atoms:
 *   - **outcome bar** — `won` for an accepted guess; `lost` for a structural
 *     reject (a rules error, and in turn-by-turn coop it cost the caller their
 *     go); `warning` for a dictionary miss, which is not a bad move in this
 *     game — you are hunting for the longest word you can think of, and a miss
 *     is a miss (the list may be at fault, or it was a typo). The guess row
 *     and the pill say the same word (`lib/answer.ts`).
 *   - **the word** — the row's headline, so it takes the slack-absorbing
 *     `gameEventLog.main` column. Definable only when it's a real word: looking up
 *     something the dictionary just rejected would be a dead end.
 *   - **length / reason** — an accepted guess shows its LENGTH (wordiply's one
 *     live readout; scores wait for the end). A reject shows why instead.
 *   - **who** — the actor's `<ActorDot>`, right-aligned so the discs line up.
 *
 * **The `#N` handle**, like every other log. Its board is five rows all visible
 * at once, so replaying an ACCEPTED word shows you what you can already see —
 * but most of this log is REJECTS, and they are on no board at all. Opening one
 * is the only way to see the table as it stood when that word was tried, which
 * is the question the log exists to answer.
 */
export function GameEventLog({
  events, players, myId, mode, isGameEnded, historyView,
}: Props) {
  const eventLogPicker = useEventLogPlayerPicker<GEvent>({
    players,
    myId,
    mode,
    isGameEnded,
    label: 'Whose guesses to show',
    emptyLabel: 'No guesses yet.',
  })
  const shown = eventLogPicker.filter(events)

  return (
    <EventLog heading="Guesses" picker={eventLogPicker} shown={shown}>
      {shown.map((guess, i) => (
        <tr key={guess.id} className={gameEventLog.divider}>
          <EventLogOutcomeBar outcome={eventToOutcome(guess)} />
          {/* The number counts the rows on show; the handle carries the row's
              own id. */}
          <EventLogNumber
            n={i + 1}
            isOpenInHistory={historyView.viewedEventId === guess.id}
            onShowHistory={() => historyView.show(guess.id, i + 1)}
          />
          <td className={gameEventLog.main}>
            {guess.valid ? (
              <DefinableWord word={guess.word} />
            ) : (
              // Not definable: the word was just rejected as not-a-word (or
              // as breaking the rules), so a lookup would dead-end.
              <span className={styles.rejected}>{guess.word.toUpperCase()}</span>
            )}
          </td>
          <td className={cls(gameEventLog.muted, styles.outcome)}>
            {guess.valid ? guess.word.length : getRejectLabel(guess.reason)}
          </td>
          <EventLogActor actor={guess.by} />
        </tr>
      ))}
    </EventLog>
  )
}
