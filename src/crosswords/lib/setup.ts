import type { TimerMode } from '../../common/lib/games'

/**
 * The setup blob the dialog collects and `crosswords.create_game`
 * validates. `mode` is NOT here — it's a top-level manifest/RPC arg (the
 * sibling-pair split). Crosswords has no timer, so `timer` is always
 * `{ kind: 'none' }` (present only because `create_game` validates it);
 * `puzzle_id` names the chosen library puzzle.
 */
export type CrosswordsSetup = {
  timer: TimerMode
  puzzle_id: string
}

/** Default setup: no timer, no puzzle chosen yet (the picker fills it in;
 *  `validate` blocks Start until it's set). */
export const CROSSWORDS_DEFAULTS: CrosswordsSetup = {
  timer: { kind: 'none' },
  puzzle_id: '',
}
