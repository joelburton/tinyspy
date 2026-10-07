// cs-unmet

import { lazy } from 'react'
import { runRpc } from '@/common/supabase/dbResult'
import type { CreatedGame, GameManifest } from '@/common/manifest/gameManifest'
import { db } from './db'
import { dictLabel, verdict, statusLine, tally, wonBy } from '@/common/manifest/summary'
import { makeRpcDispatcher } from '@/common/manifest/manifestRpcs'
import { findWinnerIds } from '@/common/manifest/summaryData'
import type { Member } from '@/common/members/member'
import { findUsername } from '@/common/members/memberList'
import type { EndingLabel } from '@/common/ending/endingLabel'
import { makeEndingLabel } from './lib/endingLabel'
import { DEFAULT_STACKDOWN_SETUP } from './lib/setup'
import type { GSetup, GSummaryData } from './types'
import logoUrl from './logo.svg?url'

/**
 * stackdown's registration with the shell. A mahjong-style word game:
 * clear a stack of lettered tiles by spelling words off the exposed
 * ones — see docs/games/stackdown.md.
 *
 * Two-manifest family (sibling pattern): coop and compete share the
 * `stackdown` schema and the PlayArea / SetupForm / Help; they differ on
 * gametype string, name, mode, and numberOfPlayers. The per-game setup
 * is the dictionary band and the timer (the board is dealt at random from
 * the band's library); a countdown ends server-side via `submitTimeout`.
 */

const helpLoader = lazy(() =>
  import('./components/Help').then((m) => ({ default: m.Help })),
)

const playAreaLoader = lazy(() =>
  import('./components/PlayArea').then((m) => ({ default: m.PlayAreaLoader })),
)

const setupFormLoader = lazy(() =>
  import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
)

/** Shared start-game caller. `mode` is the per-manifest constant; the
 *  RPC routes on it to write the right gametype string and claim a
 *  random board from the library. */
function startGameInClubFactory(mode: 'coop' | 'compete') {
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

// Timeout + manual end — the shared one-arg RPC dispatchers (see
// common/manifest/manifestRpcs).
const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const stopGame = makeRpcDispatcher(db, 'stop_game')

/** The game's ending as an ending label reads it, from the summary. */
function makeGameFacts(summary: GSummaryData, mode: 'coop' | 'compete') {
  return { mode, ended: summary.ended, reason: summary.ending?.reason ?? null }
}

/** An ending label as the club line leads with it: the word, its detail in parentheses. */
function makeLead(endingLabel: EndingLabel) {
  return endingLabel.long === '' ? endingLabel.word : `${endingLabel.word} (${endingLabel.long})`
}

/**
 * COOP's club line: the team's progress through the six words, and the
 * dictionary band — the words a stack is built from change its difficulty
 * completely. A timeout is the only loss: there is no move budget, and every
 * board is clearable. Once it ends, the team's ending label (mine, when I
 * played) leads it, and the count stays on any ending but a clear.
 */
function makeCoopLabel(summary: GSummaryData, myId: string): string {
  // Coop always has a team.
  const found = tally(summary.team!.nFoundWords, summary.nReqdWords, 'words')
  const dict = dictLabel(summary.band)
  if (summary.ending === null) return statusLine(verdict('Playing'), found, dict)
  const player = summary.players.find((p) => p.id === myId) ?? summary.players[0]!
  const endingLabel = makeEndingLabel(player, makeGameFacts(summary, 'coop'))!
  return statusLine(makeLead(endingLabel), summary.outcome === 'won' ? null : found, dict)
}

/**
 * COMPETE's club line names no count: each racer's words are hidden from the
 * others, and the line is club-wide readable. It leads with my ending label
 * once I am out of play; the first to clear wins, and the timer, or the last
 * racer conceding, ends it with no winner.
 */
function makeCompeteLabel(summary: GSummaryData, members: readonly Member[], myId: string): string {
  const dict = dictLabel(summary.band)
  const me = summary.players.find((p) => p.id === myId)
  const myEndingLabel = me === undefined ? null : makeEndingLabel(me, makeGameFacts(summary, 'compete'))
  if (summary.ending === null && myEndingLabel === null) return statusLine(verdict('Playing'), dict)

  const winnerName = findUsername(members, findWinnerIds(summary).find((id) => id !== myId) ?? null)
  const noWinner = summary.outcome === 'lost' && summary.ending!.reason !== 'conceded'
    ? 'no winner'
    : null

  if (myEndingLabel !== null) {
    if (summary.outcome === 'won') {
      if (myEndingLabel.labelType === 'won') return statusLine(makeLead(myEndingLabel), dict)
      // Someone else won: name them, beside my concession; a loss to their
      // clear is said by naming them.
      return myEndingLabel.labelType === 'conceded'
        ? statusLine(makeLead(myEndingLabel), wonBy(winnerName), dict)
        : statusLine(wonBy(winnerName), dict)
    }
    return statusLine(makeLead(myEndingLabel), noWinner)
  }

  // A member who did not play: the game's own result.
  switch (summary.outcome!) {
    case 'won':
      return statusLine(wonBy(winnerName), dict)
    case 'lost':
      return summary.ending!.reason === 'conceded'
        ? verdict('Lost', 'all conceded')
        : statusLine(verdict('Lost', 'out of time'), 'no winner')
    case 'neutral':
      return statusLine('Stopped', dict)
    default:
      return summary.outcome!
  }
}

// Single source of truth for this game's user-facing brand name —
// both manifests' name and the start-game error read it, so a fork
// rebrands by editing this one line. Codename stays lowercase in code.
const BRAND = 'StackDown'

export const stackdownCoopGame: GameManifest = {
  gametype: 'stackdown_coop',
  schema: 'stackdown',
  baseGametype: 'stackdown',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Clear the tile stack together',
  logoUrl,

  help: helpLoader,

  // Solo or coop up to 6. Must agree with _require_player_count_max(6).
  numberOfPlayers: [1, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    intro:
      'A random tile-stack is dealt when the game starts. Clear it by spelling words off the exposed tiles.',
    Component: setupFormLoader,
    defaults: DEFAULT_STACKDOWN_SETUP,
  },

  startGameInClub: startGameInClubFactory('coop'),

  summaryFor: (data, _members, myId) => makeCoopLabel(data as GSummaryData, myId),

  submitTimeout,
  stopGame,
}

export const stackdownCompeteGame: GameManifest = {
  gametype: 'stackdown_compete',
  schema: 'stackdown',
  baseGametype: 'stackdown',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Race to clear the tile stack',
  logoUrl,

  help: helpLoader,

  // Compete needs an opposing PLAYER: lower bound 2.
  numberOfPlayers: [2, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    intro:
      'A random tile-stack is dealt when the game starts. Clear it by spelling words off the exposed tiles.',
    Component: setupFormLoader,
    defaults: DEFAULT_STACKDOWN_SETUP,
  },

  startGameInClub: startGameInClubFactory('compete'),

  summaryFor: (data, members, myId) => makeCompeteLabel(data as GSummaryData, members, myId),

  submitTimeout,
  stopGame,
}
