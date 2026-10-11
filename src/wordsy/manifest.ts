// cs-unmet

import { lazy } from 'react'
import { runRpc } from '@/common/supabase/dbResult'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import { Manifest } from '@/common/manifest/manifest'
import { count, verdict, statusLine, wonBy } from '@/common/manifest/summary'
import {
  findWinnerIds,
  type SummaryData,
  type SummaryPlayer,
} from '@/common/manifest/summaryData'
import type { Member } from '@/common/members/member'
import { findUsername } from '@/common/members/memberList'
import { db } from './db'
import { makeEndingLabel } from './lib/endingLabel'
import {
  DEFAULT_WORDSY_SETUP,
  DEFAULT_WORDSY_SETUP_COOP,
  wordsySetupError,
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

/**
 * What wordsy's two modes share: the schema, and the `PlayArea`, `SetupForm`,
 * `Help` and `useGame`, which branch at render time on `gd.mode`. Each mode's
 * setup defaults, intro and summary are the leaves'.
 *
 * "wordsy" is the codename for FlipWord, our Gil Hova's Wordsy: eight
 * consonant cards in four scoring columns, one word each per round, a clock
 * from the first word in (30 seconds unless the setup says otherwise), best
 * five of seven rounds (or a short game's best two of three). Coop plays the
 * rulebook's solo card as a team.
 */
abstract class WordsyManifest extends Manifest {
  readonly schema = 'wordsy'
  readonly baseGametype = 'wordsy'
  // The brand keeps its display casing; the codename stays lowercase in code.
  readonly name = 'FlipWord'
  readonly logoUrl = logoUrl
  readonly help = helpLoader
  readonly draftsOffTurn = false
  readonly scratchpad = 'none'
  readonly PlayArea = playAreaLoader
  protected readonly db = db

  // There is no board-builder edge function: `wordsy.create_game` shuffles the
  // deck and deals round 1 inline.
  startGameInClub(clubHandle: string, setup: unknown, playerUserIds: string[]) {
    return runRpc<CreatedGame>(
      db.rpc('create_game', {
        p_club_handle: clubHandle,
        p_setup: setup as GSetup,
        p_player_user_ids: playerUserIds,
        p_mode: this.mode,
      }),
    )
  }

  /** A player's ending label, from the summary, with the others at their place named. */
  protected makeSummaryEndingLabel(summary: GSummaryData,
    members: readonly Member[],
    player: SummaryPlayer,
  ) {
    const tiedWithNames = summary.players
      .filter((o) => o.id !== player.id && player.finalRanking !== null &&
        o.finalRanking === player.finalRanking)
      .map((o) => findUsername(members, o.id) ?? 'someone')
    return makeEndingLabel(
      player,
      {
        mode: this.mode,
        ended: summary.ended,
        reason: summary.ending?.reason ?? null,
        team: summary.team,
      },
      tiedWithNames,
    )
  }
}

class WordsyCoopManifest extends WordsyManifest {
  readonly gametype = 'wordsy_coop'
  readonly mode = 'coop'
  readonly shortDescription = 'One word a round against the clock, for a title'
  // Plays solo (1 player in their solo club) or as a team (up to 6). Must agree
  // with wordsy.create_game's `_require_player_count_max(…, 6)`.
  readonly numberOfPlayers: [number, number] = [1, 6]
  readonly setupForm: Manifest['setupForm'] = {
    intro:
      'FlipWord for solo play or co-op team.',
    Component: setupFormLoader,
    defaults: DEFAULT_WORDSY_SETUP_COOP,
    validate: (setup) => wordsySetupError(setup as GSetup),
  }

  /**
   * The round in play while the game is on; the team's ending once it is
   * over — the title, with the total after it, or the loss — led by my label
   * when I played.
   */
  summaryFor(data: SummaryData,
    members: readonly Member[],
    myId: string,
  ): string {
    const summary = data as GSummaryData
    if (summary.ending === null) {
      return statusLine(verdict('Playing'),
        `Round ${summary.nRoundsPlayed + 1} of ${summary.nRounds}`)
    }
    const player = summary.players.find((p) => p.id === myId) ??
      summary.players[0]!
    const lead = this.makeLead(
      this.makeSummaryEndingLabel(summary, members, player)!)
    return summary.outcome === 'won' ? statusLine(lead,
      count(summary.team!.total, 'pt', 'pts')) : lead
  }
}

class WordsyCompeteManifest extends WordsyManifest {
  readonly gametype = 'wordsy_compete'
  readonly mode = 'compete'
  readonly shortDescription = 'One word a round from eight letters'
  // Must agree with wordsy.create_game's `_require_player_count_max(…, 6)` and
  // its compete floor of 2 (docs/code-conventions.md → Per-game player counts).
  readonly numberOfPlayers: [number, number] = [2, 6]
  readonly setupForm: Manifest['setupForm'] = {
    intro:
      'Find the best 7 words, scoring from the board letters.',
    Component: setupFormLoader,
    defaults: DEFAULT_WORDSY_SETUP,
    validate: (setup) => wordsySetupError(setup as GSetup),
  }

  /**
   * The round in play while the game is on; led by my ending label once I am
   * out of play, and naming the winners — every one, since a tie is shared —
   * with the total they reached.
   */
  summaryFor(data: SummaryData,
    members: readonly Member[],
    myId: string,
  ): string {
    const summary = data as GSummaryData
    const me = summary.players.find((p) => p.id === myId)
    const myEndingLabel = me === undefined ? null : this.makeSummaryEndingLabel(
      summary, members, me)
    if (summary.ending === null && myEndingLabel === null) {
      return statusLine(verdict('Playing'),
        `Round ${summary.nRoundsPlayed + 1} of ${summary.nRounds}`)
    }

    const winningTotal = summary.winnerTotal === null ? null : count(
      summary.winnerTotal, 'pt', 'pts')
    const otherWinnerNames = findWinnerIds(summary)
      .filter((id) => id !== myId)
      .map((id) => findUsername(members, id) ?? 'someone')
      .join(' & ')

    if (myEndingLabel !== null) {
      if (summary.outcome === 'won') {
        // My label names any tie, so a win needs only the total after it.
        if (myEndingLabel.labelType === 'won') return statusLine(
          this.makeLead(myEndingLabel), winningTotal)
        return statusLine(this.makeLead(myEndingLabel), wonBy(otherWinnerNames),
          winningTotal)
      }
      return this.makeLead(myEndingLabel)
    }

    // A member who did not play: the game's own result.
    switch (summary.outcome!) {
      case 'won':
        return statusLine(wonBy(otherWinnerNames), winningTotal)
      case 'lost':
        return summary.ending!.reason === 'conceded'
          ? verdict('Lost', 'all conceded')
          : statusLine(verdict('Lost'), 'nobody scored')
      case 'neutral':
        return 'Stopped'
      default:
        return summary.outcome!
    }
  }
}

/** wordsy in coop: the solo card, for one or a team. */
export const wordsyCoopManifest = new WordsyCoopManifest()

/** wordsy in compete: one word a round, the best total after the last round wins. */
export const wordsyCompeteManifest = new WordsyCompeteManifest()
