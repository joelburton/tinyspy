// cs-unmet

import { lazy } from 'react'
import type { CreatedGame, GameManifest } from '@/common/manifest/gameManifest'
import { db } from './db'
import { count, verdict, statusLine, wonBy } from '@/common/manifest/summary'
import type { Member } from '@/common/members/member'
import { findUsername } from '@/common/members/memberList'
import { makeRpcDispatcher } from '@/common/manifest/manifestRpcs'
import { findWinnerIds, type SummaryPlayer } from '@/common/manifest/summaryData'
import type { EndingLabel } from '@/common/ending/endingLabel'
import { runEdgeFn } from '@/common/supabase/dbResult'
import { makeEndingLabel } from './lib/endingLabel'
import {
  DEFAULT_BOGGLE_SETUP_COMPETE,
  DEFAULT_BOGGLE_SETUP_COOP,
  boggleSetupError,
} from './lib/setup'
import type { GSetup, GSummaryData } from './types'
import logoUrl from './logo.svg?url'

/**
 * boggle's registration with the shell — **two manifests, one schema, one
 * folder.** Codename `boggle`; the user-facing brand is `BRAND` below. Both
 * manifests share the PlayArea, SetupForm, Help, and CSS; mode branches at
 * render time / in the RPCs. See docs/games/boggle.md for the design.
 *
 * Differences between the two: `gametype`, `mode`, `numberOfPlayers`
 * (coop allows solo `[1,8]`; compete needs an opponent `[2,8]`), the
 * `setupForm.defaults`, and the `summaryFor` vocabulary.
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

/** Shared start-game caller — invokes the board-builder edge function (the
 *  shared helper owns the error-context unwrap). */
function startGameInClubFactory(mode: 'coop' | 'compete') {
  return (clubHandle: string, setup: unknown, playerUserIds: string[]) =>
    // The board is rolled in Deno, so this goes through an edge function rather
    // than straight to the RPC — but it comes back the same envelope a direct
    // create_game returns, relayed untouched (see _shared/startGame.ts).
    runEdgeFn<CreatedGame>('boggle-build-board', {
      target_club: clubHandle,
      setup: setup as GSetup,
      player_user_ids: playerUserIds,
      mode,
    })
}

// Timeout (mode-aware + idempotent server-side) + manual end — the shared
// one-arg RPC dispatchers (see common/manifest/manifestRpcs).
const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const stopGame = makeRpcDispatcher(db, 'stop_game')

// The summary reads the game's `summary_data` (`GSummaryData`: the common part
// with the team's finds, null in compete, the target and the top score).

/** The team's words and points, for a coop label. */
function teamTally(summary: GSummaryData): [string | null, string] {
  const team = summary.team!
  return [count(team.nFoundWords, 'word'), `${team.foundWordsScore} pts`]
}


