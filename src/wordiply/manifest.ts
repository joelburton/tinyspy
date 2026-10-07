// cs-unmet

import { lazy } from 'react'
import type { CreatedGame, GameManifest } from '@/common/manifest/gameManifest'
import { db } from './db'
import { count, tally, verdict, statusLine, wonBy } from '@/common/manifest/summary'
import { makeRpcDispatcher } from '@/common/manifest/manifestRpcs'
import { findWinnerIds, type SummaryPlayer } from '@/common/manifest/summaryData'
import type { Member } from '@/common/members/member'
import { findUsername } from '@/common/members/memberList'
import type { EndingLabel } from '@/common/ending/endingLabel'
import { findScoresAhead, makeEndingLabel } from './lib/endingLabel'
import { runEdgeFn } from '@/common/supabase/dbResult'
import {
  DEFAULT_WORDIPLY_SETUP_COMPETE,
  DEFAULT_WORDIPLY_SETUP_COOP,
  wordiplySetupError,
} from './lib/setup'
import type { GSetup, GSummaryData } from './types'
import logoUrl from './logo.svg?url'

/**
 * wordiply's registration with the shell — **two manifests, one schema,
 * one folder.**
 *
 * "wordiply" is the codename for our Guardian-Wordiply-style base extender:
 * a short BASE (a 2–4 letter combination, not a dictionary word) that every
 * guess must contain, longer than the base, across five guesses. The
 * user-facing brand is **WordWire** (the `BRAND` const below); gametype /
 * schema / folder are all `wordiply`. See docs/games/wordiply.md for the
 * rules + architecture (the shipped legal list the FE validates locally,
 * length-only live readout, the compete length-score comparator).
 *
 * Both manifests share the same `PlayArea`, `SetupForm`, `Help`, `useGame`,
 * and CSS. The mode branches at render time on `gd.mode`. The
 * sibling-manifest pattern's canonical
 * write-up is in [`docs/common.md`](../../docs/common.md#the-sibling-manifest-pattern);
 * wordiply follows it.
 *
 * Differences between the two manifests: the `gametype` string, the `mode`
 * declaration, `numberOfPlayers` (coop solo-friendly `[1,6]` vs compete
 * `[2,6]`), and the per-mode `summaryFor` vocabulary. Neither carries a
 * `target_rank` — wordiply is not a race-to-rank.
 */

const helpLoader = lazy(() =>
  import('./components/Help').then((m) => ({ default: m.Help })),
)

// PlayArea is shared — branches on `game.mode` for the compete-only
// OpponentStrip + win-vs-loss verdict copy.
const playAreaLoader = lazy(() =>
  import('./components/PlayArea').then((m) => ({ default: m.PlayAreaLoader })),
)

const setupFormLoader = lazy(() =>
  import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
)

/**
 * Shared start-game caller. Forwards `mode` as a top-level body field to
 * the edge function, which builds the board and calls
 * `wordiply.create_game(target_club, setup, players, mode, board)`.
 */
function startGameInClubFactory(mode: 'coop' | 'compete') {
  return (clubHandle: string, setup: unknown, playerUserIds: string[]) =>
    // The starter is chosen in Deno, so this goes through an edge function
    // rather than straight to the RPC — but it comes back the same envelope a
    // direct create_game returns, relayed untouched (see _shared/startGame.ts).
    runEdgeFn<CreatedGame>('wordiply-build-board', {
      target_club: clubHandle,
      setup: setup as GSetup,
      player_user_ids: playerUserIds,
      mode,
    })
}

// Timeout + manual end — the shared one-arg RPC dispatchers. submit_timeout
// is mode-aware server-side + idempotent.
const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const stopGame = makeRpcDispatcher(db, 'stop_game')

/**
 * The single source of truth for this game's user-facing brand name. Both
 * sibling manifests set `name: BRAND`. The codename (`wordiply`) is
 * unrelated and stays lowercase everywhere in code.
 */
const BRAND = 'WordWire'

/** The length score as the label prints it: `78%`. */
const percent = (score: number | null) => (score === null ? null : `${score}%`)

/** A player's ending label, from the summary: their scores (the team's in
 *  coop), and those of the players ranked above them. */
function makeSummaryEndingLabel(summary: GSummaryData, mode: 'coop' | 'compete', player: SummaryPlayer) {
  const scoresOf = (id: string) => ({
    lengthScore: summary.team?.lengthScore ?? summary.lengthScoreById?.[id] ?? null,
    nLetters: summary.team?.nLetters ?? summary.nLettersById?.[id] ?? null,
  })
  const players = summary.players.map((p) => ({ finalRanking: p.finalRanking, ...scoresOf(p.id) }))
  return makeEndingLabel(
    { ...player, ...scoresOf(player.id) },
    { mode, ended: summary.ended, reason: summary.ending?.reason ?? null },
    findScoresAhead(player, players),
  )
}

