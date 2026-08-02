import { lazy } from 'react'
import type { CommonGameListRow, GameManifest } from '../common/lib/games'
import { db } from './db'
import { count, outcome, statusLine, wonBy } from '../common/lib/game/statusLabel'
import { makeRpcDispatcher } from '../common/lib/game/manifestRpcs'
import { DEFAULT_SCRABBLE_SETUP, validateScrabbleSetup, type ScrabbleSetup } from './lib/setup'
import logoUrl from './logo.svg?url'

/**
 * scrabble's registration with the shell — a Scrabble-style word game
 * (codename `scrabble`); see docs/games/scrabble.md.
 *
 * Two-manifest family (sibling pattern): coop and compete share the
 * `scrabble` schema and the PlayArea / SetupForm / Help, differing on the
 * gametype string, name, mode, and numberOfPlayers. The setup is the
 * dictionary band + an optional timer; the countdown ends via
 * `submitTimeout`.
 */

const helpLoader = lazy(() =>
  import('./components/Help').then((m) => ({ default: m.Help })),
)
const playAreaLoader = lazy(() =>
  import('./components/PlayArea').then((m) => ({ default: m.PlayArea })),
)
const setupFormLoader = lazy(() =>
  import('./components/SetupForm').then((m) => ({ default: m.SetupForm })),
)

/** Shared start-game caller. `mode` is the per-manifest constant; the RPC
 *  routes on it to write the right gametype string + per-mode dealing. */
function startGameInClubFactory(mode: 'coop' | 'compete', brand: string) {
  return async (clubHandle: string, setup: unknown, playerUserIds: string[]) => {
    const s = setup as ScrabbleSetup
    const { data, error } = await db
      .rpc('create_game', {
        target_club: clubHandle,
        setup: s,
        player_user_ids: playerUserIds,
        mode,
      })
      .single()
    if (error || !data) {
      return { error: error?.message ?? `failed to start ${brand} (${mode})` }
    }
    return { id: data.id }
  }
}

// Timeout + manual end — the shared one-arg RPC dispatchers (see
// common/lib/game/manifestRpcs).
const submitTimeout = makeRpcDispatcher(db, 'submit_timeout')
const endGame = makeRpcDispatcher(db, 'end_game')

/** Pure one-line label for the ClubPage games list. Mid-game shows the tiles
 *  left in the bag (+ the team score in coop); terminal shows the result —
 *  "ended" for a manual stop, the winner's name or "tie" in compete, the final
 *  team score in coop. (All values come off `row.status`, written by the RPCs;
 *  the title separately carries the first words played.) */
/**
 * scrabble's club-page status line.
 *
 * Coop is the odd one: a table with no opponent can't really "win", so playing
 * the bag out ('complete') and grinding to a halt on six scoreless turns
 * ('blocked') are both a neutral score report — the SQL still writes them as
 * `won`, and the label says `Ended`, because the number is the point. The one
 * genuine coop loss is the clock.
 */
function labelFor(mode: 'coop' | 'compete') {
  return (row: CommonGameListRow): string => {
    const s = (row.status ?? {}) as {
      team_score?: number; bag_count?: number
      winner_username?: string | null; winner_score?: number; outcome?: string
    }
    const score = s.team_score != null ? `${s.team_score} pts` : null
    switch (row.play_state) {
      case 'playing':
        return statusLine(
          outcome('Playing'), mode === 'coop' ? score : null,
          count(s.bag_count, 'tile left', 'tiles left'))
      case 'won':
        // Coop finished. Name HOW only when it wasn't the ordinary way.
        return statusLine(outcome('Ended', COOP_END[s.outcome ?? ''] ?? null), score)
      case 'won_compete':
        return statusLine(wonBy(s.winner_username),
                          s.winner_score != null ? `${s.winner_score} pts` : null)
      case 'lost':
        // Compete's all-conceded end, and coop's clock.
        return s.outcome === 'conceded'
          ? outcome('Lost', 'all conceded')
          : statusLine(outcome('Lost', 'out of time'), score)
      case 'ended':
        return statusLine(outcome('Ended'), mode === 'coop' ? score : null)
      default:
        return row.play_state
    }
  }
}

/** How a coop table stopped, when it's worth naming (scrabble._finish). */
const COOP_END: Record<string, string> = {
  blocked: 'no moves left',
}

// Single source of truth for this game's user-facing brand name —
// both manifests' name and the start-game error read it, so a fork
// rebrands by editing this one line. Codename stays lowercase in code.
const BRAND = 'RackAttack'

export const scrabbleCoopGame: GameManifest = {
  gametype: 'scrabble_coop',
  schema: 'scrabble',
  baseGametype: 'scrabble',
  mode: 'coop',
  name: BRAND,
  shortDescription: 'Build words together on one board',
  logoUrl,
  help: helpLoader,
  // Solo or coop up to 4. Must agree with require_player_count_max(4).
  numberOfPlayers: [1, 4],
  PlayArea: playAreaLoader,
  setupForm: { Component: setupFormLoader, defaults: DEFAULT_SCRABBLE_SETUP },
  startGameInClub: startGameInClubFactory('coop', BRAND),
  labelFor: labelFor('coop'),
  submitTimeout,
  endGame,
}

export const scrabbleCompeteGame: GameManifest = {
  gametype: 'scrabble_compete',
  schema: 'scrabble',
  baseGametype: 'scrabble',
  mode: 'compete',
  // Solo play seats an autonomous AI opponent (§12), so a solo club's mode
  // pill says "AI Compete" (vs bananagrams' pill-less "compete for 1").
  aiOpponent: true,
  name: BRAND,
  shortDescription: 'Race for the highest score',
  logoUrl,
  help: helpLoader,
  // Compete needs an opposing player — but an AI counts, so the HUMAN floor is
  // 1 (solo vs AI). The real "≥2 total (humans + AI)" floor is enforced by the
  // setup `validate` below + the RPC. Max 4 total.
  numberOfPlayers: [1, 4],
  PlayArea: playAreaLoader,
  // `validate` blocks Start when an AI is present and the dictionary is too
  // narrow for its level, or the head-count doesn't fit (docs/scrabble-ai-strength.md).
  setupForm: { Component: setupFormLoader, defaults: DEFAULT_SCRABBLE_SETUP, validate: validateScrabbleSetup },
  startGameInClub: startGameInClubFactory('compete', BRAND),
  labelFor: labelFor('compete'),
  submitTimeout,
  endGame,
}
