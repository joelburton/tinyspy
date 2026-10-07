// cs-blessed-psychicnum

import { lazy } from 'react'
import { runRpc } from '@/common/supabase/dbResult'
import type { CreatedGame, GameManifest } from '@/common/manifest/gameManifest'
import { db } from './db'
import { verdict, statusLine, tally, wonBy } from '@/common/manifest/summary'
import { makeRpcDispatcher } from '@/common/manifest/manifestRpcs'
import { findWinnerIds } from '@/common/manifest/summaryData'
import { findUsername } from '@/common/members/memberList'
import type { EndingLabel } from '@/common/ending/endingLabel'
import { makeEndingLabel, REASON_DETAIL } from './lib/endingLabel'
import { DEFAULT_PSYCHICNUM_SETUP } from './lib/setup'
import logoUrl from './logo.svg?url'
import type { GSetup, GSummaryData } from './types'

/**
 * psychicnum's registration with the shell — **two manifests,
 * one schema, one folder.**
 *
 * psychicnum exists in coop and compete modes, each a separate
 * row in `common.gametypes` ('psychicnum_coop',
 * 'psychicnum_compete') and a separate Start button on the
 * club page. Both share:
 *
 *   - the `psychicnum` schema (tables, RPCs, RLS — see
 *     supabase/migrations/20260615000002_psychicnum.sql)
 *   - the folder `src/psychicnum/` (PlayArea, SetupForm, Help,
 *     useGame, theme.css, logo.svg)
 *   - the doc `src/psychicnum/doc.md`
 *
 * They differ on:
 *
 *   - `gametype` string, used as the URL segment + registry key.
 *   - `name` shown in titles and on the Start button.
 *   - `mode` declaration, which the club page reads (see
 *     GameManifest.mode in src/common/manifest/gameManifest.ts);
 *     the game page reads the row's own, `cg.mode`.
 *   - `numberOfPlayers`: coop allows solo (`[1, 6]`), compete
 *     requires an opposing player (`[2, 6]`).
 *   - `summaryFor`: the ended game's label reads differently per mode.
 *
 * Both share `baseGametype: 'psychicnum'` — the family key any
 * code wanting "treat these as siblings" reads.
 *
 * The single shared `startGameInClub` builds the RPC payload
 * with the per-manifest mode injected — `psychicnum.create_game`
 * routes on it server-side.
 */

// Help loader is shared — both modes link to the same rules
// modal. Lazy so the prose ships in psychicnum's chunk.
const helpLoader = lazy(() =>
  import('./components/Help').then((m) => ({ default: m.Help })),
)

// PlayArea is shared; it reads `cg.mode` for what differs.
const playAreaLoader = lazy(() =>
  import('./components/PlayArea').then((m) => ({ default: m.PlayAreaLoader })),
)

// SetupForm is shared; mode is the manifest's, not a setup choice, so it has
// no mode picker.
const setupFormLoader = lazy(() =>
  import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
)

// Shared start-game caller. `mode` is the per-manifest constant
// — the RPC routes on it to write the right gametype string +
// per-mode end-game vocabulary.
function startGameInClubFactory(mode: 'coop' | 'compete') {
  return (clubHandle: string, setup: unknown, playerUserIds: string[]) =>
    // No `.single()`: the RPC returns the envelope itself, one jsonb value.
    runRpc<CreatedGame>(
      db.rpc('create_game', {
        p_club_handle: clubHandle,
        p_setup: setup as GSetup,
        p_player_user_ids: playerUserIds,
        p_mode: mode,
      }),
    )
}

// The summary reads the game's `summary_data` (`GSummaryData`: the common part
// with its ending, and `team`, the team's found and used counts, null in
// compete). Each mode's summaryFor handles its own endings; the helpers below
// cover coop's tallies.

/** The team's finds against the secrets. Coop always has a team. */
function foundTally(summary: GSummaryData) {
  return tally(summary.team!.nFoundSecrets, summary.nReqdSecrets, 'found')
}

/**
 * The mid-game progress, COOP only. In compete every player holds their own
 * budget and hunts the same three secrets independently, and a found-count
 * would tell you exactly how close your opponent is. This line is club-wide
 * readable, so compete says nothing — and its `summary_data.team` is null.
 */
function labelMidGame(summary: GSummaryData) {
  return statusLine(
    verdict('Playing'),
    foundTally(summary),
    tally(summary.team!.nGuessesUsed, summary.maxGuesses, 'guesses'),
  )
}

