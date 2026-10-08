// cs-unmet

import { lazy } from 'react'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import { Manifest } from '@/common/manifest/manifest'
import { count, verdict, statusLine, wonBy } from '@/common/manifest/summary'
import { findWinnerIds, type SummaryData, type SummaryPlayer } from '@/common/manifest/summaryData'
import type { Member } from '@/common/members/member'
import { findUsername } from '@/common/members/memberList'
import { runEdgeFn } from '@/common/supabase/dbResult'
import { db } from './db'
import { findOthersAtTheEnd, makeEndingLabel } from './lib/endingLabel'
import {
  DEFAULT_LETTERBOXED_SETUP_COMPETE,
  DEFAULT_LETTERBOXED_SETUP_COOP,
  letterboxedSetupError,
} from './lib/setup'
import type { GSetup, GSummaryData } from './types'
import logoUrl from './logo.svg?url'

// One lazy component each, shared by both modes.
const helpLoader = lazy(() =>
  import('./components/Help').then((m) => ({ default: m.Help })),
)
const playAreaLoader = lazy(() =>
  import('./components/PlayArea').then((m) => ({ default: m.PlayAreaLoader })),
)
const setupFormLoader = lazy(() =>
  import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
)

/** Letters on the board — the denominator every label reports against. */
const BOARD_SIZE = 12

/**
 * What letterboxed's two modes share: the schema, and the `PlayArea`,
 * `SetupForm`, `Help`, `useGame` and CSS, which branch at render time on
 * `gd.mode`. Each mode's setup defaults and intro are the leaves'.
 *
 * "letterboxed" is the codename for our NYT-Letter-Boxed-style word chainer:
 * twelve letters three to a side of a square, words that never take two
 * letters from one side and always start where the last word ended, until all
 * twelve are touched.
 */
abstract class LetterboxedManifest extends Manifest {
  readonly schema = 'letterboxed'
  readonly baseGametype = 'letterboxed'
  // The brand keeps its display casing; the codename stays lowercase in code.
  readonly name = 'SnakeBox'
  readonly logoUrl = logoUrl
  readonly help = helpLoader
  readonly draftsOffTurn = false
  readonly scratchpad = 'none'
  // Branches on `gd.mode` for the compete-only OpponentStrip + win-vs-loss
  // verdict copy.
  readonly PlayArea = playAreaLoader
  // submit_timeout is mode-aware server-side + idempotent.
  protected readonly db = db

  // The board is chosen in Deno — it needs the seed table — so this goes
  // through an edge function rather than straight to the RPC, and comes back
  // the same envelope a direct create_game returns, relayed untouched (see
  // _shared/startGame.ts).
  startGameInClub(clubHandle: string, setup: unknown, playerUserIds: string[]) {
    return runEdgeFn<CreatedGame>('letterboxed-build-board', {
      target_club: clubHandle,
      setup: setup as GSetup,
      player_user_ids: playerUserIds,
      mode: this.mode,
    })
  }

  /**
   * A player's ending label, from the summary: their counts (the team's in
   * coop), the players ranked above them, and the others at their place.
   */
  protected makeSummaryEndingLabel(summary: GSummaryData, members: readonly Member[], player: SummaryPlayer) {
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
      { mode: this.mode, ended: summary.ended, reason: summary.ending?.reason ?? null },
      findOthersAtTheEnd(player, rankedCounts),
    )
  }
}

class LetterboxedCoopManifest extends LetterboxedManifest {
  readonly gametype = 'letterboxed_coop'
  readonly mode = 'coop'
  readonly shortDescription = 'Chain words around the box, together'
  // Plays solo (1 player in their solo club) or coop (up to 6). Must agree
  // with the player-count guard in letterboxed.create_game.
  readonly numberOfPlayers: [number, number] = [1, 6]
  readonly setupForm: Manifest['setupForm'] = {
    intro:
      'One shared chain. Each word starts with the last letter of the one before it, and no word may use two letters from the same side. Together, touch all twelve letters.',
    Component: setupFormLoader,
    defaults: DEFAULT_LETTERBOXED_SETUP_COOP,
    validate: (setup) => letterboxedSetupError(setup as GSetup),
  }

  /**
   * The letters covered and the words used while it plays; once it ends, the
   * team's ending label (mine, when I played) leads it — a win says its word
   * count itself, and the letters covered stay on any other ending.
   */
  summaryFor(data: SummaryData, members: readonly Member[], myId: string): string {
    const summary = data as GSummaryData
    // Coop always has a team.
    const team = summary.team!
    const progress = `${team.nCoveredLetters}/${BOARD_SIZE} letters`
    if (summary.ending === null) {
      return statusLine(verdict('Playing'), progress, `${team.nWordsUsed}/${summary.maxWords} words`)
    }
    const player = summary.players.find((p) => p.id === myId) ?? summary.players[0]!
    const endingLabel = this.makeSummaryEndingLabel(summary, members, player)!
    return statusLine(this.makeLead(endingLabel), summary.outcome === 'won' ? null : progress)
  }
}

class LetterboxedCompeteManifest extends LetterboxedManifest {
  readonly gametype = 'letterboxed_compete'
  readonly mode = 'compete'
  readonly shortDescription = 'Race to touch all twelve letters'
  // Compete needs an opposing PLAYER. The RPC enforces >= 2 too.
  readonly numberOfPlayers: [number, number] = [2, 6]
  readonly setupForm: Manifest['setupForm'] = {
    intro:
      'Same twelve letters, a private chain each. First to touch all twelve within the word limit wins; until then you only see how far the others have got, not their words.',
    Component: setupFormLoader,
    defaults: DEFAULT_LETTERBOXED_SETUP_COMPETE,
    validate: (setup) => letterboxedSetupError(setup as GSetup),
  }

  /**
   * Led by my ending label once I am out of play. The race ENDS on the first
   * solve — the bar is "cover the twelve inside the cap", and being first past
   * it is the whole game — so a win names the winner and their chain's length.
   * A timeout instead resolves on the most letters covered, which is a
   * different sentence.
   */
  summaryFor(data: SummaryData, members: readonly Member[], myId: string): string {
    const summary = data as GSummaryData
    const me = summary.players.find((p) => p.id === myId)
    const myEndingLabel = me === undefined ? null : this.makeSummaryEndingLabel(summary, members, me)
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
        if (myEndingLabel.labelType === 'won') return statusLine(this.makeLead(myEndingLabel), winningCount)
        // Someone else won: name them, beside how I came out; a bare loss is
        // said by naming them.
        return myEndingLabel.labelType === 'lost' && myEndingLabel.long === ''
          ? statusLine(wonBy(otherWinnerNames), winningCount)
          : statusLine(this.makeLead(myEndingLabel), wonBy(otherWinnerNames), winningCount)
      }
      return statusLine(this.makeLead(myEndingLabel), noWinner)
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
}

/** letterboxed in coop: one shared chain. */
export const letterboxedCoopManifest = new LetterboxedCoopManifest()

/** letterboxed in compete: a private chain each, racing to all twelve. */
export const letterboxedCompeteManifest = new LetterboxedCompeteManifest()
