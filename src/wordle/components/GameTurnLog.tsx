import { useState } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { ActorTag } from '../../common/components/ActorTag'
import { cls } from '../../common/lib/cls'
import { memberById, orderSelfFirst } from '../../common/lib/peers'
import { useDefinePopover } from '../../common/hooks/useDefinePopover'
import { TurnLog, TurnLogBar } from '../../common/components/TurnLog'
import turnLog from '../../common/components/TurnLog.module.css'
import type { Member } from '../../common/lib/games'
import { tileColor } from '../lib/colors'
import type { WordleGuess } from '../hooks/useGame'
import styles from './GameTurnLog.module.css'

type Props = {
  /** Every guess the viewer can currently see, in order. Coop: the whole shared
   *  board. Compete: the viewer's own during play, and (once terminal, when RLS
   *  opens) everyone's — which is what makes the opponent picker below useful. */
  guesses: WordleGuess[]
  players: Member[]
  selfId: string
  mode: 'coop' | 'compete'
  /** Terminal yet? Distinguishes an opponent's RLS-hidden log (during play) from
   *  a genuinely empty one (at terminal, when their guesses reveal). */
  isTerminal: boolean
}

/**
 * wordle's turn log — each guess is one `<tr>` in the shared `<TurnLog>` table
 * (named GameTurnLog like the other games' logs; a wordle turn IS a guess).
 *
 * Each row composes the shared atoms: the outcome bar, the guess number, the
 * guess as its five colored letter-squares, and the guesser's identity.
 *   - **outcome bar** — `neutral` for an ordinary guess (a non-winning guess is
 *     progress, not pass/fail), `good` (green) only on the guess that solves it.
 *   - **`#n`** — the log position (`turnLog.meta`, muted).
 *   - **the squares** — the guess + its g/y/x feedback; the row's headline, so it
 *     takes the slack-absorbing `turnLog.main` column (keeping `who` snug right).
 *   - **who** — the guesser's `<ActorTag>` in the right-aligned `turnLog.who`
 *     column, so the identity discs line up down the log.
 *
 * The who column is rendered **unconditionally**, like every other v3 turn log:
 * in compete, RLS scopes `guesses` to the caller, so it simply shows the viewer's
 * own identity on each row.
 *
 * **Whose guesses** are shown is picked by a small dropdown in the header
 * (right-aligned, kept understated — a rarely-used control). A coop game with 2+
 * players is one shared "Team". Every other case lists the actual players (the
 * viewer first + default when they're playing, labelled "You"; a spectating club
 * member instead sees the player's name and defaults to them). Compete is the
 * "see opponents' boards" affordance — an opponent's rows are empty during play
 * (RLS hides them) and fill in once the game ends and their guesses reveal.
 */
export function GameTurnLog({ guesses, players, selfId, mode, isTerminal }: Props) {
  // Coop with 2+ players is one shared board → a single "Team" option. Every
  // OTHER case (compete, or a SOLO coop game) lists the actual players, so a
  // viewer — including a club member spectating — can pick whose board to see.
  const teamView = mode === 'coop' && players.length >= 2

  const ordered = orderSelfFirst(players, selfId)
  const viewerIsPlayer = players.some((p) => p.user_id === selfId)
  // Whose guesses the log shows. Default to the viewer's own board when they're a
  // player; for a spectator (a club member not in the game), default to the first
  // listed player (the only one, in a solo game). The "Team" view ignores this.
  const [picked, setPicked] = useState(
    viewerIsPlayer ? selfId : (ordered[0]?.user_id ?? ''),
  )

  const shown = teamView ? guesses : guesses.filter((g) => g.user_id === picked)

  // Click-to-define (a common feature — see common/hooks/useDefinePopover). Every
  // wordle guess is a legal dictionary word, so the whole guess is definable — the
  // affordance rides the WORD (the five-square group), not the individual cells, so
  // one click looks up the guess. Guesses are stored lowercase, which the lookup wants.
  const { define, popover } = useDefinePopover()
  const defineProps = (word: string) => ({
    className: cls(styles.squares, styles.definable),
    role: 'button' as const,
    tabIndex: 0,
    title: 'Click to define',
    onClick: (e: MouseEvent<HTMLSpanElement>) => define(word, e.currentTarget),
    onKeyDown: (e: KeyboardEvent<HTMLSpanElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        define(word, e.currentTarget)
      }
    },
  })

  // In compete an opponent's guesses are RLS-hidden until the game ends, so an
  // empty log for a player who isn't me means "hidden", not "none made" (they're
  // present and guessing; pause guarantees presence). At terminal their rows
  // reveal, so an empty log then really is "no guesses". Coop is club-readable,
  // so this only applies to compete.
  const emptyText =
    mode === 'compete' && picked !== selfId && !isTerminal
      ? 'Hidden until game ends.'
      : 'No guesses yet.'

  const picker = (
    <select
      className={styles.whoSelect}
      aria-label="Whose guesses to show"
      value={teamView ? 'team' : picked}
      onChange={(e) => setPicked(e.target.value)}
    >
      {teamView ? (
        <option value="team">Team</option>
      ) : (
        ordered.map((p) => (
          <option key={p.user_id} value={p.user_id}>
            {p.user_id === selfId ? 'You' : p.username}
          </option>
        ))
      )}
    </select>
  )

  return (
    <>
    <TurnLog
      heading="Guesses"
      headerAction={picker}
      empty={shown.length === 0}
      emptyText={emptyText}
      scrollKey={shown}
    >
      {shown.map((g, i) => (
        <tr key={`${g.user_id}-${g.guess_index}`} className={turnLog.turnLogDivider}>
          <TurnLogBar outcome={g.is_correct ? 'good' : 'neutral'} />
          <td className={turnLog.meta}>#{i + 1}</td>
          <td className={turnLog.main}>
            <span {...defineProps(g.guess)}>
              {[...g.guess].map((ch, c) => (
                <span key={c} className={cls(styles.sq, styles[tileColor(g.colors[c])])}>
                  {ch.toUpperCase()}
                </span>
              ))}
            </span>
          </td>
          <td className={turnLog.who}>
            <ActorTag actor={memberById(players, g.user_id)} />
          </td>
        </tr>
      ))}
    </TurnLog>
    {popover}
    </>
  )
}
