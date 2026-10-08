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
import { DEFAULT_SCRABBLE_SETUP, validateScrabbleSetup } from './lib/setup'
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

// The setup dialog's intro, the same in both modes.
const SETUP_INTRO =
  'Build words on the board from your rack of tiles. A word is accepted if it\'s in the dictionary band you pick for its length.'

/**
 * What scrabble's two modes share: the `scrabble` schema and the PlayArea,
 * SetupForm and Help. The setup is the dictionary band + an optional timer;
 * the countdown ends via `submitTimeout`. A Scrabble-style word game; see
 * docs/games/scrabble.md.
 */
abstract class ScrabbleManifest extends Manifest {
  readonly schema = 'scrabble'
  readonly baseGametype = 'scrabble'
  // The brand keeps its display casing; the codename stays lowercase in code.
  readonly name = 'RackAttack'
  readonly logoUrl = logoUrl
  readonly help = helpLoader
  // Pre-play: a waiting player may lay a move out; only submitting waits.
  readonly draftsOffTurn = true
  readonly scratchpad = 'none'
  readonly PlayArea = playAreaLoader
  protected readonly db = db

  // The RPC routes on the mode to write the right gametype string and the
  // mode's dealing.
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

  /** A player's ending label, from the summary, with the others at their place named. */
  protected makeSummaryEndingLabel(summary: GSummaryData, members: readonly Member[], player: SummaryPlayer) {
    const tiedWithNames = summary.players
      .filter((o) => o.id !== player.id && player.finalRanking !== null && o.finalRanking === player.finalRanking)
      .map((o) => findUsername(members, o.id) ?? 'someone')
    return makeEndingLabel(
      player,
      { mode: this.mode, ended: summary.ended, reason: summary.ending?.reason ?? null },
      tiedWithNames,
    )
  }
}

class ScrabbleCoopManifest extends ScrabbleManifest {
  readonly gametype = 'scrabble_coop'
  readonly mode = 'coop'
  readonly shortDescription = 'Build words together on one board'
  // Solo or coop up to 4. Must agree with _require_player_count_max(4).
  readonly numberOfPlayers: [number, number] = [1, 4]
  readonly setupForm: Manifest['setupForm'] = { Component: setupFormLoader, defaults: DEFAULT_SCRABBLE_SETUP, intro: SETUP_INTRO }

  /**
   * The team's score, and how much bag is left while it plays. The team comes
   * out as one, so once it ends the line leads with the team's ending label
   * (mine, when I played).
   */
  summaryFor(data: SummaryData, members: readonly Member[], myId: string): string {
    const summary = data as GSummaryData
    // Coop always has a team.
    const score = `${summary.team!.score} pts`
    if (summary.ending === null) {
      return statusLine(verdict('Playing'), score, count(summary.nBagTiles, 'tile left', 'tiles left'))
    }
    const player = summary.players.find((p) => p.id === myId) ?? summary.players[0]!
    const endingLabel = this.makeSummaryEndingLabel(summary, members, player)!
    return statusLine(this.makeLead(endingLabel), score)
  }
}

class ScrabbleCompeteManifest extends ScrabbleManifest {
  readonly gametype = 'scrabble_compete'
  readonly mode = 'compete'
  // Solo play seats an autonomous AI opponent (docs/games/scrabble.md → The AI
  // opponent), so a solo club's mode
  // pill says "AI Compete" (vs bananagrams' pill-less "compete for 1").
  readonly aiOpponent = true
  readonly shortDescription = 'Race for the highest score'
  // Compete needs an opposing player — but an AI counts, so the HUMAN floor is
  // 1 (solo vs AI). The real "≥2 total (humans + AI)" floor is enforced by the
  // setup `validate` below + the RPC. Max 4 total.
  readonly numberOfPlayers: [number, number] = [1, 4]
  // `validate` blocks Start when an AI is present and the dictionary is too
  // narrow for its level, or the head-count doesn't fit (docs/games/scrabble.md).
  readonly setupForm: Manifest['setupForm'] = {
    Component: setupFormLoader,
    defaults: DEFAULT_SCRABBLE_SETUP,
    validate: validateScrabbleSetup,
    intro: SETUP_INTRO,
  }

  /**
   * Led by my ending label once I am out of play. A win names the players with
   * the highest score and the score they share; a tie names every one of them.
   */
  summaryFor(data: SummaryData, members: readonly Member[], myId: string): string {
    const summary = data as GSummaryData
    const me = summary.players.find((p) => p.id === myId)
    const myEndingLabel = me === undefined ? null : this.makeSummaryEndingLabel(summary, members, me)
    if (summary.ending === null && myEndingLabel === null) {
      return statusLine(verdict('Playing'), count(summary.nBagTiles, 'tile left', 'tiles left'))
    }

    const winningScore = summary.winnerScore === null ? null : `${summary.winnerScore} pts`
    const otherWinnerNames = findWinnerIds(summary)
      .filter((id) => id !== myId)
      .map((id) => findUsername(members, id) ?? 'someone')
      .join(' & ')
    const noWinner = summary.outcome === 'lost' && summary.ending!.reason !== 'conceded'
      ? 'no winner'
      : null

    if (myEndingLabel !== null) {
      if (summary.outcome === 'won') {
        // My label names any tie, so a win needs only the score after it.
        if (myEndingLabel.labelType === 'won') return statusLine(this.makeLead(myEndingLabel), winningScore)
        // Someone else won: name them, beside my place or my concession.
        if (myEndingLabel.labelType === 'placed' || myEndingLabel.labelType === 'conceded') {
          return statusLine(this.makeLead(myEndingLabel), wonBy(otherWinnerNames), winningScore)
        }
        return statusLine(wonBy(otherWinnerNames), winningScore)
      }
      return statusLine(this.makeLead(myEndingLabel), noWinner)
    }

    // A member who did not play: the game's own result.
    switch (summary.outcome!) {
      case 'won':
        return statusLine(wonBy(otherWinnerNames), winningScore)
      case 'lost':
        return summary.ending!.reason === 'conceded'
          ? verdict('Lost', 'all conceded')
          : statusLine(verdict('Lost'), 'no words played')
      case 'neutral':
        return 'Stopped'
      default:
        return summary.outcome!
    }
  }
}

/** scrabble in coop: one board, one team score. */
export const scrabbleCoopManifest = new ScrabbleCoopManifest()

/** scrabble in compete: the highest score wins; solo plays an AI. */
export const scrabbleCompeteManifest = new ScrabbleCompeteManifest()
