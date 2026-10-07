// cs-blessed-wordle

import { lazy } from 'react'
import { runRpc } from '@/common/supabase/dbResult'
import type { CreatedGame, GameManifest } from '@/common/manifest/gameManifest'
import { db } from './db'
import { count, dictLabel, verdict, statusLine, tally, wonBy } from '@/common/manifest/summary'
import { makeRpcDispatcher } from '@/common/manifest/manifestRpcs'
import { findWinnerIds, type SummaryPlayer } from '@/common/manifest/summaryData'
import { findUsername } from '@/common/members/memberList'
import type { Member } from '@/common/members/member'
import type { EndingLabel } from '@/common/ending/endingLabel'
import { findFewestGuessesAhead, makeEndingLabel } from './lib/endingLabel'
import { DEFAULT_WORDLE_SETUP, legalError } from './lib/setup'
import logoUrl from './logo.svg?url'
import type { GSetup, GSummaryData } from './types'

/**
 * wordle's registration with the shell. Codename `wordle` everywhere
 * in code (schema, folder, gametype strings); the brand lives only in
 * the BRAND const below. The game itself is `doc.md`'s.
 *
 * Two-manifest family (sibling pattern): coop and compete share the
 * `wordle` schema and the PlayArea / SetupForm / Help; they differ on
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

/** Shared start-game caller. `mode` is the per-manifest constant; the
 *  RPC routes on it to write the right gametype string and pick the
 *  target. No edge function — picking a random target is one SQL line. */
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

// Timeout (fired by every client on countdown expiry) + manual end — the shared
// one-arg RPC dispatchers (see common/manifest/manifestRpcs).
const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const stopGame = makeRpcDispatcher(db, 'stop_game')

// The summary reads the game's `summary_data` (`GSummaryData`: the common part
// with its ending; `team`, the team's guess count, null in compete; compete's
// winner's count; and the answer band). The answer band rides on every line —
// a game drawn from the curated Wordle answer list plays very differently from
// one drawn from the "Expert" end of the dictionary. Each mode's summaryFor
// handles its own endings.

/**
 * The answer band (`summary_data`'s `answerBand`, copied from the setup): 0 is
 * the curated NYT-Wordle answer list, 1..6 are the shared dictionary bands.
 * Rendered in the same `dict "…"` slot the other band-sensitive games use,
 * because to a player it answers the same question — how hard are the words
 * here?
 */
function answerDictLabel(band: number | null): string | null {
  if (band === 0) return 'dict "Wordle"'
  return dictLabel(band)
}

/** The game's ending as an ending label reads it, from the summary. */
function makeGameFacts(summary: GSummaryData, mode: 'coop' | 'compete') {
  return { mode, ended: summary.ended, reason: summary.ending?.reason ?? null }
}

/** A player's ending label, from the summary: their guesses, and the fewest
 *  of those ranked above them. Coop carries no per-player guesses and needs
 *  none. */
function makeSummaryEndingLabel(summary: GSummaryData, mode: 'coop' | 'compete', player: SummaryPlayer) {
  const guessesOf = (id: string) => summary.nGuessesUsedById?.[id] ?? 0
  const players = summary.players.map((p) => ({ finalRanking: p.finalRanking, nGuessesUsed: guessesOf(p.id) }))
  return makeEndingLabel(
    { ...player, nGuessesUsed: guessesOf(player.id) },
    makeGameFacts(summary, mode),
    findFewestGuessesAhead(player, players),
  )
}

/** An ending label as the club line leads with it: the word, its detail in parentheses. */
function makeLead(endingLabel: EndingLabel) {
  return endingLabel.long === '' ? endingLabel.word : `${endingLabel.word} (${endingLabel.long})`
}

/**
 * COOP's club line: the team's guesses and the answer band while it plays;
 * once it ends, the team's ending label (mine, when I played) leads it. The
 * guess count goes once the label says "out of guesses". No "answer revealed"
 * variant: revealing is a display decision on an already-ended game, and the
 * club list describes the ending, not what the players have since looked at.
 */
function makeCoopLabel(summary: GSummaryData, myId: string): string {
  const dict = answerDictLabel(summary.answerBand)
  // Coop always has a team.
  const used = tally(summary.team!.nGuessesUsed, summary.maxGuesses, 'guesses')
  if (summary.ending === null) return statusLine(verdict('Playing'), used, dict)
  const player = summary.players.find((p) => p.id === myId) ?? summary.players[0]!
  const endingLabel = makeSummaryEndingLabel(summary, 'coop', player)!
  return statusLine(makeLead(endingLabel), summary.ending.reason === 'resource_exhausted' ? null : used, dict)
}

