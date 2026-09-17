// cs-unmet

import type { Member } from '@/common/members/member'
import { memberById } from '@/common/members/memberList'
import { TurnLog, TurnLogActor, TurnLogBar, TurnLogNumber } from '@/common/turn-log/TurnLog'
import turnLog from '@/common/turn-log/TurnLog.module.css'
import { useTurnLogPlayerPicker } from '@/common/turn-log/useTurnLogPlayerPicker'
import type { EventRow } from '../hooks/useGame'
import { Card } from './Card'
import styles from './GameTurnLog.module.css'

/**
 * The game log — every claim and every hint, on the shared `<TurnLog>` (heading
 * + fixed-height bordered scroll box + table) so it reads like the other games'.
 *
 * **The cards ARE the row.** A set written out — "2 red striped diamonds, 1
 * green solid oval, 3 purple open squiggles" — is unreadable at a glance and
 * three lines long; three tiny cards say the same thing in a strip narrower
 * than a word. This is the one game whose log had to be pictures.
 *
 * A **claim** shows its three cards; a **hint** shows the one, two or three the
 * asker was shown, tagged so it can't be mistaken for a find.
 *
 * ── The heading counts, and why they are not a scoreboard ───────────────────
 * The heading tallies whatever the filter is showing — `Found: 7 · Hints: 3`
 * for everyone, the same two numbers scoped when you pick a player. That is the
 * shared `<WordList>`'s own behavior ("filters become a reading tool"), and it
 * is what replaced a per-player breakdown at the terminal: a breakdown is
 * PUSHED at the table whether or not anyone wanted the comparison, where a
 * filter is pulled by the person who went looking for it. Coop should not end
 * on a scoreboard nobody asked for.
 *
 * Compete's heading has no hints half, since there are none to count.
 */
export function GameTurnLog({
  events,
  players,
  selfId,
  mode,
  isTerminal,
  historyId,
  onShowHistory,
}: {
  /** Every event the viewer can see — claims and hints, oldest first. */
  events: EventRow[]
  players: Member[]
  selfId: string
  mode: 'coop' | 'compete'
  isTerminal: boolean
  /** The event currently open in the board viewer (highlights its row), or
   *  null. Identified by log POSITION — see lib/history.ts. */
  historyId: number | null
  onShowHistory: (index: number | null) => void
}) {
  const turnLogPicker = useTurnLogPlayerPicker<EventRow>({
    players,
    selfId,
    mode,
    isTerminal,
    // setgame's compete race happens on ONE shared board, like scrabble's — so
    // "All" is literally what you are looking at, and the per-player entries
    // are the extra rather than the default.
    competeSharesOneGame: true,
  })

  const shown = turnLogPicker.filter(events)
  const found = shown.filter((e) => e.kind === 'claim').length
  const hints = shown.filter((e) => e.kind === 'hint').length

  return (
    <TurnLog
      heading={mode === 'coop' ? `Found: ${found} · Hints: ${hints}` : `Found: ${found}`}
      picker={turnLogPicker}
      shown={shown}
    >
      {shown.map((event) => {
        // Numbered over the FULL log, not the filtered view: the number is the
        // turn's identity, and a filter must not renumber the game.
        //
        // Every row offers the viewer, whatever the filter — unlike the games
        // that gate it on `turnLogPicker.boardIsShown`. They have to, because their
        // snapshot is a fold over one player's own sequence; ours is the
        // `board_after` stored on the row itself, so any row can be opened
        // without knowing whose board it belonged to.
        const index = events.indexOf(event)
        return (
          <tr key={event.id} className={turnLog.turnLogDivider}>
            {/* `near` is the shared amber bar, and it is what stackdown
                already flags a logged help request with — a hint is neither a
                find nor a failure, but it is not NOTHING either, which is what
                the neutral gray said. */}
            <TurnLogBar outcome={event.kind === 'claim' ? 'won' : 'near'} />
            <TurnLogNumber
              n={index + 1}
              isOpenInHistory={historyId === index}
              onShowHistory={() => onShowHistory(index)}
            />
            <td className={styles.cards}>
              {event.kind === 'hint' && <span className={styles.hintTag}>Hint:</span>}
              <span className={styles.mini}>
                {event.cards.map((card) => (
                  <Card key={card} card={card} readOnly />
                ))}
              </span>
            </td>
            <TurnLogActor actor={memberById(players, event.user_id)} />
          </tr>
        )
      })}
    </TurnLog>
  )
}
