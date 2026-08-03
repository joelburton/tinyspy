import { type MouseEvent } from 'react'
import type { Member } from '../../common/lib/games'
import { cls } from '../../common/lib/util/cls'
import { memberById } from '../../common/lib/game/peers'
import { TurnLogActor } from '../../common/components/game/lists/TurnLogActor'
import { TurnLog, TurnLogBar, TurnLogNumber, type TurnOutcome } from '../../common/components/game/lists/TurnLog'
import turnLog from '../../common/components/game/lists/TurnLog.module.css'
import { useDefinePopover } from '../../common/hooks/definitions/useDefinePopover'
import { useTurnLogPlayerPicker } from '../../common/hooks/game/useTurnLogPlayerPicker'
import type { SubmissionRow } from '../hooks/useGame'
import styles from './GameTurnLog.module.css'

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
 * Every row names its player (the shared `<ActorTag>`), unconditionally — the
 * v3 log shape. **Whose rows** are shown is picked by the shared
 * `useTurnLogPlayerPicker` dropdown in the header, one vocabulary across every
 * turn-log game: solo is your handle, coop is "Team" plus each player, compete
 * is "All" plus each player. In compete an opponent's rows are RLS-hidden during
 * play and open at terminal, which is what the picker's empty text says.
 *
 * Click-to-define: a valid (real) word opens the shared `DefinitionPopover` (the
 * common read-through cache → Wiktionary lookup every word game gets). Invalid
 * attempts aren't real words, so they stay inert.
 */
export function GameTurnLog({
  submissions,
  players,
  selfId,
  mode,
  isTerminal,
  viewingIndex,
  onSelectTurn,
}: {
  /** Every submission the viewer can see. Coop: the whole shared game. Compete:
   *  the viewer's own during play, and (once terminal, when RLS opens) everyone's. */
  submissions: SubmissionRow[]
  players: Member[]
  selfId: string
  mode: 'coop' | 'compete'
  /** Distinguishes an opponent's RLS-hidden log from a genuinely empty one. */
  isTerminal: boolean
  /** The turn currently open in the board viewer (highlights its row), or null.
   *  Identified by log POSITION, not seq — stackdown's seq is per-user (see
   *  lib/history). */
  viewingIndex: number | null
  /** Open a turn in the board viewer (click any row — words, misses, cheats). */
  onSelectTurn: (index: number) => void
}) {
  const who = useTurnLogPlayerPicker<SubmissionRow>({
    players,
    selfId,
    mode,
    isTerminal,
    emptyLabel: 'No words yet.',
  })
  const shown = who.filter(submissions)

  // Click-to-define plumbing (a common feature — see common/hooks/definitions/useDefinePopover).
  const { define: openDefine, popover } = useDefinePopover()

  // Click / keyboard activation for a clickable word chip (mirrors
  // spellingbee's WordList — same "Click to define" affordance). stopPropagation
  // so defining a word doesn't ALSO open that row's turn viewer.
  // Pointer-only, deliberately: NOT focusable, no `role="button"`. See
  // common/theme.css → `.definable` for why every definable word is like this.
  const defineActivation = (word: string) => ({
    onClick: (e: MouseEvent<HTMLSpanElement>) => {
      e.stopPropagation()
      openDefine(word, e.currentTarget)
    },
    title: 'Click to define',
  })

  return (
    <>
      <TurnLog
        heading="Turns"
        headerAction={who.picker}
        empty={shown.length === 0}
        emptyText={who.emptyText}
        scrollKey={shown.length}
      >
        {shown.map((s, i) => {
          const isRequest = s.kind === 'hint' || s.kind === 'reveal'
          const outcome: TurnOutcome = isRequest
            ? 'partial' // amber bar — a logged cheat request
            : s.valid
              ? 'good'
              : 'bad'
          return (
            // Every submission is its own one-row "turn"; the divider draws the
            // between-rows line (:first-child suppresses it on the first row). The
            // "#N" handle opens that turn on the board viewer (words / misses /
            // cheats all viewable), keyed by log POSITION — stackdown's seq is
            // per-user (see lib/history).
            <tr key={`${s.user_id}-${s.seq}`} className={turnLog.turnLogDivider}>
              <TurnLogBar outcome={outcome} />
              {/* The "#N" handle opens that turn on the board viewer — live only
                  when the rows on show ARE the board's sequence. The viewer
                  indexes by log POSITION, so a filtered list's row 3 isn't the
                  board's turn 3; there it degrades to a plain number. */}
              {who.boardIsShown ? (
                <TurnLogNumber
                  n={i + 1}
                  viewing={viewingIndex === i}
                  onSelect={() => onSelectTurn(i)}
                />
              ) : (
                <td className={turnLog.meta}>#{i + 1}</td>
              )}
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
              <TurnLogActor actor={memberById(players, s.user_id)} />
            </tr>
          )
        })}
      </TurnLog>

      {popover}
    </>
  )
}
