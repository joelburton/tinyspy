// cs-unmet

import { lazy } from 'react'
import type { CreatedGame, GameManifest } from '@/common/manifest/gameManifest'
import { db } from './db'
import { count, dictLabel, verdict, statusLine, wonBy } from '@/common/manifest/summary'
import { makeRpcDispatcher } from '@/common/manifest/manifestRpcs'
import { findWinnerIds, type SummaryPlayer } from '@/common/manifest/summaryData'
import type { Member } from '@/common/members/member'
import { findUsername } from '@/common/members/memberList'
import { runEdgeFn } from '@/common/supabase/dbResult'
import type { EndingLabel } from '@/common/ending/endingLabel'
import { findFewestSwapsAhead, makeEndingLabel } from './lib/endingLabel'
import { DEFAULT_WAFFLE_SETUP } from './lib/setup'
import type { GSetup, GSummaryData } from './types'
import logoUrl from './logo.svg?url'

/**
 * waffle's registration with the shell. Codename `waffle` everywhere
 * in code (schema, folder, gametype strings); the brand lives only in
 * the BRAND const below. A Waffle-style swap-to-solve deduction puzzle — see
 * docs/games/waffle.md.
 *
 * Ships as a coop / compete sibling pair: `waffleCoopGame` (solve one
 * board together) and `waffleCompeteGame` (own board each, fewest-swaps
 * winner). Both share the `waffle` schema, the `src/waffle/` folder, and
 * the PlayArea / SetupForm / Help; they differ on gametype string, name,
 * mode, and numberOfPlayers. The per-game setup includes an optional
 * countdown timer, ended server-side via `submitTimeout`.
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
 * Shared start-game caller. The board is generated on demand by the
 * `waffle-build-board` edge function (running as the caller), which builds a
 * board for the chosen band and calls `waffle.create_game(target_club, setup,
 * players, mode, board)`. `mode` is forwarded top-level; the shared helper owns
 * the error-context unwrap.
 */
function startGameInClubFactory(mode: 'coop' | 'compete') {
  return (clubHandle: string, setup: unknown, playerUserIds: string[]) =>
    // The board is generated in Deno, so this goes through an edge function
    // rather than straight to the RPC — but it comes back the same envelope a
    // direct create_game returns, relayed untouched (see _shared/startGame.ts).
    // Which is why naming the answer in waffle.create_game's SQL reaches here:
    // nothing in between rewrites the payload.
    runEdgeFn<CreatedGame>('waffle-build-board', {
      target_club: clubHandle,
      setup: setup as GSetup,
      player_user_ids: playerUserIds,
      mode,
    })
}

// Timeout + manual end — the shared one-arg RPC dispatchers (see
// common/manifest/manifestRpcs).
const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const stopGame = makeRpcDispatcher(db, 'stop_game')

/** The game's ending as an ending label reads it, from the summary. */
function makeGameFacts(summary: GSummaryData, mode: 'coop' | 'compete') {
  return { mode, ended: summary.ended, reason: summary.ending?.reason ?? null, parSwaps: summary.parSwaps }
}

/** A player's ending label, from the summary: their swaps (the team's in coop),
 *  and the fewest of those ranked above them. */
function makeSummaryEndingLabel(summary: GSummaryData, mode: 'coop' | 'compete', player: SummaryPlayer) {
  const swapsOf = (id: string) => summary.team?.nSwapsUsed ?? summary.nSwapsUsedById?.[id] ?? 0
  const players = summary.players.map((p) => ({ finalRanking: p.finalRanking, nSwapsUsed: swapsOf(p.id) }))
  return makeEndingLabel(
    { ...player, nSwapsUsed: swapsOf(player.id) },
    makeGameFacts(summary, mode),
    findFewestSwapsAhead(player, players),
  )
}

/** An ending label as the club line leads with it: the word, its detail in parentheses. */
function makeLead(endingLabel: EndingLabel) {
  return endingLabel.long === '' ? endingLabel.word : `${endingLabel.word} (${endingLabel.long})`
}

/**
 * Coop's club line. The DICT band rides on every row: a waffle at "Universal"
 * and one at "Expert" are barely the same game, so the band is the single most
 * useful thing about a game you're deciding whether to return to. Coop shows
 * the swaps the team has left; once it ends, the team's ending label (mine,
 * when I played) leads it. No "answer revealed" variant: revealing is a display
 * decision on an already-ended game, and the club list describes the ending,
 * not what the players have since looked at.
 */
