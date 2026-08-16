import { lazy } from 'react'
import type { CommonGameListRow, GameManifest } from '../common/lib/games'
import { deckSize } from './lib/cards'
import { CLAIM_SIZE } from './lib/selection'
import { db } from './db'
import { count, outcome, statusLine, wonBy } from '../common/lib/game/statusLabel'
import { makeRpcDispatcher } from '../common/lib/game/manifestRpcs'
import {
  DEFAULT_SETGAME_SETUP_COMPETE,
  DEFAULT_SETGAME_SETUP_COOP,
  setgameSetupError,
  type SetgameSetup,
} from './lib/setup'
import logoUrl from './logo.svg?url'

/**
 * setgame's registration with the shell — **two manifests, one schema, one
 * folder.**
 *
 * "setgame" is the codename for our Set-style card game: eighty-one cards over
 * four ternary attributes, and a claim is three of them that are all-same or
 * all-different in every attribute. The codename is `setgame` rather than `set`
 * because `set` is a Postgres keyword, a TypeScript builtin, and on
 * docs/naming.md's banned-generic list. The user-facing brand is
 * **HareTrigger** (the `BRAND` const below).
 *
 * Both manifests share the same `PlayArea`, `SetupForm`, `Help`, `useGame` and
 * CSS. The mode branches at render time on `game.mode` (read from
 * `setgame.games_state.mode`). The sibling-manifest pattern's canonical
 * write-up is in [`docs/games/psychicnum.md`](../../docs/games/psychicnum.md).
 */

const helpLoader = lazy(() =>
  import('./components/Help').then((m) => ({ default: m.Help })),
)

const playAreaLoader = lazy(() =>
  import('./components/PlayArea').then((m) => ({ default: m.PlayArea })),
)

const setupFormLoader = lazy(() =>
  import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
)

/**
 * Shared start-game caller. There is no board-builder edge function — a board
 * is a shuffle, so `setgame.create_game` deals it inline (and runs the
 * deal-three rule before anyone sees the table).
 */
function startGameInClubFactory(mode: 'coop' | 'compete', brand: string) {
  return async (clubHandle: string, setup: unknown, playerUserIds: string[]) => {
    const { data, error } = await db
      .rpc('create_game', {
        target_club: clubHandle,
        setup: setup as SetgameSetup,
        player_user_ids: playerUserIds,
        mode,
      })
      .single()
    if (error || !data) {
      return { error: error ?? { message: `failed to start ${brand} (${mode})`, answered: true as const } }
    }
    return { id: data.id }
  }
}

const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const endGame = makeRpcDispatcher(db, 'end_game')

type StatusBlob = Record<string, unknown>
type LeaderRow = { user_id?: string; username?: string; sets_found?: number; won?: boolean }

/**
 * The single source of truth for this game's user-facing brand name. Both
 * sibling manifests set `name: BRAND`. The codename (`setgame`) is unrelated
 * and stays lowercase everywhere in code.
 */
const BRAND = 'HareTrigger'

/**
 * COOP's club-list label: how many sets the table has taken, and how much game
 * is left. Both public — every claim happened face-up — so unlike wordle's or
 * stackdown's compete labels there is nothing to withhold.
 */
function coopLabel(row: CommonGameListRow): string {
  const s = (row.status ?? {}) as StatusBlob
  const sets = (s.sets_found as number | undefined) ?? 0
  const left = (s.deck_left as number | undefined) ?? 0
  // Cards left on the table, DERIVED: at the natural end the deck is spent, so
  // every card is either claimed or still lying there. Nothing records it —
  // a stored copy would be one more thing a replay could leave stale.
  const setup = (row.setup ?? {}) as { deck?: 'full' | 'junior' }
  const perfectClear = sets * CLAIM_SIZE === deckSize(setup.deck ?? 'full')

  if (row.play_state === 'playing') {
    return statusLine(outcome('Playing'), count(sets, 'set'), `${left} in the deck`)
  }
  if (row.play_state === 'won') {
    // No count of the cards left behind — see buildOver in components/PlayArea.
    // A full clear is genuinely rare (~2% of games) and worth naming; every
    // other win is the normal one and says only what was found.
    return statusLine(
      outcome('Won'),
      count(sets, 'set'),
      perfectClear ? 'perfect clear' : null,
    )
  }
  if (row.play_state === 'lost') {
    return statusLine(outcome('Lost', 'out of time'), count(sets, 'set'))
  }
  return statusLine(outcome('Ended'), count(sets, 'set'))
}

/**
 * COMPETE's label. The race does NOT end on anyone finishing — nobody finishes
 * alone; the deck running dry ends it for everybody — so a win names the player
 * with the most sets, and a tie names nobody (co-winners).
 */
function competeLabel(row: CommonGameListRow): string {
  const s = (row.status ?? {}) as StatusBlob
  const leaderboard = (s.leaderboard as LeaderRow[] | undefined) ?? []
  const sets = (s.sets_found as number | undefined) ?? 0

  if (row.play_state === 'playing') {
    const left = (s.deck_left as number | undefined) ?? 0
    return statusLine(outcome('Playing'), count(sets, 'set'), `${left} in the deck`)
  }
  if (row.play_state === 'won_compete') {
    const winners = leaderboard.filter((e) => e.won)
    const top = winners[0]?.sets_found ?? 0
    if (winners.length > 1) {
      // No speed tiebreak exists here, so ties are real and get their own
      // sentence rather than an arbitrarily-picked name.
      return statusLine(
        outcome('Won', 'tied'),
        winners.map((w) => w.username ?? 'someone').join(' & '),
        count(top, 'set'),
      )
    }
    return statusLine(wonBy(winners[0]?.username ?? (s.winner_username as string | undefined)), count(top, 'set'))
  }
  if (row.play_state === 'lost_compete') {
    return statusLine(
      outcome('Lost', s.outcome === 'conceded' ? 'all conceded' : null),
      'nobody scored',
    )
  }
  return statusLine(outcome('Ended'), count(sets, 'set'))
}

export const setgameCoopGame: GameManifest = {
  gametype: 'setgame_coop',
  schema: 'setgame',
  baseGametype: 'setgame',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Spot the sets together, and clear the deck',
  logoUrl,

  help: helpLoader,

  // Plays solo (1 player in their solo club) or coop (up to 6). Must agree with
  // the player-count guard in setgame.create_game.
  numberOfPlayers: [1, 6],

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_SETGAME_SETUP_COOP,
    validate: (setup) => setgameSetupError(setup as SetgameSetup),
  },

  startGameInClub: startGameInClubFactory('coop', BRAND),

  labelFor: (row) => coopLabel(row),

  submitTimeout,
  endGame,
}

export const setgameCompeteGame: GameManifest = {
  gametype: 'setgame_compete',
  schema: 'setgame',
  baseGametype: 'setgame',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Same table, same deck — claim more sets than anyone',
  logoUrl,

  help: helpLoader,

  // Compete needs an opposing PLAYER. The RPC enforces >= 2 too.
  numberOfPlayers: [2, 6],

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_SETGAME_SETUP_COMPETE,
    validate: (setup) => setgameSetupError(setup as SetgameSetup),
  },

  startGameInClub: startGameInClubFactory('compete', BRAND),

  labelFor: (row) => competeLabel(row),

  submitTimeout,
  endGame,
}
