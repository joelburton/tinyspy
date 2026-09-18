// cs-fixed-outcome-fix

import { EventLog, EventLogActor, EventLogOutcomeBar, EventLogNumber } from '@/common/event-log/EventLog'
import { useEventLogPlayerPicker } from '@/common/event-log/useEventLogPlayerPicker'
import { DefinableWord } from '@/common/definitions/DefinableWord'
import { memberById } from '@/common/members/memberList'
import {
  IconBestFind,
  IconHint,
  IconThemeFind,
  IconWordNo,
  IconWordOk,
} from '@/common/icons/icons'
import { cls } from '@/common/utils/cls'
import { ANSWER_OUTCOME } from '../lib/answer'
import type { Member } from '@/common/members/member'
import gameEventLog from '@/common/event-log/gameEventLog.module.css'
import type { EventRow, GuessResult } from '../hooks/useGame'
import styles from './GameEventLog.module.css'

type Props = {
  events: EventRow[]
  players: Member[]
  selfId: string
  mode: 'coop' | 'compete'
  isTerminal: boolean
  /** The turn open in the board viewer — the row's own id — or null when live. */
  historyId: number | null
  /** Open a turn on the board — the row's id, and the `#N` this log printed
   *  beside it, which is what the banner shows back. */
  onShowHistory: (id: number, n: number) => void
}

/**
 * The verdict as a GLYPH, before the word.
 *
 * Two jobs. It makes a row scannable — an eye running down the log sorts finds
 * from misses without reading a word — and it is the NON-COLOR encoding of the
 * same fact, which the PDF printer will need: docs/pdf.md prints in three
 * shades of gray, where purple and gold are the same ink.
 *
 * Ranked on purpose (trophy > star > check), so the accepted marks read as a
 * ladder rather than three unrelated symbols. All three rejects share the X:
 * the glyph says "this missed" and the label beside it says which miss.
 */
const MARK: Record<GuessResult, typeof IconWordOk> = {
  spangram: IconBestFind,
  theme: IconThemeFind,
  hint_word: IconWordOk,
  duplicate: IconWordNo,
  too_short: IconWordNo,
  invalid: IconWordNo,
}

/**
 * The short body after the word — but ONLY where it says something the color
 * doesn't.
 *
 * A find needs no label: green bar + purple word IS "theme", green bar + gold
 * word IS "spangram", and the gold `near` bar IS "valid word". Spelling those
 * out again cost the width that a long word needs on a phone, to repeat what
 * the row already showed.
 *
 * A reject is the opposite case. Its bar says only how far the move got —
 * amber for the two the rules turn away, red for the one real miss — so the
 * label is what says WHY: too short, already counted, or not a word at all.
 */
const BODY: Partial<Record<GuessResult, string>> = {
  duplicate: 'already found',
  too_short: 'too short',
  invalid: 'not a word',
}

/**
 * strands' event log — one `<tr>` per event in the shared `<EventLog>`.
 *
 * **Rejects are logged too**, which is a deliberate ruling rather than an
 * accident of storage: the log is the team's shared record of what has been
 * tried, and hiding the misses would make it lie about the session. (The
 * structurally impossible paths — off-board, self-crossing — never reach the
 * table at all; those raise, because only a broken client can produce one.)
 *
 * **Spent hints are rows too**, for the same reason and one more: a hint is the
 * one thing besides a find that changes the board, and in compete it IS the
 * ranking metric. It takes an ordinary numbered row rather than an interstitial
 * divider, so a hint gets a `#N` like any other turn — which is what lets one
 * replay its ring on the board.
 *
 * **Coop shows everyone's rows.** Joel's ruling: a peer sees your word when you
 * submit it, so there is no per-player split to make here. Compete's rows are
 * scoped to your own mid-race by the mode-aware RLS arm (and open up at
 * terminal — which is why PlayArea filters `historyRows` explicitly).
 *
 * A row's `#N` is the turn-history handle (shared `EventLogNumber`), offered on
 * every row under every filter.
 */
export function GameEventLog({
  events,
  players,
  selfId,
  mode,
  isTerminal,
  historyId,
  onShowHistory,
}: Props) {
  // The whose-turns dropdown, its default, the aggregate label, the row filter
  // and the honest empty line all come from the shared hook — every event-log
  // game carries it, on one vocabulary. The labels say "turns", not "words":
  // a spent hint is a row here and isn't one.
  const eventLogPicker = useEventLogPlayerPicker<EventRow>({
    players,
    selfId,
    mode,
    isTerminal,
    label: 'Whose turns to show',
    emptyLabel: 'No turns yet.',
  })
  const shown = eventLogPicker.filter(events)

  // The number counts the rows on show; the handle carries the row's own id, so
  // filtering the log renumbers it without ever changing which event it opens.

  // Click-to-define. Only words the DICTIONARY accepted are looked up: a theme
  // word can be a phrase ("FATHERSDAY") and a reject isn't a word at all, so
  // offering the affordance there would promise a definition that can't exist.
  const definable = (e: EventRow) => e.result === 'hint_word' || e.result === 'duplicate'
  const wordClass = (e: EventRow) =>
    cls(
      styles.word,
      e.result === 'spangram' && styles.spangram,
      e.result === 'theme' && styles.theme,
    )

  return (
    <EventLog heading="Turns" picker={eventLogPicker} shown={shown}>
      {shown.map((row, i) => (
        <tr key={row.id} className={gameEventLog.divider}>
          {/* The bar's word is `lib/answer.ts`'s — the log names none of its own,
              so it cannot disagree with the pill that reported the same turn. A
              hint row has no `result` column, which is what `spent_hint` is. */}
          <EventLogOutcomeBar
            outcome={ANSWER_OUTCOME[row.kind === 'hint' ? 'spent_hint' : row.result]}
          />
          <EventLogNumber
            n={i + 1}
            isOpenInHistory={historyId === row.id}
            onShowHistory={() => onShowHistory(row.id, i + 1)}
          />
          <td className={gameEventLog.main}>
            {/* Fixed-width slot, so every word starts at the same x no
                matter which glyph precedes it. */}
            <span
              className={cls(
                styles.mark,
                row.result === 'spangram' && styles.markSpangram,
                row.result === 'theme' && styles.markTheme,
              )}
              aria-hidden
            >
              {(() => {
                const Mark = row.kind === 'hint' ? IconHint : MARK[row.result]
                return <Mark size={14} />
              })()}
            </span>
            {row.kind === 'hint' ? (
              /* No word — that's the point of a hint, and the row says so in
                 the same slot the word would occupy rather than leaving a gap.
                 Muted, because unlike every other row here there is no player
                 input to report; `#N` still replays the ring on the board. */
              <span className={gameEventLog.muted}>Hint used</span>
            ) : (
              <>
                {definable(row) ? (
                  <DefinableWord word={row.word} className={wordClass(row)} />
                ) : (
                  <span className={wordClass(row)}>{row.word.toUpperCase()}</span>
                )}
                {BODY[row.result] && (
                  <span className={gameEventLog.muted}> — {BODY[row.result]}</span>
                )}
              </>
            )}
          </td>
          <EventLogActor actor={memberById(players, row.user_id)} />
        </tr>
      ))}
    </EventLog>
  )
}
