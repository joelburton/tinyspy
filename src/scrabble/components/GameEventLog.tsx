// cs-fixed-outcome-fix

import type { Member } from '@/common/members/member'
import { EventLog, EventLogActor, EventLogOutcomeBar, EventLogNumber } from '@/common/event-log/EventLog'
import gameEventLog from '@/common/event-log/gameEventLog.module.css'
import { DefinableWord } from '@/common/definitions/DefinableWord'
import { useEventLogPlayerPicker } from '@/common/event-log/useEventLogPlayerPicker'
import { ANSWER_OUTCOME } from '../lib/answer'
import type { EventRow } from '../hooks/useGame'
import styles from './GameEventLog.module.css'

/**
 * scrabble's move log — the shared `<EventLog>` table (same chrome the other v3
 * games use). Each play is its OWN single `<tr>` (the shared layer no longer owns
 * row shape — docs/playarea.md → Event log): the outcome bar (green for a
 * played word, neutral for an exchange, a pass or a coop forfeit — the words
 * `lib/answer.ts` gives the row's `kind`), the turn
 * number ("#N", the shared `<EventLogNumber>`), the move in `.main`, and the
 * actor right-aligned in `<EventLogActor>`. Newest at the bottom; the shared
 * `<EventLog>` auto-snaps to the latest row.
 *
 * A word reads "+<score> <WORD> …" — the score green, each word bold and
 * **clickable to define** (the shared DefinitionPopover → common.words/Wiktionary
 * lookup every word game gets). Public in both modes (every committed word is on
 * the shared board, which is public).
 *
 * **Whose moves** are shown is the shared `useEventLogPlayerPicker` dropdown, one
 * vocabulary across every event-log game. Two things are scrabble-specific:
 *
 *   - It defaults to the aggregate in BOTH modes (`competeSharesOneGame`). Even
 *     compete is one board everyone plays on, so "All" is what you're actually
 *     looking at; filtering to a player is the extra ("just my own plays").
 *   - **A bot is pickable like anyone.** It holds a profile and a
 *     `game_players` row, so its plays carry its user_id and "how did ada-bot
 *     play?" is a filter like any other, with no second id space.
 *
 * It ignores the hook's `boardIsShown`: scrabble's `#N` handle addresses a play
 * by the row's `id`, not by log position, so filtering can't misaddress it (unlike the
 * position-indexed logs, where a filtered row 3 isn't the board's turn 3).
 */
export function GameEventLog({
  plays,
  players,
  selfId,
  mode,
  historyId,
  onShowHistory,
}: {
  plays: EventRow[]
  players: Member[]
  selfId: string
  mode: 'coop' | 'compete'
  /** The turn currently open in the board viewer (highlights its row), or null. */
  historyId: number | null
  /** Open a turn in the board viewer (click a row). */
  onShowHistory: (id: number) => void
}) {
  const eventLogPicker = useEventLogPlayerPicker({
    // Humans and bots in one roster — the hook orders them (you first, then by
    // handle), so a bot takes its alphabetical place rather than being
    // segregated. It plays like anyone else; it reads back like anyone else.
    players,
    selfId,
    mode,
    // Every play is public here (the board is public), so no row is ever
    // RLS-hidden and the honest-hidden empty text can't apply.
    isTerminal: true,
    competeSharesOneGame: true,
    label: 'Whose moves to show',
    emptyLabel: 'No moves yet.',
  })
  const shown = plays.filter(
    (p) => eventLogPicker.showsEveryone || eventLogPicker.picked === p.user_id,
  )

  return (
    <EventLog heading="Turns" picker={eventLogPicker} shown={shown}>
      {shown.map((p, i) => (
        <tr key={p.id} className={gameEventLog.divider}>
          {/* The bar's word is `lib/answer.ts`'s — the log names none of its
              own, so it cannot disagree with a teammate's line about the same
              turn, which is exactly what a forfeit used to do. */}
          <EventLogOutcomeBar outcome={ANSWER_OUTCOME[p.kind]} />
          {/* Turn number — the row's position in the list on show; the shared
              handle opens that turn on the board viewer, addressed by the row's
              own id, and rings itself while it's open. */}
          <EventLogNumber
            n={i + 1}
            isOpenInHistory={historyId === p.id}
            onShowHistory={() => onShowHistory(p.id)}
          />
          <td className={gameEventLog.main}>
            {p.kind === 'word' && (
              <>
                <span className={styles.score}>+{p.score ?? 0}</span>{' '}
                {(p.words ?? []).map((w, i) => (
                  <span key={`${w}-${i}`}>
                    {i > 0 ? ' ' : ''}
                    <DefinableWord word={w} className={styles.word} />
                  </span>
                ))}
              </>
            )}
            {p.kind === 'exchange' && <span>Exchanged {p.tile_count} tiles</span>}
            {p.kind === 'pass' && <span>Passed</span>}
            {p.kind === 'leftovers' && (
              <>
                <span className={styles.scoreNeg}>{p.score}</span> tiles unplayed
              </>
            )}
          </td>
          <EventLogActor
            actor={players.find((m) => m.user_id === p.user_id)}
            fallback="someone"
          />
        </tr>
      ))}
    </EventLog>
  )
}
