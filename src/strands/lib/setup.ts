import type { TimerMode } from '../../common/lib/games'
import type { CoopTurnSetup } from '../../common/components/fields/CoopStyleField'

/**
 * strands' per-game setup — collected by the start-game dialog, persisted to
 * `common.games.setup`, and validated server-side by `strands.create_game`
 * (the authority for what is accepted).
 *
 * Lives in `lib/` rather than `manifest.ts` so the SetupForm body can import the
 * type without dragging the manifest into its lazy chunk.
 */
export type StrandsSetup = CoopTurnSetup & {
  /** Which archived puzzle to play — OPTIONAL, because the dialog no longer
   *  collects it. Absence is how `create_game` is told to derive the next
   *  puzzle none of the selected players has played
   *  (`strands.next_puzzle_for_club`). It stays in the type because the RPC
   *  still honours an explicit id, which is what the pgTAP and e2e fixtures
   *  pin their assertions to. */
  puzzleId?: string
  /**
   * Dictionary ceiling for HINT words (1..6).
   *
   * **Note the direction: a HIGHER band makes strands EASIER.** More words
   * qualify, so hints come faster. That is the same direction as spellingbee's
   * `legal` band and the OPPOSITE of waffle's tier, where a higher band means a
   * harder board — which is exactly the sort of thing a setup form gets
   * backwards, so the field's copy says so out loud.
   *
   * Gated on difficulty ALONE (the may-enter tier in docs/common.md): a word
   * the player chose to type is unrestricted by slur / crude / slang / dialect.
   */
  band: number
  /** Valid non-theme words needed per hint. NYT plays 3. */
  hint_cost: number
  /**
   * Shortest word that can earn a hint point.
   *
   * Does NOT gate theme words: those are matched first and unconditionally, so
   * raising this never makes a real answer unfindable. (33 of 148 sampled theme
   * words are exactly 4 letters, so a length-first check would break most
   * puzzles at 5.)
   */
  min_word_length: number
  /** `countdown` ends the game via `strands.submit_timeout`; the clock is a LOSS. */
  timer: TimerMode
}

/** Band 5 matches the other word games' "legal" default: generous enough that
 *  hints are earnable without handing them out. */
/* NO `puzzleId` KEY — not `''`. The server reads an ABSENT puzzleId as "you
 * choose"; an empty string is present-but-unparseable and would fail the uuid
 * cast with `bad-puzzle-id|` instead. */
export const DEFAULT_STRANDS_SETUP_COOP: StrandsSetup = {
  band: 5,
  hint_cost: 3,
  min_word_length: 4,
  timer: { kind: 'none' },
  coop_style: 'free-for-all',
}

/** Compete's defaults. Identical to coop's but for the pacing field, which is
 *  meaningless in a race — everyone plays at once, always. */
export const DEFAULT_STRANDS_SETUP_COMPETE: StrandsSetup = {
  ...DEFAULT_STRANDS_SETUP_COOP,
  coop_style: 'free-for-all',
}
