// cs-unmet

import { lazy } from 'react'
import { runEdgeFn } from '@/common/supabase/dbResult'
import type { CreatedGame, GameManifest } from '@/common/manifest/gameManifest'
import { db } from './db'
import { count, dictLabel, verdict, statusLine, wonBy } from '@/common/manifest/summary'
import { makeRpcDispatcher } from '@/common/manifest/manifestRpcs'
import { findWinnerIds, type SummaryPlayer } from '@/common/manifest/summaryData'
import { findUsername } from '@/common/members/memberList'
import type { Member } from '@/common/members/member'
import type { EndingLabel } from '@/common/ending/endingLabel'
import { findFewestMissesAhead, makeEndingLabel } from './lib/endingLabel'
import { DEFAULT_WORDLEONE_SETUP } from './lib/setup'
import logoUrl from './logo.svg?url'
import type { GSetup, GSummaryData } from './types'

/**
 * wordleone's registration with the shell. Codename `wordleone` everywhere
 * in code (schema, folder, gametype strings); the brand lives only in
 * the BRAND const below. The game itself is `doc.md`'s.
 *
 * Two-manifest family (sibling pattern): coop and compete share the
 * `wordleone` schema and the PlayArea / SetupForm / Help; they differ on
 * gametype string, mode, and numberOfPlayers. The per-game setup is
 * `lib/setup.ts`'s; a countdown timer ends the game server-side via
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

/**
 * Shared start-game caller. The puzzle is built on demand by the
 * `wordleone-build-board` edge function (running as the caller), which builds
 * one at the chosen band and difficulty and calls `wordleone.create_game`.
 * `mode` is forwarded top-level.
 */
function startGameInClubFactory(mode: 'coop' | 'compete') {
  return (clubHandle: string, setup: unknown, playerUserIds: string[]) =>
    // The function relays create_game's envelope untouched
    // (supabase/functions/_shared/startGame.ts), so this answers as a direct
    // create_game would.
    runEdgeFn<CreatedGame>('wordleone-build-board', {
      target_club: clubHandle,
      setup: setup as GSetup,
      player_user_ids: playerUserIds,
      mode,
    })
}

// Timeout (fired by every client on countdown expiry) + manual end — the shared
// one-arg RPC dispatchers (see common/manifest/manifestRpcs).
const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const stopGame = makeRpcDispatcher(db, 'stop_game')

// The summary reads the game's `summary_data` (`GSummaryData`: the common part
// with its ending; `team`, the team's misses, null in compete; compete's
// winner's misses; and the setup's band and difficulty). The band rides on
// every line in the `dict "…"` slot every band-sensitive game uses, the
// difficulty beside it. Each mode's summaryFor handles its own endings.

/** The band and the difficulty, as every line carries them. */
function makePuzzleLabel(summary: GSummaryData): string | null {
  return statusLine(dictLabel(summary.legalBand), summary.difficulty)
}

/** The game's ending as an ending label reads it, from the summary. */
function makeGameFacts(summary: GSummaryData, mode: 'coop' | 'compete') {
  return { mode, ended: summary.ended, reason: summary.ending?.reason ?? null }
}

/** A player's ending label, from the summary: their misses, and the fewest
 *  of those ranked above them. Coop carries no per-player misses and needs
 *  none. */
function makeSummaryEndingLabel(summary: GSummaryData, mode: 'coop' | 'compete', player: SummaryPlayer) {
  const missesOf = (id: string) => summary.nMissesById?.[id] ?? 0
  const players = summary.players.map((p) => ({ finalRanking: p.finalRanking, nMisses: missesOf(p.id) }))
  return makeEndingLabel(
    { ...player, nMisses: missesOf(player.id) },
    makeGameFacts(summary, mode),
    findFewestMissesAhead(player, players),
  )
}

/** An ending label as the club line leads with it: the word, its detail in parentheses. */
function makeLead(endingLabel: EndingLabel) {
  return endingLabel.long === '' ? endingLabel.word : `${endingLabel.word} (${endingLabel.long})`
}

/**
 * COOP's club line: the team's misses and the puzzle while it plays; once it
 * ends, the team's ending label (mine, when I played) leads it.
 */
