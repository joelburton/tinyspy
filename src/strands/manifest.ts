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
import { findFewestHintsAhead, makeEndingLabel } from './lib/endingLabel'
import { DEFAULT_STRANDS_SETUP_COMPETE, DEFAULT_STRANDS_SETUP_COOP } from './lib/setup'
import type { GSetup, GSummaryData } from './types'
import logoUrl from './logo.svg?url'

// One lazy component each, shared by both modes.
const helpLoader = lazy(() => import('./components/Help').then((m) => ({ default: m.Help })))
const playAreaLoader = lazy(() =>
  import('./components/PlayArea').then((m) => ({ default: m.PlayAreaLoader })),
)
const setupFormLoader = lazy(() =>
  import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
)

/**
 * What strands' two modes share: one schema, one folder and every component;
 * mode branches at render time on `gd.mode`. Each mode's setup defaults are the
 * leaves'.
 *
 * "strands" is the codename for our NYT-Strands-style word search: an 8×6 board
 * whose puzzle words tile it exactly, plus a spangram that runs edge to edge and
 * names the theme.
 *
 * The compete rules are worth stating here because they shape the UI: the
 * winner is whoever SOLVED using the fewest hints, earliest solve breaking a
 * tie — so the race does NOT end on first solve, a solver ends their own race
 * while the others play on, and the club label can't crown anyone until it's
 * over. Opponents see one number mid-game (hints used) and nothing about the
 * puzzle.
 */
abstract class StrandsManifest extends Manifest {
  readonly schema = 'strands'
  readonly baseGametype = 'strands'
  // The brand keeps its display casing; the codename stays lowercase in code.
  readonly name = 'PaulPath'
  readonly logoUrl = logoUrl
  readonly help = helpLoader
  readonly draftsOffTurn = false
  readonly scratchpad = 'none'
  readonly PlayArea = playAreaLoader
  protected readonly db = db

  // No edge function: unlike the games that GENERATE a board, strands copies
  // one out of the imported archive, which is a single SQL statement, so this
  // calls create_game directly the way wordle does.
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

  /**
   * A player's ending label, from the summary: their hints, and the fewest of
   * those ranked above them. Coop carries no per-player hints and needs none.
   */
  protected makeSummaryEndingLabel(summary: GSummaryData, player: SummaryPlayer) {
    const hintsOf = (id: string) => summary.nHintsUsedById?.[id] ?? 0
    const players = summary.players.map((p) => ({ finalRanking: p.finalRanking, nHintsUsed: hintsOf(p.id) }))
    return makeEndingLabel(
      { ...player, nHintsUsed: hintsOf(player.id) },
      { mode: this.mode, ended: summary.ended, reason: summary.ending?.reason ?? null },
      findFewestHintsAhead(player, players),
    )
  }
}

class StrandsCoopManifest extends StrandsManifest {
  readonly gametype = 'strands_coop'
  readonly mode = 'coop'
  readonly shortDescription = 'Find the hidden words that fill the board'
  // Plays solo or up to 6. Must agree with the guard in strands.create_game.
  readonly numberOfPlayers: [number, number] = [1, 6]
  readonly setupForm: Manifest['setupForm'] = { Component: setupFormLoader, defaults: DEFAULT_STRANDS_SETUP_COOP }

  /**
   * The team's progress as a bare count, never "n of N" — the total is part of
   * the answer, and the line is readable by the whole club. Once it ends, the
   * team's ending label (mine, when I played) leads it.
   */
  summaryFor(data: SummaryData, _members: readonly Member[], myId: string): string {
    const summary = data as GSummaryData
    // Coop always has a team.
    const progress = count(summary.team!.nFoundPuzzleWords, 'word')
    if (summary.ending === null) return statusLine(verdict('Playing'), progress)
    const player = summary.players.find((p) => p.id === myId) ?? summary.players[0]!
    return statusLine(this.makeLead(this.makeSummaryEndingLabel(summary, player)!), progress)
  }
}

class StrandsCompeteManifest extends StrandsManifest {
  readonly gametype = 'strands_compete'
  readonly mode = 'compete'
  readonly shortDescription = 'Race the same board — fewest hints wins'
  // Compete needs an opposing PLAYER; create_game enforces >= 2 too.
  readonly numberOfPlayers: [number, number] = [2, 6]
  readonly setupForm: Manifest['setupForm'] = { Component: setupFormLoader, defaults: DEFAULT_STRANDS_SETUP_COMPETE }

  /**
   * Says nothing of a rival while it plays: a winner isn't known before the
   * end — the fewest-hints ranking can be overturned by anyone still playing.
   * It leads with my ending label once I am out of play, and at the end names
   * the winner and the hints the race was won on.
   */
  summaryFor(data: SummaryData, members: readonly Member[], myId: string): string {
    const summary = data as GSummaryData
    const me = summary.players.find((p) => p.id === myId)
    const myEndingLabel = me === undefined ? null : this.makeSummaryEndingLabel(summary, me)
    if (summary.ending === null && myEndingLabel === null) return verdict('Playing')

    const winningHints = summary.nWinnerHints === null ? null : count(summary.nWinnerHints, 'hint')
    const otherWinnerNames = findWinnerIds(summary)
      .filter((id) => id !== myId)
      .map((id) => findUsername(members, id) ?? 'someone')
      .join(' & ')
    const noWinner = summary.outcome === 'lost' && summary.ending!.reason !== 'conceded'
      ? 'no winner'
      : null

    if (myEndingLabel !== null) {
      if (summary.outcome === 'won') {
        if (myEndingLabel.labelType === 'won') return statusLine(this.makeLead(myEndingLabel), winningHints)
        // Someone else won: name them, beside my place or my concession.
        if (myEndingLabel.labelType === 'placed' || myEndingLabel.labelType === 'conceded') {
          return statusLine(this.makeLead(myEndingLabel), wonBy(otherWinnerNames), winningHints)
        }
        return statusLine(wonBy(otherWinnerNames), winningHints)
      }
      return statusLine(this.makeLead(myEndingLabel), noWinner)
    }

    // A member who did not play: the game's own result.
    switch (summary.outcome!) {
      case 'won':
        return statusLine(wonBy(otherWinnerNames), winningHints)
      case 'lost':
        return verdict('Lost', summary.ending!.reason === 'timeout' ? 'out of time' : 'all conceded')
      case 'neutral':
        return 'Stopped'
      default:
        return summary.outcome!
    }
  }
}

/** strands in coop: the team finds the theme words together. */
export const strandsCoopManifest = new StrandsCoopManifest()

/** strands in compete: the same board, fewest hints wins. */
export const strandsCompeteManifest = new StrandsCompeteManifest()
