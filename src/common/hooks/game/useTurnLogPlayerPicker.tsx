import { useState } from 'react'
import { orderSelfFirst } from '../../lib/game/peers'
import type { Member } from '../../lib/games'
import { FilterSelect } from '../../components/game/FilterSelect'

/** The minimum a row needs for this hook to filter it: who made it. */
type ActorRow = { user_id: string }

/** The two aggregate selections. Neither is a user id, so they can't collide. */
const ALL = 'all'
const TEAM = 'team'

export type TurnLogPlayerPicker<R extends ActorRow> = {
  /** The `<select>`, for `<TurnLog headerAction>`. */
  picker: React.ReactNode
  /** Rows narrowed to the current selection. */
  filter: (rows: readonly R[]) => R[]
  /** What's selected: a user id, or `'team'` / `'all'`. */
  picked: string
  /** True while an aggregate view (`Team` / `All`) is selected. */
  showsEveryone: boolean
  /**
   * True when the rows on show are the SAME sequence the board is replaying.
   * Only games with a turn-history viewer care: they make `#N` a live handle
   * when this is true and a plain number otherwise.
   *
   * Note this is FALSE whenever a single player is picked out of a shared,
   * multi-player coop game. The viewer indexes the log by position, so a
   * filtered list's row 3 isn't the board's turn 3 — offering the handle there
   * would replay the wrong turn. Coop's default `Team` keeps it live, which is
   * the common case, and a SOLO game is always live (its filter is a no-op).
   *
   * Games whose viewer addresses a turn by a stable id — scrabble by `seq`,
   * codenamesduet by `turn_number` — can't be misaddressed by filtering, so they
   * ignore this and leave the handle live throughout.
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
 * **One vocabulary, every turn-log game** (settled 2026-08-02):
 *
 *   solo     →  [ your handle ]
 *   co-op    →  [ Team, …every player by handle ]
 *   compete  →  [ All,  …every player by handle ]
 *
 * The aggregate comes first, and is the default everywhere EXCEPT compete —
 * there each player has their own board, so your own log is the thing you came
 * to read (`competeSharesOneGame` opts scrabble back out of that). The
 * per-player entries are for the times you want one thread out of the whole:
 * "what did Leah actually play?", or "just my own moves" in a game like scrabble
 * where the shared log interleaves everyone.
 *
 * **Players are named by handle, including you.** An earlier version labelled
 * the viewer "You", which made your own row read as a different KIND of thing
 * from everyone else's; a list of handles is one list. You're still ordered
 * first, and still the default in compete.
 *
 * Six things travel together here, and re-deriving any of them per game is how
 * they drift: the control, its default selection, the aggregate label (which
 * differs by mode), the row filter, whether `#N` may be a live history handle,
 * and the empty-state wording.
 *
 *     const who = useTurnLogPlayerPicker({ players, selfId, mode, isTerminal })
 *     const shown = who.filter(rows)
 *     <TurnLog headerAction={who.picker} empty={!shown.length} emptyText={who.emptyText}>
 */
export function useTurnLogPlayerPicker<R extends ActorRow>({
  players,
  selfId,
  mode,
  isTerminal,
  competeSharesOneGame = false,
  label = 'Whose turns to show',
  emptyLabel = 'Nothing yet.',
}: {
  players: Member[]
  selfId: string
  mode: 'coop' | 'compete'
  /** Distinguishes an RLS-hidden opponent log from a genuinely empty one. */
  isTerminal: boolean
  /**
   * True when compete is still ONE shared game. scrabble's race is turn-based on
   * a single public board, so `All` is literally what you're looking at and the
   * picker defaults there; the per-player entries are the extra ("just my own
   * plays"). Every other compete game gives each player their own private board,
   * where your own log is the thing you came to read — hence the default.
   */
  competeSharesOneGame?: boolean
  /** Override for a game whose rows aren't "turns" (wordle says "guesses"). */
  label?: string
  /** The empty line when nothing is HIDDEN — the honest-hidden case overrides it. */
  emptyLabel?: string
}): TurnLogPlayerPicker<R> {
  const ordered = orderSelfFirst(players, selfId)

  // A solo game has nobody to pick between: one player, one option, no
  // aggregate (a "Team" of one, or "All" of one, would be the same list twice).
  const solo = players.length < 2
  const aggregate = solo ? null : mode === 'coop' ? TEAM : ALL

  const viewerIsPlayer = players.some((p) => p.user_id === selfId)

  // The aggregate is the default in coop — it IS the shared game. In compete
  // your own board is what you're looking at, so that's the default there
  // (unless the whole race happens on one board — see competeSharesOneGame).
  const fallback = solo
    ? (ordered[0]?.user_id ?? '')
    : mode === 'coop'
      ? TEAM
      : competeSharesOneGame
        ? ALL
        : viewerIsPlayer
          ? selfId
          : ALL

  // State holds only what the USER picked; the default is DERIVED every render.
  // Freezing the default into `useState(initializer)` looked equivalent and
  // wasn't: the roster arrives asynchronously, so the first render often has
  // zero players, and the frozen default was then `''` — an option that exists
  // nowhere, which silently filtered the whole log to nothing once the players
  // landed. (Caught by codenamesduet-history.e2e, which flaked on the race.)
  // Deriving also means a selection that stops being offered — a player who
  // left — degrades to the default instead of showing an empty log forever.
  const [chosen, setChosen] = useState<string | null>(null)
  const offered = new Set<string>([
    ...(aggregate ? [aggregate] : []),
    ...players.map((p) => p.user_id),
  ])
  const picked = chosen !== null && offered.has(chosen) ? chosen : fallback

  // With no roster loaded yet there's nobody to filter BY, so show everything —
  // blanking the log for a frame would read as "nothing happened here".
  const showsEveryone = players.length === 0 || picked === TEAM || picked === ALL

  // FilterSelect, not <select>: a native dropdown holds the keyboard away from
  // the board and there is no event that reliably hands it back. Same control
  // the word-list filters use — see FilterSelect's docstring.
  const picker = (
    <FilterSelect
      label={label}
      value={picked}
      onChange={setChosen}
      options={[
        ...(aggregate ? [{ value: aggregate, label: aggregate === TEAM ? 'Team' : 'All' }] : []),
        // Players carry their identity disc; the Team/All aggregate above
        // doesn't, so FilterSelect indents it to match.
        ...ordered.map((p) => ({ value: p.user_id, label: p.username, dot: p.color })),
      ]}
    />
  )

  return {
    picker,
    filter: (rows) => (showsEveryone ? [...rows] : rows.filter((r) => r.user_id === picked)),
    picked,
    showsEveryone,
    // Live only when the shown rows are the board's whole sequence: a solo game
    // (the filter is a no-op — one player, one board), coop's shared Team view,
    // or — in compete, where the board IS one player's — your own.
    boardIsShown: solo || picked === TEAM || (mode === 'compete' && picked === selfId),
    emptyText:
      // Only a SINGLE opponent's log is honestly "hidden": an aggregate view
      // still carries my own rows mid-game, so an empty one really does mean
      // nobody has played.
      mode === 'compete' && !showsEveryone && picked !== selfId && !isTerminal
        ? 'Hidden until game ends.'
        : emptyLabel,
  }
}