/** An ending label as the club line leads with it: the word, its detail in parentheses. */
function makeLead(endingLabel: EndingLabel) {
  return endingLabel.long === '' ? endingLabel.word : `${endingLabel.word} (${endingLabel.long})`
}


// Single source of truth for this game's user-facing brand name —
// both manifests' name and the start-game error read it. The brand
// keeps its display casing; code identifiers are the lowercase codename.
const BRAND = 'PsychicNum'

// Timeout + manual end — the shared one-arg RPC dispatchers, referenced by both
// sibling manifests (see common/manifest/manifestRpcs).
const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const stopGame = makeRpcDispatcher(db, 'stop_game')

export const psychicnumCoopGame: GameManifest = {
  gametype: 'psychicnum_coop',
  schema: 'psychicnum',
  baseGametype: 'psychicnum',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Find the three secret words together',
  logoUrl,

  help: helpLoader,

  // Solo or coop up to 6. Must agree with the server-side
  // _require_player_count_max(6) call in psychicnum.create_game.
  numberOfPlayers: [1, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_PSYCHICNUM_SETUP,
  },

  startGameInClub: startGameInClubFactory('coop'),

  summaryFor: (data, members, myId) => {
    const summary = data as GSummaryData
    if (summary.ending === null) return labelMidGame(summary)
    // The team comes out as one, so any seat's ending label is the team's: mine
    // when I played.
    const player = summary.players.find((p) => p.id === myId) ?? summary.players[0]!
    const endingLabel = makeEndingLabel(player, { mode: 'coop', ended: true, reason: summary.ending.reason })!
    if (endingLabel.labelType === 'won') {
      // A team win, but naming who landed the third secret is the fun bit: the
      // guess that found it is the act that ended the game.
      const guesser = findUsername(members, summary.ending.by)
      return statusLine(makeLead(endingLabel), guesser && `${guesser} guessed it`)
    }
    return statusLine(makeLead(endingLabel), foundTally(summary))
  },

  submitTimeout,
  stopGame,
}

export const psychicnumCompeteGame: GameManifest = {
  gametype: 'psychicnum_compete',
  schema: 'psychicnum',
  baseGametype: 'psychicnum',
  mode: 'compete',
  name: BRAND,
  shortDescription: 'Race to find the three secret words',
  logoUrl,

  help: helpLoader,

  // Compete needs an opposing PLAYER — racing yourself is
  // degenerate. Lower bound 2 hides the Start button in solo
  // clubs; the RPC also enforces this server-side.
  numberOfPlayers: [2, 6],

  draftsOffTurn: false,
  scratchpad: 'none',

  PlayArea: playAreaLoader,

  setupForm: {
    Component: setupFormLoader,
    defaults: DEFAULT_PSYCHICNUM_SETUP,
  },

  startGameInClub: startGameInClubFactory('compete'),

  summaryFor: (data, members, myId) => {
    const summary = data as GSummaryData
    const game = { mode: 'compete', ended: summary.ended, reason: summary.ending?.reason ?? null } as const
    // My result once I am out of play — mid-race too — or null while I play
    // or when I was not in this game.
    const me = summary.players.find((p) => p.id === myId)
    const myEndingLabel = me === undefined ? null : makeEndingLabel(me, game)
    // No progress while I play: a race has no team, every player's budget and
    // finds are their own (see labelMidGame), and this line is readable by the
    // whole club.
    if (summary.ending === null && myEndingLabel === null) return verdict('Playing')

    // A race has one winner; a race nobody won says so, unless everyone
    // conceding says it already.
    const winner = findUsername(members, findWinnerIds(summary)[0] ?? null)
    const noWinner = summary.outcome === 'lost' && summary.ending!.reason !== 'conceded'
      ? 'no winner'
      : null

    if (myEndingLabel !== null) {
      // Someone else won: name them, beside my concession if I conceded.
      if (summary.outcome === 'won' && myEndingLabel.labelType !== 'won') {
        return myEndingLabel.labelType === 'conceded'
          ? statusLine(makeLead(myEndingLabel), wonBy(winner))
          : wonBy(winner)
      }
      return statusLine(makeLead(myEndingLabel), noWinner)
    }

    // A member who did not play: the game's own result.
    switch (summary.outcome!) {
      case 'won':
        return wonBy(winner)
      case 'lost':
        return statusLine(verdict('Lost', REASON_DETAIL[summary.ending!.reason] ?? null), noWinner)
      case 'neutral':
        return 'Stopped'
      default:
        return summary.outcome!
    }
  },

  submitTimeout,
  stopGame,
}