function makeCoopLabel(summary: GSummaryData, myId: string): string {
  const puzzle = makePuzzleLabel(summary)
  // Coop always has a team.
  const misses = count(summary.team!.nMisses, 'miss', 'misses')
  if (summary.ending === null) return statusLine(verdict('Playing'), misses, puzzle)
  const player = summary.players.find((p) => p.id === myId) ?? summary.players[0]!
  const endingLabel = makeSummaryEndingLabel(summary, 'coop', player)!
  return statusLine(makeLead(endingLabel), misses, puzzle)
}

/**
 * COMPETE's club line. No progress: a race has no team, guesses are private
 * until the game ends, and this line is readable by the whole club. It leads
 * with my ending label once I am out of play; once won, it names the winner
 * and their misses.
 */
function makeCompeteLabel(summary: GSummaryData, members: readonly Member[], myId: string): string {
  const puzzle = makePuzzleLabel(summary)
  const me = summary.players.find((p) => p.id === myId)
  const myEndingLabel = me === undefined ? null : makeSummaryEndingLabel(summary, 'compete', me)
  if (summary.ending === null && myEndingLabel === null) return statusLine(verdict('Playing'), puzzle)

  const winningMisses = summary.nWinnerMisses === null ? null : count(summary.nWinnerMisses, 'miss', 'misses')
  const otherWinnerNames = findWinnerIds(summary)
    .filter((id) => id !== myId)
    .map((id) => findUsername(members, id) ?? 'someone')
    .join(' & ')
  const noWinner = summary.outcome === 'lost' && summary.ending!.reason !== 'conceded'
    ? 'no winner'
    : null

  if (myEndingLabel !== null) {
    if (summary.outcome === 'won') {
      if (myEndingLabel.labelType === 'won') return statusLine(makeLead(myEndingLabel), winningMisses, puzzle)
      // Someone else won: name them, beside how I came out; a bare loss is
      // said by naming them.
      return myEndingLabel.labelType === 'lost' && myEndingLabel.long === ''
        ? statusLine(wonBy(otherWinnerNames), winningMisses, puzzle)
        : statusLine(makeLead(myEndingLabel), wonBy(otherWinnerNames), winningMisses)
    }
    return statusLine(makeLead(myEndingLabel), noWinner)
  }

  // A member who did not play: the game's own result.
  switch (summary.outcome!) {
    case 'won':
      return statusLine(wonBy(otherWinnerNames), winningMisses, puzzle)
    case 'lost':
      return summary.ending!.reason === 'conceded'
        ? verdict('Lost', 'all conceded')
        : statusLine(verdict('Lost', 'out of time'), noWinner)
    case 'neutral':
      return statusLine('Stopped', puzzle)
    default:
      return summary.outcome!
  }
}

// Single source of truth for this game's user-facing brand name — both
// manifests' `name` reads it. Codename stays lowercase in code.
const BRAND = 'WordNerdier'

export const wordleoneCoopGame: GameManifest = {
  gametype: 'wordleone_coop',
  schema: 'wordleone',
  baseGametype: 'wordleone',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Find the one word that fits, together',
  logoUrl,

  help: helpLoader,

  // Solo or coop up to 6. Must agree with _require_player_count_max(6).
  numberOfPlayers: [1, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_WORDLEONE_SETUP,
  },

  startGameInClub: startGameInClubFactory('coop'),

  summaryFor: (data, _members, myId) => makeCoopLabel(data as GSummaryData, myId),

  submitTimeout,
  stopGame,
}

export const wordleoneCompeteGame: GameManifest = {
  gametype: 'wordleone_compete',
  schema: 'wordleone',
  baseGametype: 'wordleone',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Race to find the one word that fits',
  logoUrl,

  help: helpLoader,

  // Compete needs an opposing PLAYER. Must agree with create_game, which
  // checks both ends for a race (PN518 below 2, _require_player_count_max(6)).
  numberOfPlayers: [2, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_WORDLEONE_SETUP,
  },

  startGameInClub: startGameInClubFactory('compete'),

  summaryFor: (data, members, myId) => makeCompeteLabel(data as GSummaryData, members, myId),

  submitTimeout,
  stopGame,
}