/** The game's ending as an ending label reads it, from the summary. */
function makeGameFacts(summary: GSummaryData, mode: 'coop' | 'compete') {
  return {
    mode,
    ended: summary.ended,
    reason: summary.ending?.reason ?? null,
    detail: summary.ending?.detail ?? null,
    winPercent: summary.targetWinPercent,
  }
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

/** The winners other than me, named: "bea", "bea & cade", "bea, cade & dee". */
function makeOtherWinnerNames(summary: GSummaryData, members: readonly Member[], myId: string) {
  const names = findWinnerIds(summary)
    .filter((id) => id !== myId)
    .map((id) => findUsername(members, id) ?? 'someone')
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`
}

/**
 * boggle coop. The team comes out as one, so the line leads with the team's
 * ending label (mine, when I played) and ends with the team's tally.
 */
function makeCoopLabel(summary: GSummaryData, myId: string): string {
  if (summary.ending === null) return statusLine(verdict('Playing'), ...teamTally(summary))
  const player = summary.players.find((p) => p.id === myId) ?? summary.players[0]!
  const endingLabel = makeEndingLabel(player, makeGameFacts(summary, 'coop'), [])!
  return statusLine(makeLead(endingLabel), ...teamTally(summary))
}

/**
 * boggle compete, led by my ending label once I am out of play. Two shapes of
 * win: reaching the goal first ("Won by bea at 65%", or the score when the
 * goal was every required word), and — with no target — the top score when the
 * timer stops, which ties share. A target game whose timer runs out has no
 * winner, however high the scores got. No player's own score reaches the
 * listing until the game ends.
 */
function makeCompeteLabel(summary: GSummaryData, members: readonly Member[], myId: string): string {
  const pct = summary.targetWinPercent
  const me = summary.players.find((p) => p.id === myId)
  const myEndingLabel = me === undefined ? null : makeSummaryEndingLabel(summary, 'compete', members, me)
  if (summary.ending === null && myEndingLabel === null) {
    return statusLine(verdict('Playing'), pct !== null ? `race to ${pct}%` : null)
  }

  // A target win names the bar; any other win, the winning score.
  const isTargetWin = summary.ending?.detail === 'target'
  const winningScore = !isTargetWin && summary.topScore !== null ? `${summary.topScore} pts` : null
  const wonByOthers = (names: string) => (isTargetWin ? `${wonBy(names)} at ${pct}%` : wonBy(names))
  const noWinner = summary.outcome === 'lost' && summary.ending!.reason !== 'conceded'
    ? 'no winner'
    : null

  if (myEndingLabel !== null) {
    if (summary.outcome === 'won') {
      const others = makeOtherWinnerNames(summary, members, myId)
      if (myEndingLabel.labelType === 'won') return statusLine(makeLead(myEndingLabel), winningScore)
      // Someone else won: name them, beside my place or my concession.
      if (myEndingLabel.labelType === 'placed' || myEndingLabel.labelType === 'conceded') {
        return statusLine(makeLead(myEndingLabel), wonByOthers(others), winningScore)
      }
      return statusLine(wonByOthers(others), winningScore)
    }
    return statusLine(makeLead(myEndingLabel), noWinner)
  }

  // A member who did not play: the game's own result.
  switch (summary.outcome!) {
    case 'won':
      return statusLine(wonByOthers(makeOtherWinnerNames(summary, members, myId)), winningScore)
    case 'lost':
      return summary.ending!.reason === 'conceded'
        ? verdict('Lost', 'all conceded')
        : statusLine(verdict('Lost', 'out of time'), noWinner)
    case 'neutral':
      return 'Stopped'
    default:
      return summary.outcome!
  }
}

// The single source of truth for this game's user-facing brand name.
const BRAND = 'MothCubes'

export const boggleCoopGame: GameManifest = {
  gametype: 'boggle_coop',
  schema: 'boggle',
  baseGametype: 'boggle',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Find words by linking adjacent tiles',
  logoUrl,
  help: helpLoader,
  // Plays solo (1, in a solo club) or coop (up to 8). Must agree with
  // boggle.create_game's player-count guard.
  numberOfPlayers: [1, 8],
  draftsOffTurn: false,
  scratchpad: 'none',
  PlayArea: playAreaLoader,
  setupForm: {
    intro:
      'Everyone hunts the same board together and the team’s finds pile up into one score.',
    Component: setupFormLoader,
    defaults: DEFAULT_BOGGLE_SETUP_COOP,
    validate: (setup) => boggleSetupError(setup as GSetup),
  },
  startGameInClub: startGameInClubFactory('coop'),
  summaryFor: (data, _members, myId) => makeCoopLabel(data as GSummaryData, myId),
  submitTimeout,
  stopGame,
}

export const boggleCompeteGame: GameManifest = {
  gametype: 'boggle_compete',
  schema: 'boggle',
  baseGametype: 'boggle',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Race to find the most words',
  logoUrl,
  help: helpLoader,
  // Compete needs an opposing player; the RPC enforces ≥2 too.
  numberOfPlayers: [2, 8],
  draftsOffTurn: false,
  scratchpad: 'none',
  PlayArea: playAreaLoader,
  setupForm: {
    intro:
      'Everyone races the same board independently — most points wins. You see each other’s word counts, not the words themselves, until the game ends.',
    Component: setupFormLoader,
    defaults: DEFAULT_BOGGLE_SETUP_COMPETE,
    validate: (setup) => boggleSetupError(setup as GSetup),
  },
  startGameInClub: startGameInClubFactory('compete'),
  summaryFor: (data, members, myId) => makeCompeteLabel(data as GSummaryData, members, myId),
  submitTimeout,
  stopGame,
}
