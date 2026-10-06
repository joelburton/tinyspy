// cs-unmet

import type { FormErrors } from '@/common/forms/formState'
import type { GPalette, GSetup } from '../types'

/*
 * setgame's per-game setup — collected by the start-game dialog, persisted to
 * `common.games.setup`, validated server-side in `setgame.create_game`. The
 * shape is `GSetupValues` / `GSetup`.
 *
 * **Mode is NOT on this type** — it's locked at the gametype level (the
 * sibling-manifest pattern), not a setup-time choice. Both manifests share this
 * same shape.
 *
 * There is no dictionary band (no words), no target (the deck decides when the
 * game ends), and no board-size choice — twelve follows from the deck, and the
 * deal-three rule owns everything above it.
 */
/**
 * The palette a game is played with, defaulting to traditional.
 *
 * `setup` is frozen at create time, so a game started before the palette knob
 * existed simply has no key — and any code that indexes a lookup table by it
 * would read `undefined` and fall over. (That is not hypothetical: it crashed
 * the printer the first time it drew a tile.) One place decides the default, so
 * the board, the Setup options list and the PDF cannot disagree about what an old game
 * looked like.
 */
export function paletteOf(setup: Partial<GSetup> | null | undefined): GPalette {
  return setup?.palette === 'colorblind' ? 'colorblind' : 'traditional'
}

/**
 * The single Start-gate validator for both manifests. Returns the error string
 * (which the dialog shows while disabling Start) or `null` when the setup is
 * valid. `create_game` re-checks server-side.
 */
export function setgameSetupError(setup: GSetup): FormErrors {
  if (setup.deck !== 'full' && setup.deck !== 'junior') {
    return { deck: 'Pick a deck.' }
  }
  if (setup.palette !== 'traditional' && setup.palette !== 'colorblind') {
    return { palette: 'Pick a color set.' }
  }
  return {}
}

/** Initial setup for the coop manifest: the full deck, no timer. */
export const DEFAULT_SETGAME_SETUP_COOP: GSetup = {
  timer: { kind: 'none' },
  deck: 'full',
  palette: 'traditional',
  // Coop pacing: free-for-all by default; the "Co-op" setup section (coop, 2+
  // players) offers turn-by-turn. first_turn_user_id is seeded by the field.
  coop_style: 'free-for-all',
}

/**
 * Initial setup for the compete manifest — the same deck and timer choices.
 *
 * Worth a note that a timer is NOT defaulted on, even though compete's timer is
 * the one adjudication this game has that coop's doesn't: a race here already
 * ends on its own when the deck runs dry, so the timer is for people who want a
 * short game, not a structural need.
 */
export const DEFAULT_SETGAME_SETUP_COMPETE: GSetup = {
  timer: { kind: 'none' },
  deck: 'full',
  palette: 'traditional',
}
