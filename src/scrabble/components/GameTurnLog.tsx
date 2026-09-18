// cs-fixed-outcome-fix

import type { Member } from '@/common/members/member'
import { TurnLog, TurnLogActor, TurnLogOutcomeBar, TurnLogNumber } from '@/common/turn-log/TurnLog'
import gameTurnLog from '@/common/turn-log/gameTurnLog.module.css'
import { DefinableWord } from '@/common/definitions/DefinableWord'
import { useTurnLogPlayerPicker } from '@/common/turn-log/useTurnLogPlayerPicker'
import { ANSWER_OUTCOME } from '../lib/answer'
import type { PlayRow } from '../hooks/useGame'
import styles from './GameTurnLog.module.css'

/**
 * scrabble's move log — the shared `<TurnLog>` table (same chrome the other v3
 * games use). Each play is its OWN single `<tr>` (the shared layer no longer owns
 * row shape — docs/playarea.md → Turn log): the outcome bar (green for a
 * played word, neutral for an exchange, a pass or a coop forfeit — the words
 * `lib/answer.ts` gives the row's `kind`), the turn
 * number ("#N", the shared `<TurnLogNumber>`), the move in `.main`, and the
 * actor right-aligned in `<TurnLogActor>`. Newest at the bottom; the shared
 * `<TurnLog>` auto-snaps to the latest row.
 *
 * A word reads "+<score> <WORD> …" — the score green, each word bold and
 * **clickable to define** (the shared DefinitionPopover → common.words/Wiktionary
 * lookup every word game gets). Public in both modes (every committed word is on
 * the shared board, which is public).
 *
 * **Whose moves** are shown is the shared `useTurnLogPlayerPicker` dropdown, one
 * vocabulary across every turn-log game. Two things are scrabble-specific:
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
export function GameTurnLog({
  plays,
  players,
  selfId,
  mode,
  historyId,
  onShowHistory,
}: {
  plays: PlayRow[]
  players: Member[]
  selfId: string
  mode: 'coop' | 'compete'
  /** The turn currently open in the board viewer (highlights its row), or null. */
  historyId: number | null
  /** Open a turn in the board viewer (click a row). */
  onShowHistory: (id: number) => void
}) {
  const turnLogPicker = useTurnLogPlayerPicker({
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
    (p) => turnLogPicker.showsEveryone || turnLogPicker.picked === p.user_id,
  )

  return (
    <TurnLog heading="Turns" picker={turnLogPicker} shown={shown}>
      {shown.map((p, i) => (
        <tr key={p.id} className={gameTurnLog.divider}>
          {/* The bar's word is `lib/answer.ts`'s — the log names none of its
              own, so it cannot disagree with a teammate's line about the same
              turn, which is exactly what a forfeit used to do. */}
          <TurnLogOutcomeBar outcome={ANSWER_OUTCOME[p.kind]} />
          {/* Turn number — the row's position in the list on show; the shared
              handle opens that turn on the board viewer, addressed by the row's
              own id, and rings itself while it's open. */}
          <TurnLogNumber
            n={i + 1}
            isOpenInHistory={historyId === p.id}
            onShowHistory={() => onShowHistory(p.id)}
          />
          <td className={gameTurnLog.main}>
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
          <TurnLogActor
            actor={players.find((m) => m.user_id === p.user_id)}
            fallback="someone"
          />
        </tr>
      ))}
    </TurnLog>
  )
}
