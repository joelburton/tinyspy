// cs-unmet

import { lazy } from 'react'
import type { FormErrors } from '@/common/forms/formState'
import type { CreatedGame, GameManifest } from '@/common/manifest/gameManifest'
import { makeRpcDispatcher } from '@/common/manifest/manifestRpcs'
import { findWinnerIds } from '@/common/manifest/summaryData'
import { runEdgeFn, runRpc } from '@/common/supabase/dbResult'
import { db } from './db'
import { verdict, statusLine, wonBy } from '@/common/manifest/summary'
import type { Member } from '@/common/members/member'
import { findUsername } from '@/common/members/memberList'
import type { EndingLabel } from '@/common/ending/endingLabel'
import { makeEndingLabel } from './lib/endingLabel'
import { CROSSWORDS_DEFAULTS } from './lib/setup'
import type { GSetup, GSummaryData } from './types'
import logoUrl from './logo.svg?url'

/**
 * crosswords' registration with the shell — **two manifests, one schema,
 * one folder.** Codename `crosswords`; the user-facing brand is `BRAND`.
 * Both manifests share the PlayArea, SetupForm, Help, and CSS; mode
 * branches in the RPCs / at render time. See docs/games/crosswords.md.
 *
 * Start-game goes straight to `crosswords.create_game` (the library path,
 * like stackdown) — the puzzle already exists in the library. The
 * NYT-by-date path (the `crosswords-import-nyt` edge function) creates a
 * self-contained game inline instead; see `docs/games/crosswords.md` → Server
 * surface + parsers.
 */

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
 * Start branches on the puzzle source, and the two branches now answer the SAME
 * envelope — which is what makes this one function rather than two shapes the
 * caller has to tell apart:
 *  - **library** → straight to the `create_game` RPC (like stackdown);
 *  - **NYT / Guardian** → an import edge function (fetch → import → create),
 *    which relays that RPC's envelope untouched;
 *  - **upload** → the FE already parsed the file into `setup.board`, so we call
 *    `create_game` directly with the inline `board` arg (self-contained game,
 *    like NYT). The board is STRIPPED from the persisted `setup` blob so the
 *    solution never lands in the unshielded status / saved-default.
 */
