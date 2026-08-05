import type { MouseEvent } from 'react'
import { TurnLog, TurnLogBar, TurnLogNumber, type TurnOutcome } from '../../common/components/game/lists/TurnLog'
import { TurnLogActor } from '../../common/components/game/lists/TurnLogActor'
import { useTurnLogPlayerPicker } from '../../common/hooks/game/useTurnLogPlayerPicker'
import { useDefinePopover } from '../../common/hooks/definitions/useDefinePopover'
import { memberById } from '../../common/lib/game/peers'
import {
  IconBestFind,
  IconHint,
  IconThemeFind,
  IconWordNo,
  IconWordOk,
} from '../../common/components/icons'
import { cls } from '../../common/lib/util/cls'
import type { Member } from '../../common/lib/games'
import turnLog from '../../common/components/game/lists/TurnLog.module.css'
import type { EventRow, GuessResult } from '../hooks/useGame'
import styles from './GameTurnLog.module.css'

type Props = {
  events: EventRow[]
  players: Member[]
  selfId: string
  mode: 'coop' | 'compete'
  isTerminal: boolean
  /** The turn open in the board viewer (by log position), or null when live. */
  viewingIndex: number | null
  /** Open a turn on the board. */
  onSelectTurn: (index: number) => void
}

/**
 * How each submission paints its outcome bar, in the shared four-value
 * vocabulary (`TurnOutcome`). The mapping is the point:
 *
 *   - **good** — a theme word or the spangram. The thing you came for.
 *   - **partial** — a valid non-theme word. Real progress (it moves the hint
 *     bar) but not the goal, which is exactly what `partial` means elsewhere.
 *   - **bad** — too short, not a word, already counted. All three are misfires.
 *
 * A duplicate lands on `bad` rather than `neutral` because it EARNED NOTHING:
 * being generous about it in the log would misreport the hint economy.
 */
const OUTCOME: Record<GuessResult, TurnOutcome> = {
  spangram: 'good',
  theme: 'good',
  hint_word: 'partial',
  duplicate: 'bad',
  too_short: 'bad',
  invalid: 'bad',
}

/**
 * A spent hint is `neutral` — the fourth value, and the only row in this log
 * that uses it.
 *
 * It is not `bad` (nothing missed), not `partial` (that means "progress toward
 * the goal", and a hint is the opposite: you SPENT the progress you'd banked),
 * and certainly not `good`. `neutral` says "this happened and it isn't scored",
 * which is exactly right — and it keeps the four bar colours reading as one
 * scale, where an eye running the log still sorts finds from misses without a
 * fifth thing competing for attention.
 */
const HINT_OUTCOME: TurnOutcome = 'neutral'

/**
 * The verdict as a GLYPH, before the word.
 *
 * Two jobs. It makes a row scannable — an eye running down the log sorts finds
 * from misses without reading a word — and it is the NON-COLOUR encoding of the
 * same fact, which the PDF printer will need: docs/pdf.md prints in three
 * shades of grey, where purple and gold are the same ink.
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
 * The short body after the word — but ONLY where it says something the colour
 * doesn't.
 *
 * A find needs no label: green bar + purple word IS "theme", green bar + gold
 * word IS "spangram", and an amber bar IS "valid word". Spelling those out
 * again cost the width that a long word needs on a phone, to repeat what the
 * row already showed.
 *
 * A reject is the opposite case. All three paint the same red bar, so the
 * colour narrows it to "this missed" and the label is the only thing saying
 * WHY — too short, already counted, or not a word at all.
 */
const BODY: Partial<Record<GuessResult, string>> = {
  duplicate: 'already found',
  too_short: 'too short',
  invalid: 'not a word',
}

/**
 * strands' turn log — one `<tr>` per event in the shared `<TurnLog>`.
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
 * divider, so `#N` keeps meaning "position in this log" — which is precisely
 * what the history viewer indexes by, and what lets a hint turn replay its ring.
 *
 * **Coop shows everyone's rows.** Joel's ruling: a peer sees your word when you
 * submit it, so there is no per-player split to make here. Compete's rows are
 * scoped to your own mid-race by the mode-aware RLS arm (and open up at
 * terminal — which is why PlayArea filters `historyRows` explicitly).
 *
 * A row's `#N` is the turn-history handle (shared `TurnLogNumber`), offered
 * when the visible rows are the viewer's own sequence.
 */
export function GameTurnLog({
  events,
  players,
  selfId,
  mode,
  isTerminal,
  viewingIndex,
  onSelectTurn,
}: Props) {
  // The whose-turns dropdown, its default, the aggregate label, the row filter
  // and the honest empty line all come from the shared hook — every turn-log
  // game carries it, on one vocabulary. The labels say "turns", not "words":
  // a spent hint is a row here and isn't one.
  const who = useTurnLogPlayerPicker<EventRow>({
    players,
    selfId,
    mode,
    isTerminal,
    label: 'Whose turns to show',
    emptyLabel: 'No turns yet.',
  })
  const shown = who.filter(events)

  // `#N` is a LIVE handle only when the rows on show ARE the board's own
  // sequence — coop's Team view, or my own in compete. Pick a single player out
  // of a shared coop log and position 3 of the filtered list isn't the board's
  // turn 3, so the handle degrades to a plain number rather than replaying the
  // wrong turn. The shared picker works this out; we just obey it.
  const boardIsShown = who.boardIsShown

  // Click-to-define. Only words the DICTIONARY accepted are looked up: a theme
  // word can be a phrase ("FATHERSDAY") and a reject isn't a word at all, so
  // offering the affordance there would promise a definition that can't exist.
  const { define, popover } = useDefinePopover()
  const definable = (e: EventRow) => e.result === 'hint_word' || e.result === 'duplicate'

  return (
    <>
      <TurnLog
        heading="Turns"
        headerAction={who.picker}
        empty={shown.length === 0}
        emptyText={who.emptyText}
        scrollKey={shown}
      >
        {shown.map((row, i) => (
          <tr key={row.id} className={turnLog.turnLogDivider}>
            <TurnLogBar outcome={row.kind === 'hint' ? HINT_OUTCOME : OUTCOME[row.result]} />
            {boardIsShown ? (
              <TurnLogNumber n={i + 1} viewing={viewingIndex === i} onSelect={() => onSelectTurn(i)} />
            ) : (
              <td className={turnLog.meta}>#{i + 1}</td>
            )}
            <td className={turnLog.main}>
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
                <span className={turnLog.meta}>Hint used</span>
              ) : (
                <>
                  <span
                    className={cls(
                      styles.word,
                      row.result === 'spangram' && styles.spangram,
                      row.result === 'theme' && styles.theme,
                      definable(row) && styles.definable,
                    )}
                    {...(definable(row)
                      ? {
                        title: 'Click to define',
                        onClick: (e: MouseEvent<HTMLSpanElement>) =>
                          define(row.word.toLowerCase(), e.currentTarget),
                      }
                      : {})}
                  >
                    {row.word.toUpperCase()}
                  </span>
                  {BODY[row.result] && (
                    <span className={turnLog.meta}> — {BODY[row.result]}</span>
                  )}
                </>
              )}
            </td>
            <TurnLogActor actor={memberById(players, row.user_id)} />
          </tr>
        ))}
      </TurnLog>
      {popover}
    </>
  )
}