/**
 * COMPETE's club line. No progress: a race has no team, guesses are private
 * until the game ends, and this line is readable by the whole club. It leads
 * with my ending label once I am out of play; once won, it names the winner
 * and their count.
 */
function makeCompeteLabel(summary: GSummaryData, members: readonly Member[], myId: string): string {
  const dict = answerDictLabel(summary.answerBand)
  const me = summary.players.find((p) => p.id === myId)
  const myEndingLabel = me === undefined ? null : makeSummaryEndingLabel(summary, 'compete', me)
  if (summary.ending === null && myEndingLabel === null) return statusLine(verdict('Playing'), dict)

  const winningGuesses = summary.nWinnerGuesses === null ? null : count(summary.nWinnerGuesses, 'guess', 'guesses')
  const otherWinnerNames = findWinnerIds(summary)
    .filter((id) => id !== myId)
    .map((id) => findUsername(members, id) ?? 'someone')
    .join(' & ')
  const noWinner = summary.outcome === 'lost' && summary.ending!.reason !== 'conceded'
    ? 'no winner'
    : null

  if (myEndingLabel !== null) {
    if (summary.outcome === 'won') {
      if (myEndingLabel.labelType === 'won') return statusLine(makeLead(myEndingLabel), winningGuesses, dict)
      // Someone else won: name them, beside how I came out; a bare loss is
      // said by naming them.
      return myEndingLabel.labelType === 'lost' && myEndingLabel.long === ''
        ? statusLine(wonBy(otherWinnerNames), winningGuesses, dict)
        : statusLine(makeLead(myEndingLabel), wonBy(otherWinnerNames), winningGuesses)
    }
    return statusLine(makeLead(myEndingLabel), noWinner)
  }

  // A member who did not play: the game's own result.
  switch (summary.outcome!) {
    case 'won':
      return statusLine(wonBy(otherWinnerNames), winningGuesses, dict)
    case 'lost':
      return summary.ending!.reason === 'conceded'
        ? verdict('Lost', 'all conceded')
        : statusLine(verdict('Lost', summary.ending!.reason === 'timeout' ? 'out of time' : 'out of guesses'), noWinner)
    case 'neutral':
      return statusLine('Stopped', dict)
    default:
      return summary.outcome!
  }
}

// Single source of truth for this game's user-facing brand name — both
// manifests' `name` reads it, so a fork rebrands by editing this one line.
// Codename stays lowercase in code.
const BRAND = 'WordNerd'

export const wordleCoopGame: GameManifest = {
  gametype: 'wordle_coop',
  schema: 'wordle',
  baseGametype: 'wordle',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Guess the word together',
  logoUrl,

  help: helpLoader,

  // Solo or coop up to 6. Must agree with _require_player_count_max(6).
  numberOfPlayers: [1, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_WORDLE_SETUP,
    // Gate Start until legal guesses reach the answer's hardest band (so every
    // possible answer is itself guessable). create_game re-checks.
    validate: (setup) => legalError(setup as GSetup),
  },

  startGameInClub: startGameInClubFactory('coop'),

  summaryFor: (data, _members, myId) => makeCoopLabel(data as GSummaryData, myId),

  submitTimeout,
  stopGame,
}

export const wordleCompeteGame: GameManifest = {
  gametype: 'wordle_compete',
  schema: 'wordle',
  baseGametype: 'wordle',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Race to guess the word',
  logoUrl,

  help: helpLoader,

  // Compete needs an opposing PLAYER. Must agree with create_game, which
  // checks both ends for a race (PN498 below 2, _require_player_count_max(6)).
  numberOfPlayers: [2, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_WORDLE_SETUP,
    // Gate Start until legal guesses reach the answer's hardest band (so every
    // possible answer is itself guessable). create_game re-checks.
    validate: (setup) => legalError(setup as GSetup),
  },

  startGameInClub: startGameInClubFactory('compete'),

  summaryFor: (data, members, myId) => makeCompeteLabel(data as GSummaryData, members, myId),

  submitTimeout,
  stopGame,
}
