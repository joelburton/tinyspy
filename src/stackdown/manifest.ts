// cs-unmet

import { lazy } from 'react'
import { runRpc } from '@/common/supabase/dbResult'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import { Manifest } from '@/common/manifest/manifest'
import { dictLabel, verdict, statusLine, tally, wonBy } from '@/common/manifest/summary'
import { findWinnerIds, type SummaryData } from '@/common/manifest/summaryData'
import type { Member } from '@/common/members/member'
import { findUsername } from '@/common/members/memberList'
import { db } from './db'
import { makeEndingLabel } from './lib/endingLabel'
import { DEFAULT_STACKDOWN_SETUP } from './lib/setup'
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
 * What stackdown's two modes share: the `stackdown` schema and the PlayArea,
 * SetupForm and Help. The per-game setup is the dictionary band and the timer
 * (the board is dealt at random from the band's library); a countdown ends
 * server-side via `submitTimeout`. A mahjong-style word game: clear a stack of
 * lettered tiles by spelling words off the exposed ones — see
 * docs/games/stackdown.md.
 */
abstract class StackdownManifest extends Manifest {
  readonly schema = 'stackdown'
  readonly baseGametype = 'stackdown'
  // The brand keeps its display casing; the codename stays lowercase in code.
  readonly name = 'StackDown'
  readonly logoUrl = logoUrl
  readonly help = helpLoader
  readonly draftsOffTurn = false
  readonly scratchpad = 'none'
  readonly PlayArea = playAreaLoader
  readonly setupForm: Manifest['setupForm'] = {
    intro:
      'A random tile-stack is dealt when the game starts. Clear it by spelling words off the exposed tiles.',
    Component: setupFormLoader,
    defaults: DEFAULT_STACKDOWN_SETUP,
  }
  protected readonly db = db

  // The RPC routes on the mode to write the right gametype string and claim a
  // random board from the library.
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

  /** The game's ending as an ending label reads it, from the summary. */
  protected makeGameFacts(summary: GSummaryData) {
    return { mode: this.mode, ended: summary.ended, reason: summary.ending?.reason ?? null }
  }
}

class StackdownCoopManifest extends StackdownManifest {
  readonly gametype = 'stackdown_coop'
  readonly mode = 'coop'
  readonly shortDescription = 'Clear the tile stack together'
  // Solo or coop up to 6. Must agree with _require_player_count_max(6).
  readonly numberOfPlayers: [number, number] = [1, 6]

  /**
   * The team's progress through the six words, and the dictionary band — the
   * words a stack is built from change its difficulty completely. A timeout is
   * the only loss: there is no move budget, and every board is clearable. Once
   * it ends, the team's ending label (mine, when I played) leads it, and the
   * count stays on any ending but a clear.
   */
  summaryFor(data: SummaryData, _members: readonly Member[], myId: string): string {
    const summary = data as GSummaryData
    // Coop always has a team.
    const found = tally(summary.team!.nFoundWords, summary.nReqdWords, 'words')
    const dict = dictLabel(summary.band)
    if (summary.ending === null) return statusLine(verdict('Playing'), found, dict)
    const player = summary.players.find((p) => p.id === myId) ?? summary.players[0]!
    const endingLabel = makeEndingLabel(player, this.makeGameFacts(summary))!
    return statusLine(this.makeLead(endingLabel), summary.outcome === 'won' ? null : found, dict)
  }
}

class StackdownCompeteManifest extends StackdownManifest {
  readonly gametype = 'stackdown_compete'
  readonly mode = 'compete'
  readonly shortDescription = 'Race to clear the tile stack'
  // Compete needs an opposing PLAYER: lower bound 2.
  readonly numberOfPlayers: [number, number] = [2, 6]

  /**
   * Names no count: each racer's words are hidden from the others, and the line
   * is club-wide readable. It leads with my ending label once I am out of play;
   * the first to clear wins, and the timer, or the last racer conceding, ends it
   * with no winner.
   */
  summaryFor(data: SummaryData, members: readonly Member[], myId: string): string {
    const summary = data as GSummaryData
    const dict = dictLabel(summary.band)
    const me = summary.players.find((p) => p.id === myId)
    const myEndingLabel = me === undefined ? null : makeEndingLabel(me, this.makeGameFacts(summary))
    if (summary.ending === null && myEndingLabel === null) return statusLine(verdict('Playing'), dict)

    const winnerName = findUsername(members, findWinnerIds(summary).find((id) => id !== myId) ?? null)
    const noWinner = summary.outcome === 'lost' && summary.ending!.reason !== 'conceded'
      ? 'no winner'
      : null

    if (myEndingLabel !== null) {
      if (summary.outcome === 'won') {
        if (myEndingLabel.labelType === 'won') return statusLine(this.makeLead(myEndingLabel), dict)
        // Someone else won: name them, beside my concession; a loss to their
        // clear is said by naming them.
        return myEndingLabel.labelType === 'conceded'
          ? statusLine(this.makeLead(myEndingLabel), wonBy(winnerName), dict)
          : statusLine(wonBy(winnerName), dict)
      }
      return statusLine(this.makeLead(myEndingLabel), noWinner)
    }

    // A member who did not play: the game's own result.
    switch (summary.outcome!) {
      case 'won':
        return statusLine(wonBy(winnerName), dict)
      case 'lost':
        return summary.ending!.reason === 'conceded'
          ? verdict('Lost', 'all conceded')
          : statusLine(verdict('Lost', 'out of time'), 'no winner')
      case 'neutral':
        return statusLine('Stopped', dict)
      default:
        return summary.outcome!
    }
  }
}

/** stackdown in coop: the team clears one stack. */
export const stackdownCoopManifest = new StackdownCoopManifest()

/** stackdown in compete: a race to clear the same stack. */
export const stackdownCompeteManifest = new StackdownCompeteManifest()
