// cs-unmet

import { lazy } from 'react'
import { runRpc } from '@/common/supabase/dbResult'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import { Manifest } from '@/common/manifest/manifest'
import { count, verdict, statusLine, wonBy } from '@/common/manifest/summary'
import { findWinnerIds, type SummaryData, type SummaryPlayer } from '@/common/manifest/summaryData'
import type { Member } from '@/common/members/member'
import { findUsername } from '@/common/members/memberList'
import { db } from './db'
import { makeEndingLabel } from './lib/endingLabel'
import { DEFAULT_WORDSY_SETUP, wordsySetupError } from './lib/setup'
import type { GSetup, GSummaryData } from './types'
import logoUrl from './logo.svg?url'

/**
 * wordsy's manifest. "wordsy" is the codename for FlipWord, our Gil Hova's
 * Wordsy: eight consonant cards in four scoring columns, one word each per
 * round, a 30-second clock from the first word in, best five of seven rounds.
 *
 * Compete only for now, as `wordsy_compete` on the family `wordsy`, so a coop
 * sibling can land beside it without renaming stored rows (plans/wordsy.md,
 * decision 13).
 */
class WordsyCompeteManifest extends Manifest {
  readonly gametype = 'wordsy_compete'
  readonly schema = 'wordsy'
  readonly baseGametype = 'wordsy'
  readonly mode = 'compete'
  // The brand keeps its display casing; the codename stays lowercase in code.
  readonly name = 'FlipWord'
  readonly shortDescription = 'One word a round from eight letters — beat the 30-second clock'
  readonly logoUrl = logoUrl
  readonly help = lazy(() =>
    import('./components/Help').then((m) => ({ default: m.Help })),
  )
  // Must agree with wordsy.create_game's `_require_player_count_max(…, 6)` and
  // its compete floor of 2 (docs/code-conventions.md → Per-game player counts).
  readonly numberOfPlayers: [number, number] = [2, 6]
  readonly draftsOffTurn = false
  readonly scratchpad = 'perPlayerInCompete'
  readonly PlayArea = lazy(() =>
    import('./components/PlayArea').then((m) => ({ default: m.PlayAreaLoader })),
  )
  readonly setupForm: Manifest['setupForm'] = {
    intro:
      'Everyone writes one word at once from eight letters worth 5, 4, 3 and 2. The first word in starts a 30-second clock; best five of seven rounds, plus bonuses, wins.',
    Component: lazy(() =>
      import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
    ),
    defaults: DEFAULT_WORDSY_SETUP,
    validate: (setup) => wordsySetupError(setup as GSetup),
  }
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

  /**
   * The round in play while the game is on; led by my ending label once I am
   * out of play, and naming the winners — every one, since a tie is shared —
   * with the total they reached.
   */
  summaryFor(data: SummaryData, members: readonly Member[], myId: string): string {
    const summary = data as GSummaryData
    const me = summary.players.find((p) => p.id === myId)
    const myEndingLabel = me === undefined ? null : this.makeSummaryEndingLabel(summary, members, me)
    if (summary.ending === null && myEndingLabel === null) {
      return statusLine(verdict('Playing'), `Round ${summary.nRoundsPlayed + 1} of 7`)
    }

    const winningTotal = summary.winnerTotal === null ? null : count(summary.winnerTotal, 'pt', 'pts')
    const otherWinnerNames = findWinnerIds(summary)
      .filter((id) => id !== myId)
      .map((id) => findUsername(members, id) ?? 'someone')
      .join(' & ')

    if (myEndingLabel !== null) {
      if (summary.outcome === 'won') {
        // My label names any tie, so a win needs only the total after it.
        if (myEndingLabel.labelType === 'won') return statusLine(this.makeLead(myEndingLabel), winningTotal)
        return statusLine(this.makeLead(myEndingLabel), wonBy(otherWinnerNames), winningTotal)
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

  /** A player's ending label, from the summary, with the others at their place named. */
  private makeSummaryEndingLabel(summary: GSummaryData, members: readonly Member[], player: SummaryPlayer) {
    const tiedWithNames = summary.players
      .filter((o) => o.id !== player.id && player.finalRanking !== null && o.finalRanking === player.finalRanking)
      .map((o) => findUsername(members, o.id) ?? 'someone')
    return makeEndingLabel(
      player,
      { ended: summary.ended, reason: summary.ending?.reason ?? null },
      tiedWithNames,
    )
  }
}

/** wordsy in compete: one word a round, the best total after seven wins. */
export const wordsyCompeteManifest = new WordsyCompeteManifest()
