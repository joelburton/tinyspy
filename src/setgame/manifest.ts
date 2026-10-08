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
import {
  DEFAULT_SETGAME_SETUP_COMPETE,
  DEFAULT_SETGAME_SETUP_COOP,
  setgameSetupError,
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
 * What setgame's two modes share: the schema, and the `PlayArea`, `SetupForm`,
 * `Help`, `useGame` and CSS, which branch at render time on `gd.mode`. Each
 * mode's setup defaults and intro are the leaves'.
 *
 * "setgame" is the codename for our Set-style card game: eighty-one tiles over
 * four three-valued attributes, and a claim is three of them that are all-same
 * or all-different in every attribute. The codename is `setgame` rather than
 * `set` because `set` is a Postgres keyword, a TypeScript builtin, and on
 * docs/naming.md's banned-generic list.
 */
abstract class SetgameManifest extends Manifest {
  readonly schema = 'setgame'
  readonly baseGametype = 'setgame'
  // The brand keeps its display casing; the codename stays lowercase in code.
  readonly name = 'HareTrigger'
  readonly logoUrl = logoUrl
  readonly help = helpLoader
  readonly draftsOffTurn = false
  readonly scratchpad = 'none'
  readonly PlayArea = playAreaLoader
  protected readonly db = db

  // There is no board-builder edge function — a board is a shuffle, so
  // `setgame.create_game` deals it inline (and runs the deal-three rule before
  // anyone sees the table).
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

class SetgameCoopManifest extends SetgameManifest {
  readonly gametype = 'setgame_coop'
  readonly mode = 'coop'
  readonly shortDescription = 'Spot the sets together, and clear the deck'
  // Plays solo (1 player in their solo club) or coop (up to 6). Must agree with
  // the player-count guard in setgame.create_game.
  readonly numberOfPlayers: [number, number] = [1, 6]
  readonly setupForm: Manifest['setupForm'] = {
    intro:
      'One table, everyone hunting together. Claim three cards where each of number, color, shading and shape is either all the same or all different. You win with a perfect clear: every card in a set. Running out of sets with cards left over just ends the game.',
    Component: setupFormLoader,
    defaults: DEFAULT_SETGAME_SETUP_COOP,
    validate: (setup) => setgameSetupError(setup as GSetup),
  }

  /**
   * How many sets the table has taken, and how much game is left. Both public —
   * every claim happened face-up — so there is nothing to withhold. The team
   * comes out as one, so once it ends the line leads with the team's ending
   * label (mine, when I played).
   */
  summaryFor(data: SummaryData, members: readonly Member[], myId: string): string {
    const summary = data as GSummaryData
    const sets = count(summary.nTableSetsFound, 'set')
    if (summary.ending === null) {
      return statusLine(verdict('Playing'), sets, `${summary.nTilesInDeck} in the deck`)
    }
    const player = summary.players.find((p) => p.id === myId) ?? summary.players[0]!
    const endingLabel = this.makeSummaryEndingLabel(summary, members, player)!
    return statusLine(this.makeLead(endingLabel), sets)
  }
}

class SetgameCompeteManifest extends SetgameManifest {
  readonly gametype = 'setgame_compete'
  readonly mode = 'compete'
  readonly shortDescription = 'Same table, same deck — claim more sets than anyone'
  // Compete needs an opposing PLAYER. The RPC enforces >= 2 too.
  readonly numberOfPlayers: [number, number] = [2, 6]
  readonly setupForm: Manifest['setupForm'] = {
    intro:
      'Same table, same deck, everyone racing. A set you claim is gone for the others, and the most sets when the deck runs dry wins. Ties are ties — nobody is separated on speed.',
    Component: setupFormLoader,
    defaults: DEFAULT_SETGAME_SETUP_COMPETE,
    validate: (setup) => setgameSetupError(setup as GSetup),
  }

  /**
   * Led by my ending label once I am out of play. Nobody finishes alone — the
   * deck running dry ends it for everybody — so a win names the players with
   * the most sets, and a tie names every one of them (there is no speed
   * tiebreak).
   */
  summaryFor(data: SummaryData, members: readonly Member[], myId: string): string {
    const summary = data as GSummaryData
    const me = summary.players.find((p) => p.id === myId)
    const myEndingLabel = me === undefined ? null : this.makeSummaryEndingLabel(summary, members, me)
    if (summary.ending === null && myEndingLabel === null) {
      return statusLine(
        verdict('Playing'), count(summary.nTableSetsFound, 'set'), `${summary.nTilesInDeck} in the deck`)
    }

    const winningSets = summary.nWinnerSets === null ? null : count(summary.nWinnerSets, 'set')
    const otherWinnerNames = findWinnerIds(summary)
      .filter((id) => id !== myId)
      .map((id) => findUsername(members, id) ?? 'someone')
      .join(' & ')
    const noWinner = summary.outcome === 'lost' && summary.ending!.reason !== 'conceded'
      ? 'no winner'
      : null

    if (myEndingLabel !== null) {
      if (summary.outcome === 'won') {
        // My label names any tie, so a win needs only the sets after it.
        if (myEndingLabel.labelType === 'won') return statusLine(this.makeLead(myEndingLabel), winningSets)
        // Someone else won: name them, beside my place or my concession.
        if (myEndingLabel.labelType === 'placed' || myEndingLabel.labelType === 'conceded') {
          return statusLine(this.makeLead(myEndingLabel), wonBy(otherWinnerNames), winningSets)
        }
        return statusLine(wonBy(otherWinnerNames), winningSets)
      }
      return statusLine(this.makeLead(myEndingLabel), noWinner)
    }

    // A member who did not play: the game's own result.
    switch (summary.outcome!) {
      case 'won':
        return statusLine(wonBy(otherWinnerNames), winningSets)
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

/** setgame in coop: one table, hunting sets together. */
export const setgameCoopManifest = new SetgameCoopManifest()

/** setgame in compete: the same deck, the most sets wins. */
export const setgameCompeteManifest = new SetgameCompeteManifest()