function makeCoopLabel(summary: GSummaryData, myId: string): string {
  const dict = dictLabel(summary.band)
  // Coop always has a team.
  const left = count(summary.maxSwaps - summary.team!.nSwapsUsed, 'swap left', 'swaps left')
  if (summary.ending === null) return statusLine(verdict('Playing'), left, dict)
  const player = summary.players.find((p) => p.id === myId) ?? summary.players[0]!
  const endingLabel = makeSummaryEndingLabel(summary, 'coop', player)!
  return statusLine(makeLead(endingLabel), summary.outcome === 'won' ? left : null, dict)
}

/**
 * Compete's club line. No progress: each racer has their own board, and this
 * line is club-wide readable. It leads with my ending label once I am out of
 * play; once won, it names the winner and their count.
 */
function makeCompeteLabel(summary: GSummaryData, members: readonly Member[], myId: string): string {
  const dict = dictLabel(summary.band)
  const me = summary.players.find((p) => p.id === myId)
  const myEndingLabel = me === undefined ? null : makeSummaryEndingLabel(summary, 'compete', me)
  if (summary.ending === null && myEndingLabel === null) return statusLine(verdict('Playing'), dict)

  const winningSwaps = summary.nWinnerSwaps === null ? null : count(summary.nWinnerSwaps, 'swap', 'swaps')
  const otherWinnerNames = findWinnerIds(summary)
    .filter((id) => id !== myId)
    .map((id) => findUsername(members, id) ?? 'someone')
    .join(' & ')
  const noWinner = summary.outcome === 'lost' && summary.ending!.reason !== 'conceded'
    ? 'no winner'
    : null

  if (myEndingLabel !== null) {
    if (summary.outcome === 'won') {
      if (myEndingLabel.labelType === 'won') return statusLine(makeLead(myEndingLabel), winningSwaps, dict)
      // Someone else won: name them, beside how I came out; a bare loss is
      // said by naming them.
      return myEndingLabel.labelType === 'lost' && myEndingLabel.long === ''
        ? statusLine(wonBy(otherWinnerNames), winningSwaps, dict)
        : statusLine(makeLead(myEndingLabel), wonBy(otherWinnerNames), winningSwaps)
    }
    return statusLine(makeLead(myEndingLabel), noWinner)
  }

  // A member who did not play: the game's own result.
  switch (summary.outcome!) {
    case 'won':
      return statusLine(wonBy(otherWinnerNames), winningSwaps, dict)
    case 'lost':
      return summary.ending!.reason === 'conceded'
        ? verdict('Lost', 'all conceded')
        : statusLine(verdict('Lost', summary.ending!.reason === 'timeout' ? 'out of time' : 'out of swaps'), noWinner)
    case 'neutral':
      return statusLine('Stopped', dict)
    default:
      return summary.outcome!
  }
}

// Single source of truth for this game's user-facing brand name —
// both manifests' name and the start-game error read it, so a fork
// rebrands by editing this one line. Codename stays lowercase in code.
const BRAND = 'SyrupSwap'

export const waffleCoopGame: GameManifest = {
  gametype: 'waffle_coop',
  schema: 'waffle',
  baseGametype: 'waffle',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Unscramble the waffle together',
  logoUrl,

  help: helpLoader,

  // Solo or coop up to 6. Must agree with
  // _require_player_count_max(6) in waffle.create_game.
  numberOfPlayers: [1, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_WAFFLE_SETUP,
  },

  startGameInClub: startGameInClubFactory('coop'),

  summaryFor: (data, _members, myId) => makeCoopLabel(data as GSummaryData, myId),

  submitTimeout,
  stopGame,
}

export const waffleCompeteGame: GameManifest = {
  gametype: 'waffle_compete',
  schema: 'waffle',
  baseGametype: 'waffle',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Race to unscramble the waffle',
  logoUrl,

  help: helpLoader,

  // Compete needs an opposing PLAYER — racing yourself is degenerate.
  // Lower bound 2 hides the Start button in solo clubs; the RPC also
  // enforces it. Must agree with _require_player_count_max(6).
  numberOfPlayers: [2, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_WAFFLE_SETUP,
  },

  startGameInClub: startGameInClubFactory('compete'),

  summaryFor: (data, members, myId) => makeCompeteLabel(data as GSummaryData, members, myId),

  submitTimeout,
  stopGame,
}
