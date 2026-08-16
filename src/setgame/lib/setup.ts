import type { TimerMode } from '../../common/lib/games'
import type { CoopTurnSetup } from '../../common/components/fields/CoopStyleField'
import type { DeckKind } from './cards'

/**
 * setgame's per-game setup — collected by the start-game dialog, persisted to
 * `common.games.setup`, validated server-side in `setgame.create_game`.
 *
 * **Mode is NOT on this type** — it's locked at the gametype level (the
 * sibling-manifest pattern), not a setup-time choice. Both manifests share this
 * same shape.
 *
 * Three knobs beyond the timer:
 *
 *   - `deck` — the full 81-card deck, or **junior**: shading dropped, so every
 *     card is solid, 27 cards, dealt nine at a time. This is the difficulty dial
 *     every other game has in some form. Dropping an attribute is the real Set
 *     Junior's own idea, and it is a genuinely different game to scan rather
 *     than a slower version of the same one.
 *   - `palette` — see below.
 *   - `coop_style` (+ `first_turn_user_id`), from the shared `CoopTurnSetup`:
 *     the opt-in turn-by-turn coop every discrete-move game offers.
 *
 * There is no dictionary band (no words), no target (the deck decides when the
 * game ends), and no board-size choice — twelve follows from the deck, and the
 * deal-three rule owns everything above it.
 */
/** Which pigments the three color values are painted with. */
export type Palette = 'traditional' | 'colorblind'

export type SetgameSetup = CoopTurnSetup & {
  timer: TimerMode
  /** Which deck to play with. */
  deck: DeckKind
  /**
   * The card palette. `traditional` is Set's own red / green / purple;
   * `colorblind` swaps in blue / orange / magenta, which stay separable under
   * red-green color vision deficiency (~8% of men).
   *
   * It matters more here than the same option would in most games, because two
   * cards can differ ONLY by color — the other three attributes are identical
   * on them, so shape and shading cannot rescue a pair you can't tell apart.
   *
   * A PER-GAME choice, so a mixed table has to agree on one. The property it
   * really tracks belongs to a PLAYER, not a game; if that ever bites, the
   * answer is a profile preference rather than a second setup field.
   */
  palette: Palette
}

/**
 * The palette a game is played with, defaulting to traditional.
 *
 * `setup` is frozen at create time, so a game started before the palette knob
 * existed simply has no key — and any code that indexes a lookup table by it
 * would read `undefined` and fall over. (That is not hypothetical: it crashed
 * the printer the first time it drew a card.) One place decides the default, so
 * the board, the setup recap and the PDF cannot disagree about what an old game
 * looked like.
 */
export function paletteOf(setup: Partial<SetgameSetup> | null | undefined): Palette {
  return setup?.palette === 'colorblind' ? 'colorblind' : 'traditional'
}

/**
 * The single Start-gate validator for both manifests. Returns the error string
 * (which the dialog shows while disabling Start) or `null` when the setup is
 * valid. `create_game` re-checks server-side.
 */
export function setgameSetupError(setup: SetgameSetup): string | null {
  if (setup.deck !== 'full' && setup.deck !== 'junior') {
    return 'Pick a deck.'
  }
  if (setup.palette !== 'traditional' && setup.palette !== 'colorblind') {
    return 'Pick a color set.'
  }
  return null
}

/** Initial setup for the coop manifest: the full deck, no timer. */
export const DEFAULT_SETGAME_SETUP_COOP: SetgameSetup = {
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
 * Worth a note that a timer is NOT defaulted on, even though compete's clock is
 * the one adjudication this game has that coop's doesn't: a race here already
 * ends on its own when the deck runs dry, so the clock is for people who want a
 * short game, not a structural need.
 */
export const DEFAULT_SETGAME_SETUP_COMPETE: SetgameSetup = {
  timer: { kind: 'none' },
  deck: 'full',
  palette: 'traditional',
}