function startGameInClubFactory(mode: 'coop' | 'compete') {
  return async (clubHandle: string, setup: unknown, playerUserIds: string[]) => {
    const s = setup as GSetup
    // NYT (by date) and Guardian (today's, by series) both fetch server-side and
    // create the game from the imported puzzle.
    if (s.source === 'nyt' || s.source === 'guardian') {
      return runEdgeFn<CreatedGame>(
        s.source === 'nyt' ? 'crosswords-import-nyt' : 'crosswords-import-guardian',
        { target_club: clubHandle, setup: s, player_user_ids: playerUserIds, mode },
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
    // Same widened type as the import paths above, for the same reason.
    return runRpc<CreatedGame>(
      db.rpc('create_game', {
        p_club_handle: clubHandle,
        p_setup: setupToStore,
        p_player_user_ids: playerUserIds,
        p_mode: mode,
        ...(board ? { p_board: board } : {}),
      }),
    )
  }
}

const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const stopGame = makeRpcDispatcher(db, 'stop_game')

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

/** The game's ending as an ending label reads it, from the summary. */
function makeGameFacts(summary: GSummaryData, mode: 'coop' | 'compete') {
  return { mode, ended: summary.ended, reason: summary.ending?.reason ?? null }
}

/** An ending label as the club line leads with it: the word, its detail in parentheses. */
function makeLead(endingLabel: EndingLabel) {
  return endingLabel.long === '' ? endingLabel.word : `${endingLabel.word} (${endingLabel.long})`
}

/**
 * The coop club line. While the grid is being solved it says how much of it is
 * filled; no puzzle name, which is the game's TITLE, one line above on the same
 * card. Once it ends, the team's ending label (mine, when I played): "Solved",
 * or the timer running out on an unfinished grid, coop's one loss.
 */
function makeCoopLabel(summary: GSummaryData, myId: string): string {
  if (summary.ending === null) {
    // Coop always has its team count.
    const percent = Math.round((summary.team!.nFilledCells / summary.nCells) * 100)
    return statusLine(verdict('Playing'), `${percent}% filled`)
  }
  const player = summary.players.find((p) => p.id === myId) ?? summary.players[0]!
  return makeLead(makeEndingLabel(player, makeGameFacts(summary, 'coop'))!)
}

/**
 * The compete club line: no per-racer progress, and the race's one winner is
 * named once it is won. It leads with my ending label once I am out of play.
 */
function makeCompeteLabel(summary: GSummaryData, members: readonly Member[], myId: string): string {
  const me = summary.players.find((p) => p.id === myId)
  const myEndingLabel = me === undefined ? null : makeEndingLabel(me, makeGameFacts(summary, 'compete'))
  if (summary.ending === null && myEndingLabel === null) return verdict('Playing')

  const winnerName = findUsername(members, findWinnerIds(summary).find((id) => id !== myId) ?? null)
  const noWinner = summary.outcome === 'lost' && summary.ending!.reason !== 'conceded'
    ? 'no winner'
    : null

  if (myEndingLabel !== null) {
    if (summary.outcome === 'won') {
      if (myEndingLabel.labelType === 'won') return makeLead(myEndingLabel)
      // Someone else won: name them, beside my concession; a loss to their
      // solve is said by naming them.
      return myEndingLabel.labelType === 'conceded'
        ? statusLine(makeLead(myEndingLabel), wonBy(winnerName))
        : wonBy(winnerName)
    }
    return statusLine(makeLead(myEndingLabel), noWinner)
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

// The single source of truth for this game's user-facing brand name.
const BRAND = 'CrossPlay'

export const crosswordsCoopGame: GameManifest = {
  gametype: 'crosswords_coop',
  schema: 'crosswords',
  baseGametype: 'crosswords',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Solve a crossword together',
  logoUrl,
  help: helpLoader,
  // Solo (1, in a solo club) or coop (up to 8). Agrees with create_game.
  numberOfPlayers: [1, 8],
  draftsOffTurn: false,
  PlayArea: playAreaLoader,
  // Shared notepad (coop) / private per-player pad (compete — a shared pad
  // would leak solving progress).
  scratchpad: 'perPlayerInCompete',
  setupForm: {
    Component: setupFormLoader,
    defaults: CROSSWORDS_DEFAULTS,
    validate,
  },
  startGameInClub: startGameInClubFactory('coop'),
  summaryFor: (data, _members, myId) => makeCoopLabel(data as GSummaryData, myId),
  submitTimeout,
  // Coop has a whole-table "stop now" (a neutral mutual give-up).
  stopGame,
}

export const crosswordsCompeteGame: GameManifest = {
  gametype: 'crosswords_compete',
  schema: 'crosswords',
  baseGametype: 'crosswords',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Race the same crossword',
  logoUrl,
  help: helpLoader,
  // Compete needs an opponent; the RPC enforces ≥2 too.
  numberOfPlayers: [2, 8],
  draftsOffTurn: false,
  PlayArea: playAreaLoader,
  // Shared notepad (coop) / private per-player pad (compete — a shared pad
  // would leak solving progress).
  scratchpad: 'perPlayerInCompete',
  setupForm: {
    Component: setupFormLoader,
    defaults: CROSSWORDS_DEFAULTS,
    validate,
  },
  startGameInClub: startGameInClubFactory('compete'),
  summaryFor: (data, members, myId) => makeCompeteLabel(data as GSummaryData, members, myId),
  submitTimeout,
  // Compete has BOTH, as every race does: `concede` is one racer dropping out
  // (a loss on their record), Stop is the whole table agreeing to stop with no
  // result. The board offers Stop inside Concede's question, and the pause
  // overlay uses it too, as the escape from a wedged presence-pause.
  stopGame,
}