/** An ending label as the club line leads with it: the word, its detail in parentheses. */
function makeLead(endingLabel: EndingLabel) {
  return endingLabel.long === '' ? endingLabel.word : `${endingLabel.word} (${endingLabel.long})`
}

/**
 * COOP's club line. Mid-game it shows only the words used (the scores wait for
 * the end, per the "length only during play" rule); once it ends, the team's
 * ending label (mine, when I played) leads it, then the letters — the five
 * words played says its length score itself.
 */
function makeCoopLabel(summary: GSummaryData, myId: string): string {
  // Coop always has a team.
  const team = summary.team!
  if (summary.ending === null) {
    return statusLine(verdict('Playing'), tally(team.nGuessesUsed, summary.maxGuesses, 'guesses'))
  }
  const player = summary.players.find((p) => p.id === myId) ?? summary.players[0]!
  const endingLabel = makeSummaryEndingLabel(summary, 'coop', player)!
  const isFiveWords = endingLabel.labelType === 'ended'
  return statusLine(
    makeLead(endingLabel),
    isFiveWords ? null : percent(team.lengthScore),
    count(team.nLetters, 'letter'),
  )
}

/**
 * Compete's club line. Mid-race it shows no progress: a race has no team, and
 * the words and scores are private until the end. It leads with my ending
 * label once I am out of play; once won, it names the winner and their length
 * score; a race nobody scored in is a collective loss.
 */
function makeCompeteLabel(summary: GSummaryData, members: readonly Member[], myId: string): string {
  const me = summary.players.find((p) => p.id === myId)
  const myEndingLabel = me === undefined ? null : makeSummaryEndingLabel(summary, 'compete', me)
  if (summary.ending === null && myEndingLabel === null) return verdict('Playing')

  const winningScore = summary.winnerLengthScore === null ? null : percent(summary.winnerLengthScore)
  const otherWinnerNames = findWinnerIds(summary)
    .filter((id) => id !== myId)
    .map((id) => findUsername(members, id) ?? 'someone')
    .join(' & ')
  const noWinner = summary.outcome === 'lost' && summary.ending!.reason !== 'conceded'
    ? 'no winner'
    : null

  if (myEndingLabel !== null) {
    if (summary.outcome === 'won') {
      if (myEndingLabel.labelType === 'won') return statusLine(makeLead(myEndingLabel), winningScore)
      // Someone else won: name them, beside how I came out.
      return statusLine(makeLead(myEndingLabel), wonBy(otherWinnerNames), winningScore)
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
        : statusLine(verdict('Lost', 'nobody scored'), noWinner)
    case 'neutral':
      return 'Stopped'
    default:
      return summary.outcome!
  }
}

export const wordiplyCoopGame: GameManifest = {
  gametype: 'wordiply_coop',
  schema: 'wordiply',
  baseGametype: 'wordiply',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Extend a base in five guesses, together',
  logoUrl,

  help: helpLoader,

  // Plays solo (1 player in their solo club) or coop (up to 6). Must agree
  // with the player-count guard in wordiply.create_game.
  numberOfPlayers: [1, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    intro:
      'Everyone in the club shares five guesses. Each guess must contain the starter and be longer than it; together you\'re hunting the longest word.',
    Component: setupFormLoader,
    defaults: DEFAULT_WORDIPLY_SETUP_COOP,
    validate: (setup) => wordiplySetupError(setup as GSetup),
  },

  startGameInClub: startGameInClubFactory('coop'),

  summaryFor: (data, _members, myId) => makeCoopLabel(data as GSummaryData, myId),

  submitTimeout,
  stopGame,
}

export const wordiplyCompeteGame: GameManifest = {
  gametype: 'wordiply_compete',
  schema: 'wordiply',
  baseGametype: 'wordiply',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Race to the longest word from a shared base',
  logoUrl,

  help: helpLoader,

  // Compete needs an opposing PLAYER. The RPC enforces ≥2 too.
  numberOfPlayers: [2, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    intro:
      'Each player gets their own five guesses off the same starter. The longest word wins; until the end you only see how many guesses each other has spent, not the words.',
    Component: setupFormLoader,
    defaults: DEFAULT_WORDIPLY_SETUP_COMPETE,
    validate: (setup) => wordiplySetupError(setup as GSetup),
  },

  startGameInClub: startGameInClubFactory('compete'),

  summaryFor: (data, members, myId) => makeCompeteLabel(data as GSummaryData, members, myId),

  submitTimeout,
  stopGame,
}
