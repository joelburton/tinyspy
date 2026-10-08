// cs-blessed-codenamesduet

import { lazy } from 'react'
import { runRpc } from '@/common/supabase/dbResult'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import { Manifest } from '@/common/manifest/manifest'
import { count, verdict, statusLine, tally } from '@/common/manifest/summary'
import type { SummaryData } from '@/common/manifest/summaryData'
import type { Member } from '@/common/members/member'
import { db } from './db'
import { DEFAULT_CODENAMESDUET_SETUP } from './lib/setup'
import type { GSetup, GSummaryData } from './types'
import { TOTAL_AGENTS } from './lib/agents'
import { makeEndingLabel } from './lib/endingLabel'
import logoUrl from './logo.svg?url'

/**
 * codenamesduet's manifest: one mode, so one class with no family level.
 *
 * The game's components (`PlayArea`, `Help`, `SetupForm`) are lazy-loaded so
 * that Vite emits codenamesduet's code into its own chunk; the actual game
 * code arrives the first time a user navigates into codenamesduet in a
 * session. `GamePage` wraps the mount in `<Suspense>` for the brief
 * between-chunk-fetch render. The `.then(m => ({ default: m.PlayAreaLoader }))`
 * shim re-exports a named export as a default, since React.lazy expects one.
 */
class CodenamesduetManifest extends Manifest {
  readonly gametype = 'codenamesduet'
  readonly schema = 'codenamesduet'
  readonly baseGametype = 'codenamesduet'
  readonly mode = 'coop'
  // The brand keeps its display casing; the codename stays lowercase in code.
  readonly name = 'TinySpy'
  readonly shortDescription = 'Find agents using word clues'
  readonly logoUrl = logoUrl

  readonly help = lazy(() =>
    import('./components/Help').then((m) => ({ default: m.Help })),
  )

  // Codenames Duet is intrinsically 2-player. Must agree with
  // the player-count check in codenamesduet.create_game (in
  // supabase/sql/codenamesduet.sql). See
  // docs/code-conventions.md → "Per-game player counts" for the
  // cross-reference convention.
  readonly numberOfPlayers: [number, number] = [2, 2]

  readonly draftsOffTurn = false
  readonly scratchpad = 'none'

  readonly PlayArea = lazy(() =>
    import('./components/PlayArea').then((m) => ({ default: m.PlayAreaLoader })),
  )

  // Turn-count radio + first-clue-giver radio. `defaults` is a tiny literal
  // that travels with the manifest; see src/common/setup-form/setupForm.ts for
  // why this split.
  readonly setupForm: Manifest['setupForm'] = {
    Component: lazy(() =>
      import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
    ),
    defaults: DEFAULT_CODENAMESDUET_SETUP,
  }

  // submit_timeout ends the game lost, reason 'timeout' (distinct from a
  // bystander in sudden death, the Duet rulebook's turns-spent ending).
  protected readonly db = db

  // The RPC validates the setup shape server-side and uses it to initialize
  // the game (turns_remaining from s.turns; seat A assigned to
  // s.first_clue_giver_user_id). See supabase/sql/codenamesduet.sql.
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
   * The club card's label, from `summary_data`: the verdict, a loss's cause,
   * and the agent tally on every line; mid-game the turns left ride too, and
   * sudden death leads in their place.
   */
  summaryFor(data: SummaryData, _members: readonly Member[], myId: string): string {
    const summary = data as GSummaryData
    const team = summary.team
    // The agent tally is the useful "should I come back to this?" fact, so it
    // rides on every line.
    const agents = tally(team.nFoundAgents, TOTAL_AGENTS, 'agents')
    if (summary.ending === null) {
      // The one lead outside summary.ts's four words, by decision: sudden death
      // is the thing to scan a club list for.
      if (team.suddenDeath) return statusLine('Sudden death', agents)
      const turnsLeft = team.maxTurns - team.nTurnsUsed
      return statusLine(verdict('Playing'), count(turnsLeft, 'turn left', 'turns left'), agents)
    }
    // The team comes out as one: led by its ending label (mine, when I played).
    const player = summary.players.find((p) => p.id === myId) ?? summary.players[0]!
    const endingLabel = makeEndingLabel(player, {
      ended: summary.ended,
      reason: summary.ending.reason,
      detail: summary.ending.detail,
    })!
    return statusLine(this.makeLead(endingLabel), agents)
  }
}

/** codenamesduet: two spies, one board. */
export const codenamesduetManifest = new CodenamesduetManifest()
