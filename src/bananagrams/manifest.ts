// cs-unmet

import { lazy } from 'react'
import { runRpc } from '@/common/supabase/dbResult'
import type { CreatedGame, GameManifest } from '@/common/manifest/gameManifest'
import { db } from './db'
import { makeRpcDispatcher } from '@/common/manifest/manifestRpcs'
import { count, verdict, statusLine, wonBy } from '@/common/manifest/summary'
import type { Member } from '@/common/members/member'
import { memberById } from '@/common/members/memberList'
import { bunchSizeError, DEFAULT_BANANAGRAMS_SETUP } from './lib/setup'
import type { GSetup, GSummaryData } from './types'
import logoUrl from './logo.svg?url'

/**
 * bananagrams's registration with the shell — a SINGLE manifest.
 *
 * bananagrams is compete-only, so (like codenamesduet, which is coop-only)
 * it's one `common.gametypes` row and one Start button — no
 * coop/compete sibling pair, hence the bare `gametype: 'bananagrams'`
 * (the `_compete` suffix only earns its keep when there's a `_coop`
 * sibling sharing the schema). `mode: 'compete'` still tags the
 * interaction axis for any code that reads it.
 *
 * Solo is allowed: `numberOfPlayers` starts at 1 (a one-player race
 * is "finish your own tiles"), unlike the psychicnum/connections/spellingbee
 * compete siblings whose lower bound is 2.
 */

// The single source of truth for this game's user-facing brand name —
// `name` and the start-game error both read it, so a fork rebrands by
// editing this one line. The codename (`bananagrams`) is unrelated and
// stays lowercase everywhere in code.
const BRAND = 'MonkeyGrams'

/**
 * The club line. The bunch is the race's clock — it is what everyone is
 * drawing down — so the live line counts it. A race's one winner is the common
 * `ending.winner`; the two no-winner losses, a countdown's end and everyone
 * conceding, are told apart by the ending's reason.
 */
function makeLabel(summary: GSummaryData, members: readonly Member[]): string {
  if (summary.ending === null) {
    return statusLine(
      verdict('Playing'),
      count(summary.nBunchTiles, 'tile in the bunch', 'tiles in the bunch'),
    )
  }
  // Written with the ending.
  const outcome = summary.outcome!
  switch (outcome) {
    case 'won':
      return wonBy(memberById(members, summary.ending.winner!)?.username)
    case 'lost':
      return summary.ending.reason === 'conceded'
        ? verdict('Lost', 'all conceded')
        : statusLine(verdict('Lost', 'out of time'), 'nobody finished')
    // A Stop.
    case 'neutral':
      return verdict('Ended')
    default:
      return outcome
  }
}

export const bananagramsGame: GameManifest = {
  gametype: 'bananagrams',
  schema: 'bananagrams',
  baseGametype: 'bananagrams',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Race to lay out all your tiles',
  logoUrl,

  help: lazy(() =>
    import('./components/Help').then((m) => ({ default: m.Help })),
  ),

  // Solo race up to a 6-player table. MUST AGREE with the
  // _require_player_count_max(6) call in bananagrams.create_game. See
  // docs/code-conventions.md → "Per-game player counts".
  numberOfPlayers: [1, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: lazy(() =>
    import('./components/PlayArea').then((m) => ({ default: m.PlayAreaLoader })),
  ),

  setupForm: {
    Component: lazy(() =>
      import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
    ),
    defaults: DEFAULT_BANANAGRAMS_SETUP,
    // Gate Start until the bunch can deal everyone a starter hand
    // (bunch_size ≥ playerCount × hand_size). create_game re-checks.
    validate: (setup, playerCount) =>
      bunchSizeError(setup as GSetup, playerCount),
  },

  // Single gametype → no `mode` in the payload (the RPC writes
  // 'bananagrams' directly). The server deals the starter hands and
  // validates the setup shape; the FE-collected setup isn't trusted.
  startGameInClub: (clubHandle, setup, playerUserIds) =>
    // No `.single()`: the RPC returns the envelope itself, one jsonb value.
    runRpc<CreatedGame>(
      db.rpc('create_game', {
        p_club_handle: clubHandle,
        p_setup: setup as GSetup,
        p_player_user_ids: playerUserIds,
      }),
    ),

  summaryFor: (data, members) => makeLabel(data as GSummaryData, members),

  // Fired by GamePage when a chosen countdown hits 0. Ends the race as a
  // collective loss (nobody went out in time) via bananagrams.submit_timeout.
  // Idempotent server-side, so a peer racing to fire it is fine. The shared
  // one-arg dispatcher (see common/manifest/manifestRpcs).
  submitTimeout: makeRpcDispatcher(db, 'submit_timeout'),

  // The whole-table stop, alongside per-player `concede`. They're different
  // acts and bananagrams needs both: conceding is a LOSS on your record and it
  // takes every player doing it to close a game the group has simply lost
  // interest in. Stop is the group agreeing there's no result — nobody wins,
  // nobody loses.
  stopGame: makeRpcDispatcher(db, 'stop_game'),
}
