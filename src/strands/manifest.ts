// cs-unmet

import { lazy } from 'react'
import { runRpc } from '@/common/supabase/dbResult'
import type { CreatedGame, GameManifest } from '@/common/manifest/gameManifest'
import { db } from './db'
import { count, verdict, statusLine, wonBy } from '@/common/manifest/summary'
import type { Member } from '@/common/members/member'
import { findUsername } from '@/common/members/memberList'
import { findWinnerIds, type SummaryPlayer } from '@/common/manifest/summaryData'
import type { EndingLabel } from '@/common/ending/endingLabel'
import { findFewestHintsAhead, makeEndingLabel } from './lib/endingLabel'
import { makeRpcDispatcher } from '@/common/manifest/manifestRpcs'
import { DEFAULT_STRANDS_SETUP_COMPETE, DEFAULT_STRANDS_SETUP_COOP } from './lib/setup'
import type { GSetup, GSummaryData } from './types'
import logoUrl from './logo.svg?url'

/**
 * strands' registration with the shell.
 *
 * "strands" is the codename for our NYT-Strands-style word search: an 8×6 board
 * whose puzzle words tile it exactly, plus a spangram that runs edge to edge and
 * names the theme. The user-facing brand is **PaulPath** (the `BRAND` const
 * below); gametype / schema / folder are all `strands`.
 *
 * **Sibling pair**, one schema and one folder. The two share every component;
 * mode branches at render time on `gd.mode`.
 *
 * The compete rules are worth stating here because they shape the UI: the
 * winner is whoever SOLVED using the fewest hints, earliest solve breaking a
 * tie — so the race does NOT end on first solve, a solver ends their own race
 * while the others play on, and the club label can't crown anyone until it's
 * over. Opponents see one number mid-game (hints used) and nothing about the
 * puzzle.
 *
 * **No edge function.** Unlike the games that GENERATE a board, strands copies
 * one out of the imported archive, which is a single SQL statement — so
 * `startGameInClub` calls `create_game` directly, the way wordle does.
 */

const helpLoader = lazy(() => import('./components/Help').then((m) => ({ default: m.Help })))
const playAreaLoader = lazy(() =>
  import('./components/PlayArea').then((m) => ({ default: m.PlayAreaLoader })),
)
const setupFormLoader = lazy(() =>
  import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
)

/** The one source of truth for the user-facing name. The codename (`strands`)
 *  is unrelated and stays lowercase everywhere in code. */
const BRAND = 'PaulPath'

/** Shared start-game caller; `mode` is the per-manifest constant. No edge
 *  function — strands copies a puzzle out of the archive, which is one SQL
 *  statement, so it calls create_game directly the way wordle does. */
function startGameInClub(mode: 'coop' | 'compete') {
  return (clubHandle: string, setup: unknown, playerUserIds: string[]) =>
    // No `.single()`: the RPC returns the envelope itself, one jsonb value.
    runRpc<CreatedGame>(
      db.rpc('create_game', {
        p_club_handle: clubHandle,
        p_setup: setup as GSetup,
        p_player_user_ids: playerUserIds,
        p_mode: mode,
      }),
    )
}

const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const stopGame = makeRpcDispatcher(db, 'stop_game')

/** The game's ending as an ending label reads it, from the summary. */
function makeGameFacts(summary: GSummaryData, mode: 'coop' | 'compete') {
  return { mode, ended: summary.ended, reason: summary.ending?.reason ?? null }
}

/** A player's ending label, from the summary: their hints, and the fewest of
 *  those ranked above them. Coop carries no per-player hints and needs none. */
function makeSummaryEndingLabel(summary: GSummaryData, mode: 'coop' | 'compete', player: SummaryPlayer) {
  const hintsOf = (id: string) => summary.nHintsUsedById?.[id] ?? 0
  const players = summary.players.map((p) => ({ finalRanking: p.finalRanking, nHintsUsed: hintsOf(p.id) }))
  return makeEndingLabel(
    { ...player, nHintsUsed: hintsOf(player.id) },
    makeGameFacts(summary, mode),
    findFewestHintsAhead(player, players),
  )
}

