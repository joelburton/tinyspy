// cs-blessed-psychicnum

import { lazy } from 'react'
import { runRpc } from '@/common/supabase/dbResult'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import { Manifest } from '@/common/manifest/manifest'
import type { SummaryData } from '@/common/manifest/summaryData'
import { verdict, statusLine, tally, wonBy } from '@/common/manifest/summary'
import { findWinnerIds } from '@/common/manifest/summaryData'
import type { Member } from '@/common/members/member'
import { findUsername } from '@/common/members/memberList'
import { db } from './db'
import { makeEndingLabel, REASON_DETAIL } from './lib/endingLabel'
import { DEFAULT_PSYCHICNUM_SETUP } from './lib/setup'
import logoUrl from './logo.svg?url'
import type { GSetup, GSummaryData } from './types'

// One lazy component each, shared by both modes, so each ships in psychicnum's
// chunk.
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
 * What psychicnum's two modes share: one schema, one folder, one brand. Each
 * mode is its own gametype ('psychicnum_coop', 'psychicnum_compete') with its
 * own Start button; the leaves below say what differs.
 */
abstract class PsychicnumManifest extends Manifest {
  readonly schema = 'psychicnum'
  readonly baseGametype = 'psychicnum'
  // The brand keeps its display casing; code identifiers are the codename.
  readonly name = 'PsychicNum'
  readonly logoUrl = logoUrl
  readonly help = helpLoader
  readonly draftsOffTurn = false
  readonly scratchpad = 'none'
  // Reads `cg.mode` for what differs.
  readonly PlayArea = playAreaLoader
  // No mode picker: the mode is the manifest's, not a setup choice.
  readonly setupForm = { Component: setupFormLoader, defaults: DEFAULT_PSYCHICNUM_SETUP }
  protected readonly db = db

  // `psychicnum.create_game` routes on the mode: it writes the gametype and
  // that mode's end-game vocabulary.
  startGameInClub(clubHandle: string, setup: unknown, playerUserIds: string[]) {
    // No `.single()`: the RPC returns the envelope itself, one jsonb value.
    return runRpc<CreatedGame>(
      db.rpc('create_game', {
        p_club_handle: clubHandle,
        p_setup: setup as GSetup,
        p_player_user_ids: playerUserIds,
        p_mode: this.mode,
      }),
    )
  }
}

// Each summaryFor reads the game's `summary_data` (`GSummaryData`: the common
// part with its ending, and `team`, the team's found and used counts, null in
// compete).

class PsychicnumCoopManifest extends PsychicnumManifest {
  readonly gametype = 'psychicnum_coop'
  readonly mode = 'coop'
  readonly shortDescription = 'Find the three secret words together'
  // Solo or coop up to 6. Must agree with the server-side
  // _require_player_count_max(6) call in psychicnum.create_game.
  readonly numberOfPlayers: [number, number] = [1, 6]

  summaryFor(data: SummaryData, members: readonly Member[], myId: string): string {
    const summary = data as GSummaryData
    if (summary.ending === null) return this.labelMidGame(summary)
    // The team comes out as one, so any seat's ending label is the team's: mine
    // when I played.
    const player = summary.players.find((p) => p.id === myId) ?? summary.players[0]!
    const endingLabel = makeEndingLabel(player, { mode: 'coop', ended: true, reason: summary.ending.reason })!
    if (endingLabel.labelType === 'won') {
      // A team win, but naming who landed the third secret is the fun bit: the
      // guess that found it is the act that ended the game.
      const guesser = findUsername(members, summary.ending.by)
      return statusLine(this.makeLead(endingLabel), guesser && `${guesser} guessed it`)
    }
    return statusLine(this.makeLead(endingLabel), this.foundTally(summary))
  }

  /** The team's finds against the secrets. Coop always has a team. */
  private foundTally(summary: GSummaryData) {
    return tally(summary.team!.nFoundSecrets, summary.nReqdSecrets, 'found')
  }

  /**
   * The mid-game progress. Compete has none: every player there holds their
   * own budget and hunts the same three secrets independently, and a
   * found-count would tell you exactly how close your opponent is. This line
   * is club-wide readable, so compete says nothing, and its
   * `summary_data.team` is null.
   */
  private labelMidGame(summary: GSummaryData) {
    return statusLine(
      verdict('Playing'),
      this.foundTally(summary),
      tally(summary.team!.nGuessesUsed, summary.maxGuesses, 'guesses'),
    )
  }
}

class PsychicnumCompeteManifest extends PsychicnumManifest {
  readonly gametype = 'psychicnum_compete'
  readonly mode = 'compete'
  readonly shortDescription = 'Race to find the three secret words'
  // Compete needs an opposing PLAYER — racing yourself is
  // degenerate. Lower bound 2 hides the Start button in solo
  // clubs; the RPC also enforces this server-side.
  readonly numberOfPlayers: [number, number] = [2, 6]

  summaryFor(data: SummaryData, members: readonly Member[], myId: string): string {
    const summary = data as GSummaryData
    const game = { mode: 'compete', ended: summary.ended, reason: summary.ending?.reason ?? null } as const
    // My result once I am out of play — mid-race too — or null while I play
    // or when I was not in this game.
    const me = summary.players.find((p) => p.id === myId)
    const myEndingLabel = me === undefined ? null : makeEndingLabel(me, game)
    // No progress while I play: a race has no team, every player's budget and
    // finds are their own (see the coop manifest's labelMidGame), and this line
    // is readable by the whole club.
    if (summary.ending === null && myEndingLabel === null) return verdict('Playing')

    // A race has one winner; a race nobody won says so, unless everyone
    // conceding says it already.
    const winner = findUsername(members, findWinnerIds(summary)[0] ?? null)
    const noWinner = summary.outcome === 'lost' && summary.ending!.reason !== 'conceded'
      ? 'no winner'
      : null

    if (myEndingLabel !== null) {
      // Someone else won: name them, beside my concession if I conceded.
      if (summary.outcome === 'won' && myEndingLabel.labelType !== 'won') {
        return myEndingLabel.labelType === 'conceded'
          ? statusLine(this.makeLead(myEndingLabel), wonBy(winner))
          : wonBy(winner)
      }
      return statusLine(this.makeLead(myEndingLabel), noWinner)
    }

    // A member who did not play: the game's own result.
    switch (summary.outcome!) {
      case 'won':
        return wonBy(winner)
      case 'lost':
        return statusLine(verdict('Lost', REASON_DETAIL[summary.ending!.reason] ?? null), noWinner)
      case 'neutral':
        return 'Stopped'
      default:
        return summary.outcome!
    }
  }
}

/** psychicnum in coop: the team finds the three secrets together. */
export const psychicnumCoopManifest = new PsychicnumCoopManifest()

/** psychicnum in compete: a race to the three secrets. */
export const psychicnumCompeteManifest = new PsychicnumCompeteManifest()
