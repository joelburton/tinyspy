// cs-unmet

import { lazy } from 'react'
import { runRpc } from '@/common/supabase/dbResult'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import { Manifest } from '@/common/manifest/manifest'
import { findWinnerIds, type SummaryData } from '@/common/manifest/summaryData'
import { count, verdict, statusLine, wonBy } from '@/common/manifest/summary'
import type { Member } from '@/common/members/member'
import { findUsername } from '@/common/members/memberList'
import { db } from './db'
import { makeEndingLabel } from './lib/endingLabel'
import { bunchSizeError, DEFAULT_BANANAGRAMS_SETUP } from './lib/setup'
import type { GSetup, GSummaryData } from './types'
import logoUrl from './logo.svg?url'

/**
 * bananagrams's manifest: compete-only, so (like codenamesduet, which is
 * coop-only) one class with no family level, one `common.gametypes` row and
 * one Start button, hence the bare `gametype: 'bananagrams'` (the `_compete`
 * suffix only earns its keep when there's a `_coop` sibling sharing the
 * schema). `mode: 'compete'` still tags the interaction axis for any code that
 * reads it.
 *
 * Solo is allowed: `numberOfPlayers` starts at 1 (a one-player race is "finish
 * your own tiles"), unlike the compete siblings whose lower bound is 2.
 */
class BananagramsManifest extends Manifest {
  readonly gametype = 'bananagrams'
  readonly schema = 'bananagrams'
  readonly baseGametype = 'bananagrams'
  readonly mode = 'compete'
  // The brand keeps its display casing; the codename stays lowercase in code.
  readonly name = 'MonkeyGrams'
  readonly shortDescription = 'Race to lay out all your tiles'
  readonly logoUrl = logoUrl

  readonly help = lazy(() =>
    import('./components/Help').then((m) => ({ default: m.Help })),
  )

  // Solo race up to a 6-player table. MUST AGREE with the
  // _require_player_count_max(6) call in bananagrams.create_game. See
  // docs/code-conventions.md → "Per-game player counts".
  readonly numberOfPlayers: [number, number] = [1, 6]

  readonly draftsOffTurn = false
  readonly scratchpad = 'none'

  readonly PlayArea = lazy(() =>
    import('./components/PlayArea').then((m) => ({ default: m.PlayAreaLoader })),
  )

  readonly setupForm: Manifest['setupForm'] = {
    Component: lazy(() =>
      import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
    ),
    defaults: DEFAULT_BANANAGRAMS_SETUP,
    // Gate Start until the bunch can deal everyone a starter hand
    // (bunch_size ≥ playerCount × hand_size). create_game re-checks.
    validate: (setup, playerCount) =>
      bunchSizeError(setup as GSetup, playerCount),
  }

  // submit_timeout ends the race as a collective loss (nobody went out in
  // time). stop_game is the whole-table stop, alongside per-player `concede`.
  // They're different acts and bananagrams needs both: conceding is a LOSS on
  // your record and it takes every player doing it to close a game the group
  // has simply lost interest in. Stop is the group agreeing there's no result —
  // nobody wins, nobody loses.
  protected readonly db = db

  // Single gametype → no `mode` in the payload (the RPC writes
  // 'bananagrams' directly). The server deals the starter hands and
  // validates the setup shape; the FE-collected setup isn't trusted.
  startGameInClub(clubHandle: string, setup: unknown, playerUserIds: string[]) {
    // No `.single()`: the RPC returns the envelope itself, one jsonb value.
    return runRpc<CreatedGame>(
      db.rpc('create_game', {
        p_club_handle: clubHandle,
        p_setup: setup as GSetup,
        p_player_user_ids: playerUserIds,
      }),
    )
  }

  /**
   * While the game is on it counts the tiles left in the bunch, which every
   * peel draws down, so it says how near the race is to its end. It leads with
   * my ending label once I am out of play, and names the winner once someone
   * has gone out.
   */
  summaryFor(data: SummaryData, members: readonly Member[], myId: string): string {
    const summary = data as GSummaryData
    const facts = { ended: summary.ended, reason: summary.ending?.reason ?? null }
    const me = summary.players.find((p) => p.id === myId)
    const myEndingLabel = me === undefined ? null : makeEndingLabel(me, facts)
    if (summary.ending === null && myEndingLabel === null) {
      return statusLine(
        verdict('Playing'),
        count(summary.nBunchTiles, 'tile in the bunch', 'tiles in the bunch'),
      )
    }

    const winnerName = findUsername(members, findWinnerIds(summary).find((id) => id !== myId) ?? null)
    const nobodyFinished = summary.outcome === 'lost' && summary.ending!.reason !== 'conceded'
      ? 'nobody finished'
      : null

    if (myEndingLabel !== null) {
      if (summary.outcome === 'won') {
        if (myEndingLabel.labelType === 'won') return this.makeLead(myEndingLabel)
        // Someone else went out: name them, beside my concession; a loss to
        // them is said by naming them.
        return myEndingLabel.labelType === 'conceded'
          ? statusLine(this.makeLead(myEndingLabel), wonBy(winnerName))
          : wonBy(winnerName)
      }
      return statusLine(this.makeLead(myEndingLabel), nobodyFinished)
    }

    // A member who did not play: the game's own result.
    switch (summary.outcome!) {
      case 'won':
        return wonBy(winnerName)
      case 'lost':
        return summary.ending!.reason === 'conceded'
          ? verdict('Lost', 'all conceded')
          : statusLine(verdict('Lost', 'out of time'), 'nobody finished')
      case 'neutral':
        return 'Stopped'
      default:
        return summary.outcome!
    }
  }
}

/** bananagrams: a race to lay out all your tiles. */
export const bananagramsManifest = new BananagramsManifest()
