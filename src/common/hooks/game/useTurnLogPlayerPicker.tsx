import { useState } from 'react'
import { orderSelfFirst } from '../../lib/game/peers'
import type { Member } from '../../lib/games'
import styles from '../../components/game/lists/TurnLog.module.css'

/** The minimum a row needs for this hook to filter it: who made it. */
type ActorRow = { user_id: string }

/** The compete "everyone" selection. Not a user id, so it can't collide. */
const ALL = 'all'

export type TurnLogPlayerPicker<R extends ActorRow> = {
  /** The `<select>`, for `<TurnLog headerAction>`. */
  picker: React.ReactNode
  /** Rows narrowed to the current selection (all of them in the Team view). */
  filter: (rows: readonly R[]) => R[]
  /** Whose log is showing: a user id, `'all'` (compete's everyone view), or
   *  meaningless while `teamView` is true. */
  picked: string
  /** Coop with 2+ players: one shared board, so one "Team" option. */
  teamView: boolean
  /**
   * True when the rows on show are the SAME board the main surface is
   * replaying — the team board, or my own. Only games with a turn-history
   * viewer care: they make `#N` a live handle when this is true and a plain
   * number otherwise (an opponent's rows can't drive MY board). Games without
   * a viewer ignore it.
   */
  boardIsShown: boolean
  /**
   * The empty-state line, which has to stay HONEST. In compete, RLS hides an
   * opponent's rows until the game ends — so an empty opponent log mid-game
   * means "hidden", not "they haven't played". At terminal their rows reveal
   * and empty really is empty.
   */
  emptyText: string
}

/**
 * The "whose turns am I looking at?" dropdown for a `<TurnLog>`, plus the
 * filtering and the honesty rules that travel with it.
 *
 * Shipped first in wordle and extracted when wordiply became the second
 * consumer. Six pieces have to move together or a caller gets a subtly wrong
 * log: the control, its default selection, the coop-is-one-team collapse, the
 * row filter, whether `#N` may be a live history handle, and the empty-state
 * wording. Re-deriving any of those per game is how they drift.
 *
 *     const who = useTurnLogPlayerPicker({ players, selfId, mode, isTerminal })
 *     const shown = who.filter(guesses)
 *     <TurnLog headerAction={who.picker} empty={!shown.length} emptyText={who.emptyText}>
 *
 * **The default selection is the interesting bit.** A player sees their own log
 * first (labelled "You"). A club member *spectating* a game they're not in has
 * no "own" log, so they default to the first listed player — which in a solo
 * game is the only one, and is why the control still makes sense there.
 */
export function useTurnLogPlayerPicker<R extends ActorRow>({
  players,
  selfId,
  mode,
  isTerminal,
  label = 'Whose turns to show',
  emptyLabel = 'Nothing yet.',
}: {
  players: Member[]
  selfId: string
  mode: 'coop' | 'compete'
  /** Distinguishes an RLS-hidden opponent log from a genuinely empty one. */
  isTerminal: boolean
  /** Override for a game whose rows aren't "turns" (wordle says "guesses"). */
  label?: string
  /** The empty line when nothing is HIDDEN — the honest-hidden case overrides it. */
  emptyLabel?: string
}): TurnLogPlayerPicker<R> {
  // Coop with 2+ players is ONE shared board, so there's nothing to pick
  // between — collapse to a single "Team" option. Every other case (compete,
  // or a solo coop game) lists the real players.
  const teamView = mode === 'coop' && players.length >= 2

  const ordered = orderSelfFirst(players, selfId)
  const viewerIsPlayer = players.some((p) => p.user_id === selfId)
  const [picked, setPicked] = useState(
    viewerIsPlayer ? selfId : (ordered[0]?.user_id ?? ''),
  )

  // Compete lists everyone's runs at once as well as one at a time. NOT offered
  // in coop: "Team" already IS everyone, so an "All" beside it would be the same
  // list under two names. Multi-player only — with one player it'd duplicate
  // "You".
  const offersAll = mode === 'compete' && players.length >= 2
  const isAll = offersAll && picked === ALL

  const picker = (
    <select
      className={styles.whoSelect}
      aria-label={label}
      value={teamView ? 'team' : picked}
      onChange={(e) => setPicked(e.target.value)}
    >
      {teamView ? (
        <option value="team">Team</option>
      ) : (
        <>
          {offersAll && <option value={ALL}>All</option>}
          {ordered.map((p) => (
            <option key={p.user_id} value={p.user_id}>
              {p.user_id === selfId ? 'You' : p.username}
            </option>
          ))}
        </>
      )}
    </select>
  )

  return {
    picker,
    filter: (rows) =>
      teamView || isAll ? [...rows] : rows.filter((r) => r.user_id === picked),
    picked,
    teamView,
    // "All" is nobody's board in particular, so a history handle would have
    // nothing to open — same as picking an opponent.
    boardIsShown: teamView || picked === selfId,
    emptyText:
      // Only a SINGLE opponent's log is honestly "hidden": the All view still
      // carries my own rows mid-game (RLS gives me those), so an empty All view
      // really does mean nobody has played yet.
      mode === 'compete' && !isAll && picked !== selfId && !isTerminal
        ? 'Hidden until game ends.'
        : emptyLabel,
  }
}