/** An ending label as the club line leads with it: the word, its detail in parentheses. */
function makeLead(endingLabel: EndingLabel) {
  return endingLabel.long === '' ? endingLabel.word : `${endingLabel.word} (${endingLabel.long})`
}

/**
 * COOP's club line: the team's progress as a bare count, never "n of N" — the
 * total is part of the answer, and the line is readable by the whole club.
 * Once it ends, the team's ending label (mine, when I played) leads it.
 */
function makeCoopLabel(summary: GSummaryData, myId: string): string {
  // Coop always has a team.
  const progress = count(summary.team!.nFoundPuzzleWords, 'word')
  if (summary.ending === null) return statusLine(verdict('Playing'), progress)
  const player = summary.players.find((p) => p.id === myId) ?? summary.players[0]!
  return statusLine(makeLead(makeSummaryEndingLabel(summary, 'coop', player)!), progress)
}

/**
 * COMPETE's club line says nothing of a rival while it plays: a winner isn't
 * known before the end — the fewest-hints ranking can be overturned by anyone
 * still playing. It leads with my ending label once I am out of play, and at
 * the end names the winner and the hints the race was won on.
 */
function makeCompeteLabel(summary: GSummaryData, members: readonly Member[], myId: string): string {
  const me = summary.players.find((p) => p.id === myId)
  const myEndingLabel = me === undefined ? null : makeSummaryEndingLabel(summary, 'compete', me)
  if (summary.ending === null && myEndingLabel === null) return verdict('Playing')

  const winningHints = summary.nWinnerHints === null ? null : count(summary.nWinnerHints, 'hint')
  const otherWinnerNames = findWinnerIds(summary)
    .filter((id) => id !== myId)
    .map((id) => findUsername(members, id) ?? 'someone')
    .join(' & ')
  const noWinner = summary.outcome === 'lost' && summary.ending!.reason !== 'conceded'
    ? 'no winner'
    : null

  if (myEndingLabel !== null) {
    if (summary.outcome === 'won') {
      if (myEndingLabel.labelType === 'won') return statusLine(makeLead(myEndingLabel), winningHints)
      // Someone else won: name them, beside my place or my concession.
      if (myEndingLabel.labelType === 'placed' || myEndingLabel.labelType === 'conceded') {
        return statusLine(makeLead(myEndingLabel), wonBy(otherWinnerNames), winningHints)
      }
      return statusLine(wonBy(otherWinnerNames), winningHints)
    }
    return statusLine(makeLead(myEndingLabel), noWinner)
  }

  // A member who did not play: the game's own result.
  switch (summary.outcome!) {
    case 'won':
      return statusLine(wonBy(otherWinnerNames), winningHints)
    case 'lost':
      return verdict('Lost', summary.ending!.reason === 'timeout' ? 'out of time' : 'all conceded')
    case 'neutral':
      return 'Stopped'
    default:
      return summary.outcome!
  }
}

export const strandsCoopGame: GameManifest = {
  gametype: 'strands_coop',
  schema: 'strands',
  baseGametype: 'strands',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Find the hidden words that fill the board',
  logoUrl,

  help: helpLoader,

  // Plays solo or up to 6. Must agree with the guard in strands.create_game.
  numberOfPlayers: [1, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_STRANDS_SETUP_COOP,
  },

  startGameInClub: startGameInClub('coop'),

  summaryFor: (data, _members, myId) => makeCoopLabel(data as GSummaryData, myId),

  submitTimeout,
  stopGame,
}

/**
 * The compete sibling. Same PlayArea / SetupForm / Help / useGame; the mode
 * branches at render time.
 */
export const strandsCompeteGame: GameManifest = {
  gametype: 'strands_compete',
  schema: 'strands',
  baseGametype: 'strands',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Race the same board — fewest hints wins',
  logoUrl,

  help: helpLoader,

  // Compete needs an opposing PLAYER; create_game enforces >= 2 too.
  numberOfPlayers: [2, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_STRANDS_SETUP_COMPETE,
  },

  startGameInClub: startGameInClub('compete'),

  summaryFor: (data, members, myId) => makeCompeteLabel(data as GSummaryData, members, myId),

  submitTimeout,
  stopGame,
}
