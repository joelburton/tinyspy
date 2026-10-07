// cs-blessed-connections

import { lazy } from 'react'
import { runRpc } from '@/common/supabase/dbResult'
import type { CreatedGame, GameManifest } from '@/common/manifest/gameManifest'
import { db } from './db'
import { count, verdict, statusLine, tally, wonBy } from '@/common/manifest/summary'
import type { EndingLabel } from '@/common/ending/endingLabel'
import { makeEndingLabel } from './lib/endingLabel'
import { makeRpcDispatcher } from '@/common/manifest/manifestRpcs'
import { findWinnerIds } from '@/common/manifest/summaryData'
import { findUsername } from '@/common/members/memberList'
import type { Member } from '@/common/members/member'
import { DEFAULT_CONNECTIONS_SETUP } from './lib/setup'
import { CATEGORY_COUNT, MISTAKE_BUDGET } from './lib/board'
import type { GSetup, GSummaryData } from './types'
import logoUrl from './logo.svg?url'

/**
 * connections' registration with the shell — two manifests, one schema, one
 * folder. "connections" is the codename; the brand is `BRAND` below.
 *
 * Coop and compete are each a row in `common.gametypes` (`connections_coop`,
 * `connections_compete`) and a Start button on the club page — the
 * sibling-manifest pattern, written up at
 * [`docs/common.md`](../../docs/common.md#the-sibling-manifest-pattern). The
 * two share the schema, every loader below and `baseGametype: 'connections'`;
 * they differ on `gametype`, `mode`, `numberOfPlayers` (coop plays solo,
 * compete needs an opponent) and `summaryFor`. The one `startGameInClub`
 * factory injects the mode, and `connections.create_game` routes on it. The
 * rules and the design are `doc.md`'s.
 */

// Help loader is shared — both modes link to the same rules modal.
// Lazy so the prose ships in connections' chunk.
const helpLoader = lazy(() =>
  import('./components/Help').then((m) => ({ default: m.Help })),
)

// PlayArea is shared; it reads `game.mode` off the row for what differs.
const playAreaLoader = lazy(() =>
  import('./components/PlayArea').then((m) => ({ default: m.PlayAreaLoader })),
)

// SetupForm is shared — the next-puzzle line, the date override and the
// timer, mode-independent. The mode is the Start button clicked, not a
// setup choice.
const setupFormLoader = lazy(() =>
  import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
)

// Shared start-game caller. `mode` is the per-manifest constant — the RPC
// routes on it. `setup` rides through untouched: with no `puzzle_id` in it,
// create_game derives the puzzle (doc.md → RPCs).
function startGameInClubFactory(mode: 'coop' | 'compete') {
  return async (
    clubHandle: string,
    setup: unknown,
    playerUserIds: string[],
  ) => {
    // No `.single()`: the RPC returns the envelope itself, one jsonb value.
    return runRpc<CreatedGame>(
      db.rpc('create_game', {
        p_club_handle: clubHandle,
        p_setup: setup as GSetup,
        p_player_user_ids: playerUserIds,
        p_mode: mode,
      }),
    )
  }
}

// Timeout + manual end — the shared one-arg RPC dispatchers (see
// common/manifest/manifestRpcs). submit_timeout is mode-aware server-side
// (writes 'lost' for coop, 'lost_compete' for compete) + idempotent.
const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const stopGame = makeRpcDispatcher(db, 'stop_game')

// The summary reads the game's `summary_data` (`GSummaryData`: the common
// part with its ending, and `team`, coop's counts, null in compete). Each
// mode's summaryFor handles its own endings.

/** The game's ending as an ending label reads it, from the summary. */
function makeGameFacts(summary: GSummaryData, mode: 'coop' | 'compete') {
  return { mode, ended: summary.ended, reason: summary.ending?.reason ?? null }
}

/** An ending label as the club line leads with it: the word, its detail in parentheses. */
function makeLead(endingLabel: EndingLabel) {
  return endingLabel.long === '' ? endingLabel.word : `${endingLabel.word} (${endingLabel.long})`
}

/**
 * COOP's club line: the categories and mistakes while it plays; once it ends,
 * the team's ending label (mine, when I played), then the mistakes on a win —
 * solving means every category, so the mistakes are the story — or the
 * categories found on any other ending.
 */
