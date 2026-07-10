import { type KeyboardEvent, type MouseEvent } from 'react'
import type { Member } from '../../common/lib/games'
import { cls } from '../../common/lib/util/cls'
import { TurnLogActor } from '../../common/components/game/lists/TurnLogActor'
import { TurnLog, TurnLogBar, TurnLogNumber, type TurnOutcome } from '../../common/components/game/lists/TurnLog'
import turnLog from '../../common/components/game/lists/TurnLog.module.css'
import { useDefinePopover } from '../../common/hooks/definitions/useDefinePopover'
import type { PlayRow } from '../hooks/useGame'
import styles from './GameTurnLog.module.css'

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
 */
export function GameTurnLog({
  plays,
  players,
  aiMemberOfSeat,
  viewingSeq,
  onSelectTurn,
}: {
  plays: PlayRow[]
  players: Member[]
  /** Resolve an AI seat's play (user_id null) to its "AI n" actor. */
  aiMemberOfSeat: (seat: number | null) => Member | undefined
  /** The turn currently open in the board viewer (highlights its row), or null. */
  viewingSeq: number | null
  /** Open a turn in the board viewer (click a row). */
  onSelectTurn: (seq: number) => void
}) {
  // Click-to-define plumbing (a common feature — see common/hooks/definitions/useDefinePopover).
  // Words display uppercase in the log; the lookup wants them lowercase.
  const { define, popover } = useDefinePopover()
  const openDefine = (word: string, el: HTMLElement) => define(word.toLowerCase(), el)
  const defineProps = (word: string) => ({
    className: cls(styles.word, 'definable'),
    role: 'button' as const,
    tabIndex: 0,
    title: 'Click to define',
    // stopPropagation so defining a word doesn't ALSO open the row's turn viewer.
    onClick: (e: MouseEvent<HTMLSpanElement>) => {
      e.stopPropagation()
      openDefine(word, e.currentTarget)
    },
    onKeyDown: (e: KeyboardEvent<HTMLSpanElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        e.stopPropagation()
        openDefine(word, e.currentTarget)
      }
    },
  })

  const outcomeFor = (kind: PlayRow['kind']): TurnOutcome =>
    kind === 'word' ? 'good' : kind === 'forfeit' ? 'bad' : 'neutral'

  return (
    <>
    <TurnLog heading="Turns" empty={plays.length === 0} emptyText="No moves yet." scrollKey={plays.length}>
      {plays.map((p) => (
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
