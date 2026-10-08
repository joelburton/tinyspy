// cs-unmet

import { lazy } from 'react'
import type { FormErrors } from '@/common/forms/formState'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import { Manifest } from '@/common/manifest/manifest'
import { findWinnerIds, type SummaryData } from '@/common/manifest/summaryData'
import { verdict, statusLine, wonBy } from '@/common/manifest/summary'
import type { Member } from '@/common/members/member'
import { findUsername } from '@/common/members/memberList'
import { runEdgeFn, runRpc } from '@/common/supabase/dbResult'
import { db } from './db'
import { makeEndingLabel } from './lib/endingLabel'
import { CROSSWORDS_DEFAULTS } from './lib/setup'
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
 * Start is blocked until a puzzle is chosen (library) / a weekday or date is
 * set (NYT) / a file is parsed (upload).
 *
 * **All four land on `source`**: there is one field, its button row is always
 * on screen whichever source you chose, and the message rings it.
 *
 * They ARE all one field's message, not four fields' — "you have not picked a
 * puzzle" is the same complaint however you were going to pick one.
 */
const puzzle = (message: string): FormErrors => ({ source: message })

const validate = (setup: unknown): FormErrors => {
  const s = setup as GSetup
  // No source at all: a fresh form, or a picker someone backed out of. Same
  // words as an unanswered library, because it is the same state to the player
  // — no puzzle in hand.
  if (s.source === undefined) return puzzle('Pick a puzzle to start.')
  // NYT takes either: a weekday (the normal path — the server resolves it to
  // the most recent unplayed date) or an explicit date (the override). The
  // picker always sets one of them, so this only fires for a client that
  // cleared both.
  if (s.source === 'nyt') {
    return s.date || typeof s.weekday === 'number' ? {} : puzzle('Pick a weekday or a date.')
  }
  if (s.source === 'guardian') return s.series ? {} : puzzle('Pick a Guardian series.')
  if (s.source === 'upload') return s.board ? {} : puzzle('Choose a .puz or .ipuz file.')
  return s.puzzle_id ? {} : puzzle('Pick a puzzle to start.')
}

/**
 * What crosswords' two modes share: the schema, and the PlayArea, SetupForm,
 * Help and CSS; mode branches in the RPCs and at render time. See
 * docs/games/crosswords.md.
 */
abstract class CrosswordsManifest extends Manifest {
  readonly schema = 'crosswords'
  readonly baseGametype = 'crosswords'
  // The brand keeps its display casing; the codename stays lowercase in code.
  readonly name = 'CrossPlay'
  readonly logoUrl = logoUrl
  readonly help = helpLoader
  readonly draftsOffTurn = false
  readonly PlayArea = playAreaLoader
  // Shared notepad (coop) / private per-player pad (compete — a shared pad
  // would leak solving progress).
  readonly scratchpad = 'perPlayerInCompete'
  readonly setupForm: Manifest['setupForm'] = { Component: setupFormLoader, defaults: CROSSWORDS_DEFAULTS, validate }
  // stop_game in coop is a whole-table "stop now" (a neutral mutual give-up).
  // Compete has it beside `concede`, as every race does: `concede` is one
  // racer dropping out (a loss on their record), Stop is the whole table
  // agreeing to stop with no result. The board offers Stop inside Concede's
  // question, and the pause overlay uses it too, as the escape from a wedged
  // presence-pause.
  protected readonly db = db