function makeCoopLabel(summary: GSummaryData, myId: string): string {
  // A coop game always has a team.
  const team = summary.team!
  // "categories", the game's own noun (doc.md → Vocabulary), throughout.
  const categories = tally(team.nMatchedCats, CATEGORY_COUNT, 'categories')
  if (summary.ending === null) {
    return statusLine(verdict('Playing'), categories, tally(team.nMistakes, MISTAKE_BUDGET, 'mistakes'))
  }
  const player = summary.players.find((p) => p.id === myId) ?? summary.players[0]!
  const endingLabel = makeEndingLabel(player, makeGameFacts(summary, 'coop'))!
  return statusLine(
    makeLead(endingLabel),
    summary.outcome === 'won' ? count(team.nMistakes, 'mistake') : categories,
  )
}

/**
 * COMPETE's club line carries no counts: each racer's are their own, and this
 * line is readable by the whole club (the builder writes null counts in compete
 * for the same reason). It leads with my ending label once I am out of play,
 * and names the winner once there is one.
 */
function makeCompeteLabel(summary: GSummaryData, members: readonly Member[], myId: string): string {
  const me = summary.players.find((p) => p.id === myId)
  const myEndingLabel = me === undefined ? null : makeEndingLabel(me, makeGameFacts(summary, 'compete'))
  if (summary.ending === null && myEndingLabel === null) return verdict('Playing')

  const winnerName = findUsername(members, findWinnerIds(summary).find((id) => id !== myId) ?? null)
  const noWinner = summary.outcome === 'lost' && summary.ending!.reason !== 'conceded'
    ? 'no winner'
    : null

  if (myEndingLabel !== null) {
    if (summary.outcome === 'won') {
      if (myEndingLabel.labelType === 'won') return makeLead(myEndingLabel)
      // Someone else won: name them, beside my concession or my own loss's
      // cause; a loss to their finish is said by naming them.
      return myEndingLabel.long === '' && myEndingLabel.labelType === 'lost'
        ? wonBy(winnerName)
        : statusLine(makeLead(myEndingLabel), wonBy(winnerName))
    }
    return statusLine(makeLead(myEndingLabel), noWinner)
  }

  // A member who did not play: the game's own result.
  switch (summary.outcome!) {
    case 'won':
      return wonBy(winnerName)
    case 'lost':
      return summary.ending!.reason === 'conceded'
        ? verdict('Lost', 'all conceded')
        : statusLine(verdict('Lost', summary.ending!.reason === 'timeout' ? 'out of time' : 'out of mistakes'), noWinner)
    case 'neutral':
      return 'Stopped'
    default:
      return summary.outcome!
  }
}

// The single source of truth for this game's user-facing brand name.
// Both sibling manifests set `name: BRAND`, and the start-game error
// reads it too — so a fork rebrands by editing this one line. The
// codename (`connections`) is unrelated and stays lowercase everywhere
// in code.
const BRAND = 'WordKnit'

export const connectionsCoopGame: GameManifest = {
  gametype: 'connections_coop',
  schema: 'connections',
  baseGametype: 'connections',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Find categories, like Connections',
  logoUrl,

  help: helpLoader,

  // Plays solo (1 player at their solo club) or coop (up to 6).
  // Must agree with the player-count guards in
  // connections.create_game.
  numberOfPlayers: [1, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_CONNECTIONS_SETUP,
  },

  startGameInClub: startGameInClubFactory('coop'),

  summaryFor: (data, _members, myId) => makeCoopLabel(data as GSummaryData, myId),

  submitTimeout,
  stopGame,
}

export const connectionsCompeteGame: GameManifest = {
  gametype: 'connections_compete',
  schema: 'connections',
  baseGametype: 'connections',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Race to solve, NYT Connections',
  logoUrl,

  help: helpLoader,

  // Compete needs an opposing PLAYER — racing yourself against
  // a connections puzzle would just be a solo coop game. Lower
  // bound 2 hides the Start button in solo clubs; the RPC also
  // enforces it server-side.
  numberOfPlayers: [2, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_CONNECTIONS_SETUP,
  },

  startGameInClub: startGameInClubFactory('compete'),

  summaryFor: (data, members, myId) => makeCompeteLabel(data as GSummaryData, members, myId),

  submitTimeout,
  stopGame,
}
