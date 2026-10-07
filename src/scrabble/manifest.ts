// cs-unmet

import { lazy } from 'react'
import { runRpc } from '@/common/supabase/dbResult'
import type { CreatedGame, GameManifest } from '@/common/manifest/gameManifest'
import type { Member } from '@/common/members/member'
import { findUsername } from '@/common/members/memberList'
import { db } from './db'
import { count, verdict, statusLine, wonBy } from '@/common/manifest/summary'
import { makeRpcDispatcher } from '@/common/manifest/manifestRpcs'
import { findWinnerIds, type SummaryPlayer } from '@/common/manifest/summaryData'
import type { EndingLabel } from '@/common/ending/endingLabel'
import { makeEndingLabel } from './lib/endingLabel'
import { DEFAULT_SCRABBLE_SETUP, validateScrabbleSetup } from './lib/setup'
import type { GSetup, GSummaryData } from './types'
import logoUrl from './logo.svg?url'

/**
 * scrabble's registration with the shell — a Scrabble-style word game
 * (codename `scrabble`); see docs/games/scrabble.md.
 *
 * Two-manifest family (sibling pattern): coop and compete share the
 * `scrabble` schema and the PlayArea / SetupForm / Help, differing on the
 * gametype string, name, mode, and numberOfPlayers. The setup is the
 * dictionary band + an optional timer; the countdown ends via
 * `submitTimeout`.
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

/** Shared start-game caller. `mode` is the per-manifest constant; the RPC
 *  routes on it to write the right gametype string + per-mode dealing. */
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

/** A player's ending label, from the summary, with the others at their place named. */
function makeSummaryEndingLabel(
  summary: GSummaryData,
  mode: 'coop' | 'compete',
  members: readonly Member[],
  player: SummaryPlayer,
) {
  const tiedWithNames = summary.players
    .filter((o) => o.id !== player.id && player.finalRanking !== null && o.finalRanking === player.finalRanking)
    .map((o) => findUsername(members, o.id) ?? 'someone')
  return makeEndingLabel(player, makeGameFacts(summary, mode), tiedWithNames)
}

/** An ending label as the club line leads with it: the word, its detail in parentheses. */
function makeLead(endingLabel: EndingLabel) {
  return endingLabel.long === '' ? endingLabel.word : `${endingLabel.word} (${endingLabel.long})`
}

/**
 * COOP's club line: the team's score, and how much bag is left while it plays.
 * The team comes out as one, so once it ends the line leads with the team's
 * ending label (mine, when I played).
 */
function makeCoopLabel(summary: GSummaryData, members: readonly Member[], myId: string): string {
  // Coop always has a team.
  const score = `${summary.team!.score} pts`
  if (summary.ending === null) {
    return statusLine(verdict('Playing'), score, count(summary.nBagTiles, 'tile left', 'tiles left'))
  }
  const player = summary.players.find((p) => p.id === myId) ?? summary.players[0]!
  const endingLabel = makeSummaryEndingLabel(summary, 'coop', members, player)!
  return statusLine(makeLead(endingLabel), score)
}

/**
 * COMPETE's label, led by my ending label once I am out of play. A win names
 * the players with the highest score and the score they share; a tie names
 * every one of them.
 */