  /**
   * Start branches on the puzzle source, and every branch answers the SAME
   * envelope:
   *  - **library** → straight to the `create_game` RPC (like stackdown); the
   *    puzzle already exists in the library;
   *  - **NYT / Guardian** → an import edge function (fetch → import → create),
   *    which relays that RPC's envelope untouched;
   *  - **upload** → the FE already parsed the file into `setup.board`, so we call
   *    `create_game` directly with the inline `board` arg (self-contained game,
   *    like NYT). The board is STRIPPED from the persisted `setup` blob so the
   *    solution never lands in the unshielded status / saved-default.
   */
  async startGameInClub(clubHandle: string, setup: unknown, playerUserIds: string[]) {
    const s = setup as GSetup
    // NYT (by date) and Guardian (today's, by series) both fetch server-side and
    // create the game from the imported puzzle.
    if (s.source === 'nyt' || s.source === 'guardian') {
      return runEdgeFn<CreatedGame>(
        s.source === 'nyt' ? 'crosswords-import-nyt' : 'crosswords-import-guardian',
        { target_club: clubHandle, setup: s, player_user_ids: playerUserIds, mode: this.mode },
      )
    }
    // Upload: pass the parsed board inline (create_game's `board` arg). The
    // board + filename are stripped from the setup that create_game stores as
    // status / saved-default — UNCONDITIONALLY, not just for an upload. A parsed
    // board could otherwise linger in `s` after a source change; `PuzzleSourceField`
    // clears every other source's keys when you choose one, so this is the
    // second of three guards rather than the only real one. See
    // docs/games/crosswords.md → Puzzle sourcing and the server backstop in
    // create_game (`setup - 'board' - 'filename'`).
    const board = s.source === 'upload' ? s.board : undefined
    const setupToStore: GSetup = { ...s }
    delete setupToStore.board
    delete setupToStore.filename
    // No `.single()`: the RPC returns the envelope itself, one jsonb value.
    return runRpc<CreatedGame>(
      db.rpc('create_game', {
        p_club_handle: clubHandle,
        p_setup: setupToStore,
        p_player_user_ids: playerUserIds,
        p_mode: this.mode,
        ...(board ? { p_board: board } : {}),
      }),
    )
  }

  /** The game's ending as an ending label reads it, from the summary. */
  protected makeGameFacts(summary: GSummaryData) {
    return { mode: this.mode, ended: summary.ended, reason: summary.ending?.reason ?? null }
  }
}

class CrosswordsCoopManifest extends CrosswordsManifest {
  readonly gametype = 'crosswords_coop'
  readonly mode = 'coop'
  readonly shortDescription = 'Solve a crossword together'
  // Solo (1, in a solo club) or coop (up to 8). Agrees with create_game.
  readonly numberOfPlayers: [number, number] = [1, 8]

  /**
   * While the grid is being solved it says how much of it is filled; no puzzle
   * name, which is the game's TITLE, one line above on the same card. Once it
   * ends, the team's ending label (mine, when I played): "Solved", or the timer
   * running out on an unfinished grid, coop's one loss.
   */
  summaryFor(data: SummaryData, _members: readonly Member[], myId: string): string {
    const summary = data as GSummaryData
    if (summary.ending === null) {
      // Coop always has its team count.
      const percent = Math.round((summary.team!.nFilledCells / summary.nCells) * 100)
      return statusLine(verdict('Playing'), `${percent}% filled`)
    }
    const player = summary.players.find((p) => p.id === myId) ?? summary.players[0]!
    return this.makeLead(makeEndingLabel(player, this.makeGameFacts(summary))!)
  }
}

class CrosswordsCompeteManifest extends CrosswordsManifest {
  readonly gametype = 'crosswords_compete'
  readonly mode = 'compete'
  readonly shortDescription = 'Race the same crossword'
  // Compete needs an opponent; the RPC enforces ≥2 too.
  readonly numberOfPlayers: [number, number] = [2, 8]

  /**
   * No per-racer progress, and the race's one winner is named once it is won.
   * It leads with my ending label once I am out of play.
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
        // Someone else won: name them, beside my concession; a loss to their
        // solve is said by naming them.
        return myEndingLabel.labelType === 'conceded'
          ? statusLine(this.makeLead(myEndingLabel), wonBy(winnerName))
          : wonBy(winnerName)
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
          : statusLine(verdict('Lost', 'out of time'), 'no winner')
      case 'neutral':
        return 'Stopped'
      default:
        return summary.outcome!
    }
  }
}

/** crosswords in coop: one grid, solved together. */
export const crosswordsCoopManifest = new CrosswordsCoopManifest()

/** crosswords in compete: a race through the same grid. */
export const crosswordsCompeteManifest = new CrosswordsCompeteManifest()
