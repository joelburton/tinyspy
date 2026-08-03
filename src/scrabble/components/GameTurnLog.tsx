import { type MouseEvent } from 'react'
import type { Member } from '../../common/lib/games'
import { cls } from '../../common/lib/util/cls'
import { TurnLogActor } from '../../common/components/game/lists/TurnLogActor'
import { TurnLog, TurnLogBar, TurnLogNumber, type TurnOutcome } from '../../common/components/game/lists/TurnLog'
import turnLog from '../../common/components/game/lists/TurnLog.module.css'
import { useDefinePopover } from '../../common/hooks/definitions/useDefinePopover'
import { useTurnLogPlayerPicker } from '../../common/hooks/game/useTurnLogPlayerPicker'
import type { PlayRow } from '../hooks/useGame'
import styles from './GameTurnLog.module.css'

/** A bot's stand-in user id — matches `aiMemberOfSeat`'s synthetic Member. */
const aiId = (seat: number | null) => `ai:${seat}`

/**
 * scrabble's move log — the shared `<TurnLog>` table (same chrome the other v3
 * games use). Each play is its OWN single `<tr>` (the shared layer no longer owns
 * row shape — docs/playarea.md → Turn log): the outcome bar (green for a
 * played word, neutral for an exchange / pass, red for a coop forfeit), the turn
 * number ("#<seq>") in the muted `.meta` column, the move in `.main`, and the
 * actor's `<ActorTag>` right-aligned in `.who`. Newest at the bottom; the shared
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
 *   - **AI seats are pickable people.** A bot's play has `user_id: null`, so the
 *     rows are keyed by a synthetic `ai:<seat>` id — the same one `aiMemberOfSeat`
 *     mints — which lets "how did AI 1 play?" be a filter like any other.
 *
 * It ignores the hook's `boardIsShown`: scrabble's `#N` handle addresses a play
 * by `seq`, not by log position, so filtering can't misaddress it (unlike the
 * position-indexed logs, where a filtered row 3 isn't the board's turn 3).
 */
export function GameTurnLog({
  plays,
  players,
  aiMembers,
  aiMemberOfSeat,
  selfId,
  mode,
  viewingSeq,
  onSelectTurn,
}: {
  plays: PlayRow[]
  players: Member[]
  /** The bots at the table (compete only), as pickable actors. */
  aiMembers: Member[]
  /** Resolve an AI seat's play (user_id null) to its "AI n" actor. */
  aiMemberOfSeat: (seat: number | null) => Member | undefined
  selfId: string
  mode: 'coop' | 'compete'
  /** The turn currently open in the board viewer (highlights its row), or null. */
  viewingSeq: number | null
  /** Open a turn in the board viewer (click a row). */
  onSelectTurn: (seq: number) => void
}) {
  const who = useTurnLogPlayerPicker({
    // Humans and bots in one roster — the hook orders them (you first, then by
    // handle), so a bot takes its alphabetical place rather than being
    // segregated. It plays like anyone else; it reads back like anyone else.
    players: [...players, ...aiMembers],
    selfId,
    mode,
    // Every play is public here (the board is public), so no row is ever
    // RLS-hidden and the honest-hidden empty text can't apply.
    isTerminal: true,
    competeSharesOneGame: true,
    label: 'Whose moves to show',
    emptyLabel: 'No moves yet.',
  })
  // Filtered by hand rather than through `who.filter`, because a bot's play has
  // `user_id: null` and the row's identity is `user_id ?? ai:<seat>`. Reading
  // `picked` / `showsEveryone` keeps the ONE selection the hook owns without
  // rewriting every row just to give it a synthetic id.
  const shown = plays.filter(
    (p) => who.showsEveryone || who.picked === (p.user_id ?? aiId(p.seat)),
  )

  // Click-to-define plumbing (a common feature — see common/hooks/definitions/useDefinePopover).
  // Words display uppercase in the log; the lookup wants them lowercase.
  const { define, popover } = useDefinePopover()
  const openDefine = (word: string, el: HTMLElement) => define(word.toLowerCase(), el)
  // Pointer-only, deliberately: NOT focusable, no `role="button"`. See
  // common/theme.css → `.definable` for why every definable word is like this.
  const defineProps = (word: string) => ({
    className: cls(styles.word, 'definable'),
    title: 'Click to define',
    // stopPropagation so defining a word doesn't ALSO open the row's turn viewer.
    onClick: (e: MouseEvent<HTMLSpanElement>) => {
      e.stopPropagation()
      openDefine(word, e.currentTarget)
    },
  })

  const outcomeFor = (kind: PlayRow['kind']): TurnOutcome =>
    kind === 'word' ? 'good' : kind === 'forfeit' ? 'bad' : 'neutral'

  return (
    <>
    <TurnLog
      heading="Turns"
      headerAction={who.picker}
      empty={shown.length === 0}
      emptyText={who.emptyText}
      scrollKey={shown.length}
    >
      {shown.map((p) => (
        <tr key={p.seq} className={turnLog.turnLogDivider}>
          <TurnLogBar outcome={outcomeFor(p.kind)} />
          {/* Turn number — the play's 1-based seq; the shared handle opens that
              turn on the board viewer and rings itself yellow while it's open. */}
          <TurnLogNumber
            n={p.seq}
            viewing={viewingSeq === p.seq}
            onSelect={() => onSelectTurn(p.seq)}
          />
          <td className={turnLog.main}>
            {p.kind === 'word' && (
              <>
                <span className={styles.score}>+{p.score ?? 0}</span>{' '}
                {(p.words ?? []).map((w, i) => (
                  <span key={`${w}-${i}`}>
                    {i > 0 ? ' ' : ''}
                    <span {...defineProps(w)}>{w.toUpperCase()}</span>
                  </span>
                ))}
              </>
            )}
            {p.kind === 'exchange' && <span>Exchanged {p.tile_count} tiles</span>}
            {p.kind === 'pass' && <span>Passed</span>}
            {p.kind === 'forfeit' && (
              <>
                <span className={styles.scoreNeg}>{p.score}</span> tiles unplayed
              </>
            )}
          </td>
          <TurnLogActor
            actor={p.user_id ? players.find((m) => m.user_id === p.user_id) : aiMemberOfSeat(p.seat)}
            fallback="someone"
          />
        </tr>
      ))}
    </TurnLog>
      {popover}
    </>
  )
}
