// cs-unmet

import { lazy } from 'react'
import type { CreatedGame, GameManifest } from '@/common/manifest/gameManifest'
import { db } from './db'
import { count, verdict, statusLine, wonBy } from '@/common/manifest/summary'
import { makeRpcDispatcher } from '@/common/manifest/manifestRpcs'
import { findWinnerIds, type SummaryPlayer } from '@/common/manifest/summaryData'
import type { Member } from '@/common/members/member'
import { findUsername } from '@/common/members/memberList'
import type { EndingLabel } from '@/common/ending/endingLabel'
import { findOthersAtTheEnd, makeEndingLabel } from './lib/endingLabel'
import { runEdgeFn } from '@/common/supabase/dbResult'
import {
  DEFAULT_LETTERBOXED_SETUP_COMPETE,
  DEFAULT_LETTERBOXED_SETUP_COOP,
  letterboxedSetupError,
} from './lib/setup'
import type { GSetup, GSummaryData } from './types'
import logoUrl from './logo.svg?url'

/**
 * letterboxed's registration with the shell — **two manifests, one schema, one
 * folder.**
 *
 * "letterboxed" is the codename for our NYT-Letter-Boxed-style word chainer:
 * twelve letters three to a side of a square, words that never take two
 * letters from one side and always start where the last word ended, until all
 * twelve are touched. The user-facing brand is **SnakeBox** (the `BRAND` const
 * below); gametype / schema / folder are all `letterboxed`.
 *
 * Both manifests share the same `PlayArea`, `SetupForm`, `Help`, `useGame` and
 * CSS. The mode branches at render time on `gd.mode`. The sibling-manifest
 * pattern's canonical write-up is in
 * [`docs/common.md`](../../docs/common.md#the-sibling-manifest-pattern).
 *
 * Differences between the two: the `gametype` string, the `mode` declaration,
 * `numberOfPlayers` (coop solo-friendly `[1,6]` vs compete `[2,6]`), and the
 * per-mode `summaryFor` vocabulary.
 */

const helpLoader = lazy(() =>
  import('./components/Help').then((m) => ({ default: m.Help })),
)

// PlayArea is shared — branches on `gd.mode` for the compete-only
// OpponentStrip + win-vs-loss verdict copy.
const playAreaLoader = lazy(() =>
  import('./components/PlayArea').then((m) => ({ default: m.PlayAreaLoader })),
)

const setupFormLoader = lazy(() =>
  import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
)

/**
 * Shared start-game caller. Forwards `mode` as a top-level body field to the
 * edge function, which samples a seed, partitions it into a board, and calls
 * `letterboxed.create_game(p_club_handle, p_setup, p_player_user_ids, p_mode, p_board)`.
 */
function startGameInClubFactory(mode: 'coop' | 'compete') {
  return (clubHandle: string, setup: unknown, playerUserIds: string[]) =>
    // The board is chosen in Deno — it needs the seed table — so this goes
    // through an edge function rather than straight to the RPC, and comes back
    // the same envelope a direct create_game returns, relayed untouched (see
    // _shared/startGame.ts).
    runEdgeFn<CreatedGame>('letterboxed-build-board', {
      target_club: clubHandle,
      setup: setup as GSetup,
      player_user_ids: playerUserIds,
      mode,
    })
}

// Timeout + manual end — the shared one-arg RPC dispatchers. submit_timeout is
// mode-aware server-side + idempotent.
const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const stopGame = makeRpcDispatcher(db, 'stop_game')

/**
 * The single source of truth for this game's user-facing brand name. Both
 * sibling manifests set `name: BRAND`. The codename (`letterboxed`) is
 * unrelated and stays lowercase everywhere in code.
 */
const BRAND = 'SnakeBox'

/** Letters on the board — the denominator every label reports against. */
const BOARD_SIZE = 12

/** A player's ending label, from the summary: their counts (the team's in
 *  coop), the players ranked above them, and the others at their place. */
function makeSummaryEndingLabel(
  summary: GSummaryData,
  mode: 'coop' | 'compete',
  members: readonly Member[],
  player: SummaryPlayer,
) {
  const rankedCounts = summary.players.map((p) => ({
    id: p.id,
    name: findUsername(members, p.id) ?? 'someone',
    finalRanking: p.finalRanking,
    nCoveredLetters: summary.team?.nCoveredLetters ?? summary.nCoveredLettersById?.[p.id] ?? 0,
    nWordsUsed: summary.team?.nWordsUsed ?? summary.nWordsUsedById?.[p.id] ?? 0,
  }))
  const counts = rankedCounts.find((p) => p.id === player.id)!
  return makeEndingLabel(
    { ...player, ...counts },
    { mode, ended: summary.ended, reason: summary.ending?.reason ?? null },
    findOthersAtTheEnd(player, rankedCounts),
  )
}

/** An ending label as the club line leads with it: the word, its detail in parentheses. */
function makeLead(endingLabel: EndingLabel) {
  return endingLabel.long === '' ? endingLabel.word : `${endingLabel.word} (${endingLabel.long})`
}

