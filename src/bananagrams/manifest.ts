// cs-unmet

import { lazy } from 'react'
import { runRpc } from '@/common/supabase/dbResult'
import type { CreatedGame, GameManifest } from '@/common/manifest/gameManifest'
import { db } from './db'
import { makeRpcDispatcher } from '@/common/manifest/manifestRpcs'
import { findWinnerIds } from '@/common/manifest/summaryData'
import { count, verdict, statusLine, wonBy } from '@/common/manifest/summary'
import type { Member } from '@/common/members/member'
import { findUsername } from '@/common/members/memberList'
import type { EndingLabel } from '@/common/ending/endingLabel'
import { makeEndingLabel } from './lib/endingLabel'
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

/** The single source of truth for this game's user-facing brand name —
 *  `name` and the start-game error both read it, so a fork rebrands by
 *  editing this one line. The codename (`bananagrams`) is unrelated and
 *  stays lowercase everywhere in code. */
const BRAND = 'MonkeyGrams'

/** An ending label as the club line leads with it: the word, its detail in parentheses. */
function makeLead(endingLabel: EndingLabel) {
  return endingLabel.long === '' ? endingLabel.word : `${endingLabel.word} (${endingLabel.long})`
}

/**
 * The club line. While the game is on it counts the tiles left in the bunch,
 * which every peel draws down, so it says how near the race is to its end. It
 * leads with my ending label once I am out of play, and names the winner once
 * someone has gone out.
 */
function makeLabel(summary: GSummaryData, members: readonly Member[], myId: string): string {
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
      if (myEndingLabel.labelType === 'won') return makeLead(myEndingLabel)
      // Someone else went out: name them, beside my concession; a loss to
      // them is said by naming them.
      return myEndingLabel.labelType === 'conceded'
        ? statusLine(makeLead(myEndingLabel), wonBy(winnerName))
        : wonBy(winnerName)
    }
    return statusLine(makeLead(myEndingLabel), nobodyFinished)
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

  summaryFor: (data, members, myId) => makeLabel(data as GSummaryData, members, myId),

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
