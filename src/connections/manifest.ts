// cs-blessed-connections

import { lazy } from 'react'
import { runRpc } from '@/common/supabase/dbResult'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import { Manifest } from '@/common/manifest/manifest'
import { count, verdict, statusLine, tally, wonBy } from '@/common/manifest/summary'
import { findWinnerIds, type SummaryData } from '@/common/manifest/summaryData'
import { findUsername } from '@/common/members/memberList'
import type { Member } from '@/common/members/member'
import { db } from './db'
import { makeEndingLabel } from './lib/endingLabel'
import { DEFAULT_CONNECTIONS_SETUP } from './lib/setup'
import { CATEGORY_COUNT, MISTAKE_BUDGET } from './lib/board'
import type { GSetup, GSummaryData } from './types'
import logoUrl from './logo.svg?url'

// One lazy component each, shared by both modes, so each ships in connections'
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
 * What connections' two modes share: the schema, the loaders, the setup form
 * and `create_game`, which routes on the mode. The rules and the design are
 * `doc.md`'s.
 */
abstract class ConnectionsManifest extends Manifest {
  readonly schema = 'connections'
  readonly baseGametype = 'connections'
  // The brand keeps its display casing; the codename stays lowercase in code.
  readonly name = 'WordKnit'
  readonly logoUrl = logoUrl
  readonly help = helpLoader
  readonly draftsOffTurn = false
  readonly scratchpad = 'none'
  // Reads `game.mode` off the row for what differs.
  readonly PlayArea = playAreaLoader
  // The next-puzzle line, the date override and the timer, mode-independent.
  // The mode is the Start button clicked, not a setup choice.
  readonly setupForm: Manifest['setupForm'] = { Component: setupFormLoader, defaults: DEFAULT_CONNECTIONS_SETUP }
  // submit_timeout is mode-aware server-side (writes 'lost' for coop,
  // 'lost_compete' for compete) and idempotent.
  protected readonly db = db

  // `setup` rides through untouched: with no `puzzle_id` in it, create_game
  // derives the puzzle (doc.md → RPCs).
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

  // The summary reads the game's `summary_data` (`GSummaryData`: the common
  // part with its ending, and `team`, coop's counts, null in compete).

  /** The game's ending as an ending label reads it, from the summary. */
  protected makeGameFacts(summary: GSummaryData) {
    return { mode: this.mode, ended: summary.ended, reason: summary.ending?.reason ?? null }
  }
}

class ConnectionsCoopManifest extends ConnectionsManifest {
  readonly gametype = 'connections_coop'
  readonly mode = 'coop'
  readonly shortDescription = 'Find categories, like Connections'
  // Plays solo (1 player at their solo club) or coop (up to 6).
  // Must agree with the player-count guards in
  // connections.create_game.
  readonly numberOfPlayers: [number, number] = [1, 6]

  /**
   * The categories and mistakes while it plays; once it ends, the team's
   * ending label (mine, when I played), then the mistakes on a win — solving
   * means every category, so the mistakes are the story — or the categories
   * found on any other ending.
   */
  summaryFor(data: SummaryData, _members: readonly Member[], myId: string): string {
    const summary = data as GSummaryData
    // A coop game always has a team.
    const team = summary.team!
    // "categories", the game's own noun (doc.md → Vocabulary), throughout.
    const categories = tally(team.nMatchedCats, CATEGORY_COUNT, 'categories')
    if (summary.ending === null) {
      return statusLine(verdict('Playing'), categories, tally(team.nMistakes, MISTAKE_BUDGET, 'mistakes'))
    }
    const player = summary.players.find((p) => p.id === myId) ?? summary.players[0]!
    const endingLabel = makeEndingLabel(player, this.makeGameFacts(summary))!
    return statusLine(
      this.makeLead(endingLabel),
      summary.outcome === 'won' ? count(team.nMistakes, 'mistake') : categories,
    )
  }
}

class ConnectionsCompeteManifest extends ConnectionsManifest {
  readonly gametype = 'connections_compete'
  readonly mode = 'compete'
  readonly shortDescription = 'Race to solve, NYT Connections'
  // Compete needs an opposing PLAYER — racing yourself against
  // a connections puzzle would just be a solo coop game. Lower
  // bound 2 hides the Start button in solo clubs; the RPC also
  // enforces it server-side.
  readonly numberOfPlayers: [number, number] = [2, 6]

  /**
   * No counts: each racer's are their own, and this line is readable by the
   * whole club (the builder writes null counts in compete for the same
   * reason). It leads with my ending label once I am out of play, and names
   * the winner once there is one.
   */
  summaryFor(data: SummaryData, members: readonly Member[], myId: string): string {
    const summary = data as GSummaryData
    const me = summary.players.find((p) => p.id === myId)
    const myEndingLabel = me === undefined ? null : makeEndingLabel(me, this.makeGameFacts(summary))
    if (summary.ending === null && myEndingLabel === null) return verdict('Playing')

    const winnerName = findUsername(members, findWinnerIds(summary).find((id) => id !== myId) ?? null)
    const noWinner = summary.outcome === 'lost' && summary.ending!.reason !== 'conceded'
      ? 'no winner'
      : null

    if (myEndingLabel !== null) {
      if (summary.outcome === 'won') {
        if (myEndingLabel.labelType === 'won') return this.makeLead(myEndingLabel)
        // Someone else won: name them, beside my concession or my own loss's
        // cause; a loss to their finish is said by naming them.
        return myEndingLabel.long === '' && myEndingLabel.labelType === 'lost'
          ? wonBy(winnerName)
          : statusLine(this.makeLead(myEndingLabel), wonBy(winnerName))
      }
      return statusLine(this.makeLead(myEndingLabel), noWinner)
    }

    // A member who did not play: the game's own result.
    switch (summary.outcome!) {
      case 'won':
        return wonBy(winnerName)
      case 'lost':
        return summary.ending!.reason === 'conceded'
          ? verdict('Lost', 'all conceded')
          : statusLine(verdict('Lost', summary.ending!.reason === 'timeout' ? 'out of time' : 'out of mistakes'), noWinner)
      case 'neutral':
        return 'Stopped'
      default:
        return summary.outcome!
    }
  }
}

/** connections in coop: the team finds the categories together. */
export const connectionsCoopManifest = new ConnectionsCoopManifest()

/** connections in compete: a race through the same puzzle. */
export const connectionsCompeteManifest = new ConnectionsCompeteManifest()