function makeCompeteLabel(summary: GSummaryData, members: readonly Member[], myId: string): string {
  const me = summary.players.find((p) => p.id === myId)
  const myEndingLabel = me === undefined ? null : makeSummaryEndingLabel(summary, 'compete', members, me)
  if (summary.ending === null && myEndingLabel === null) {
    return statusLine(verdict('Playing'), count(summary.nBagTiles, 'tile left', 'tiles left'))
  }

  const winningScore = summary.winnerScore === null ? null : `${summary.winnerScore} pts`
  const otherWinnerNames = findWinnerIds(summary)
    .filter((id) => id !== myId)
    .map((id) => findUsername(members, id) ?? 'someone')
    .join(' & ')
  const noWinner = summary.outcome === 'lost' && summary.ending!.reason !== 'conceded'
    ? 'no winner'
    : null

  if (myEndingLabel !== null) {
    if (summary.outcome === 'won') {
      // My label names any tie, so a win needs only the score after it.
      if (myEndingLabel.labelType === 'won') return statusLine(makeLead(myEndingLabel), winningScore)
      // Someone else won: name them, beside my place or my concession.
      if (myEndingLabel.labelType === 'placed' || myEndingLabel.labelType === 'conceded') {
        return statusLine(makeLead(myEndingLabel), wonBy(otherWinnerNames), winningScore)
      }
      return statusLine(wonBy(otherWinnerNames), winningScore)
    }
    return statusLine(makeLead(myEndingLabel), noWinner)
  }

  // A member who did not play: the game's own result.
  switch (summary.outcome!) {
    case 'won':
      return statusLine(wonBy(otherWinnerNames), winningScore)
    case 'lost':
      return summary.ending!.reason === 'conceded'
        ? verdict('Lost', 'all conceded')
        : statusLine(verdict('Lost'), 'no words played')
    case 'neutral':
      return 'Stopped'
    default:
      return summary.outcome!
  }
}

// Single source of truth for this game's user-facing brand name —
// both manifests' name and the start-game error read it, so a fork
// rebrands by editing this one line. Codename stays lowercase in code.
const BRAND = 'RackAttack'

export const scrabbleCoopGame: GameManifest = {
  gametype: 'scrabble_coop',
  schema: 'scrabble',
  baseGametype: 'scrabble',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Build words together on one board',
  logoUrl,
  help: helpLoader,
  // Solo or coop up to 4. Must agree with _require_player_count_max(4).
  numberOfPlayers: [1, 4],
  // Pre-play: a waiting player may lay a move out; only submitting waits.
  draftsOffTurn: true,
  scratchpad: 'none',
  PlayArea: playAreaLoader,
  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_SCRABBLE_SETUP,
    intro:
      'Build words on the board from your rack of tiles. A word is accepted if it\'s in the dictionary band you pick for its length.',
  },
  startGameInClub: startGameInClubFactory('coop'),
  summaryFor: (data, members, myId) => makeCoopLabel(data as GSummaryData, members, myId),
  submitTimeout,
  stopGame,
}

export const scrabbleCompeteGame: GameManifest = {
  gametype: 'scrabble_compete',
  schema: 'scrabble',
  baseGametype: 'scrabble',
  mode: 'compete',
  // Solo play seats an autonomous AI opponent (docs/games/scrabble.md → The AI
  // opponent), so a solo club's mode
  // pill says "AI Compete" (vs bananagrams' pill-less "compete for 1").
  aiOpponent: true,
  name: BRAND,
  shortDescription: 'Race for the highest score',
  logoUrl,
  help: helpLoader,
  // Compete needs an opposing player — but an AI counts, so the HUMAN floor is
  // 1 (solo vs AI). The real "≥2 total (humans + AI)" floor is enforced by the
  // setup `validate` below + the RPC. Max 4 total.
  numberOfPlayers: [1, 4],
  // Pre-play: a waiting player may lay a move out; only submitting waits.
  draftsOffTurn: true,
  scratchpad: 'none',
  PlayArea: playAreaLoader,
  // `validate` blocks Start when an AI is present and the dictionary is too
  // narrow for its level, or the head-count doesn't fit (docs/games/scrabble.md).
  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_SCRABBLE_SETUP,
    validate: validateScrabbleSetup,
    intro:
      'Build words on the board from your rack of tiles. A word is accepted if it\'s in the dictionary band you pick for its length.',
  },
  startGameInClub: startGameInClubFactory('compete'),
  summaryFor: (data, members, myId) => makeCompeteLabel(data as GSummaryData, members, myId),
  submitTimeout,
  stopGame,
}