/**
 * COOP's club line: the letters covered and the words used while it plays;
 * once it ends, the team's ending label (mine, when I played) leads it — a win
 * says its word count itself, and the letters covered stay on any other
 * ending.
 */
function makeCoopLabel(summary: GSummaryData, members: readonly Member[], myId: string): string {
  // Coop always has a team.
  const team = summary.team!
  const progress = `${team.nCoveredLetters}/${BOARD_SIZE} letters`
  if (summary.ending === null) {
    return statusLine(verdict('Playing'), progress, `${team.nWordsUsed}/${summary.maxWords} words`)
  }
  const player = summary.players.find((p) => p.id === myId) ?? summary.players[0]!
  const endingLabel = makeSummaryEndingLabel(summary, 'coop', members, player)!
  return statusLine(makeLead(endingLabel), summary.outcome === 'won' ? null : progress)
}

/**
 * COMPETE's club line, led by my ending label once I am out of play. The race
 * ENDS on the first solve — the bar is "cover the twelve inside the cap", and
 * being first past it is the whole game — so a win names the winner and their
 * chain's length. A timeout instead resolves on the most letters covered,
 * which is a different sentence.
 */
function makeCompeteLabel(summary: GSummaryData, members: readonly Member[], myId: string): string {
  const me = summary.players.find((p) => p.id === myId)
  const myEndingLabel = me === undefined ? null : makeSummaryEndingLabel(summary, 'compete', members, me)
  if (summary.ending === null && myEndingLabel === null) {
    return statusLine(verdict('Playing'), `best ${summary.nBestCoveredLetters}/${BOARD_SIZE}`)
  }

  const winningCount = summary.ending?.reason === 'timeout'
    ? `${summary.nWinnerCoveredLetters}/${BOARD_SIZE} letters`
    : count(summary.nWinnerWords, 'word')
  const otherWinnerNames = findWinnerIds(summary)
    .filter((id) => id !== myId)
    .map((id) => findUsername(members, id) ?? 'someone')
    .join(' & ')
  const noWinner = summary.outcome === 'lost' && summary.ending!.reason !== 'conceded'
    ? 'no winner'
    : null

  if (myEndingLabel !== null) {
    if (summary.outcome === 'won') {
      // My label names any tie, so a win needs only the count after it.
      if (myEndingLabel.labelType === 'won') return statusLine(makeLead(myEndingLabel), winningCount)
      // Someone else won: name them, beside how I came out; a bare loss is
      // said by naming them.
      return myEndingLabel.labelType === 'lost' && myEndingLabel.long === ''
        ? statusLine(wonBy(otherWinnerNames), winningCount)
        : statusLine(makeLead(myEndingLabel), wonBy(otherWinnerNames), winningCount)
    }
    return statusLine(makeLead(myEndingLabel), noWinner)
  }

  // A member who did not play: the game's own result.
  switch (summary.outcome!) {
    case 'won':
      return statusLine(wonBy(otherWinnerNames), winningCount)
    case 'lost':
      return statusLine(
        verdict('Lost', summary.ending!.reason === 'conceded' ? 'all conceded' : null),
        'nobody finished',
      )
    case 'neutral':
      return 'Stopped'
    default:
      return summary.outcome!
  }
}

export const letterboxedCoopGame: GameManifest = {
  gametype: 'letterboxed_coop',
  schema: 'letterboxed',
  baseGametype: 'letterboxed',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Chain words around the box, together',
  logoUrl,

  help: helpLoader,

  // Plays solo (1 player in their solo club) or coop (up to 6). Must agree
  // with the player-count guard in letterboxed.create_game.
  numberOfPlayers: [1, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    intro:
      'One shared chain. Each word starts with the last letter of the one before it, and no word may use two letters from the same side. Together, touch all twelve letters.',
    Component: setupFormLoader,
    defaults: DEFAULT_LETTERBOXED_SETUP_COOP,
    validate: (setup) => letterboxedSetupError(setup as GSetup),
  },

  startGameInClub: startGameInClubFactory('coop'),

  summaryFor: (data, members, myId) => makeCoopLabel(data as GSummaryData, members, myId),

  submitTimeout,
  stopGame,
}

export const letterboxedCompeteGame: GameManifest = {
  gametype: 'letterboxed_compete',
  schema: 'letterboxed',
  baseGametype: 'letterboxed',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Race to touch all twelve letters',
  logoUrl,

  help: helpLoader,

  // Compete needs an opposing PLAYER. The RPC enforces >= 2 too.
  numberOfPlayers: [2, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    intro:
      'Same twelve letters, a private chain each. First to touch all twelve within the word limit wins; until then you only see how far the others have got, not their words.',
    Component: setupFormLoader,
    defaults: DEFAULT_LETTERBOXED_SETUP_COMPETE,
    validate: (setup) => letterboxedSetupError(setup as GSetup),
  },

  startGameInClub: startGameInClubFactory('compete'),

  summaryFor: (data, members, myId) => makeCompeteLabel(data as GSummaryData, members, myId),

  submitTimeout,
  stopGame,
}
