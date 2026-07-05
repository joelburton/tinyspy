import { DifficultyField } from '../../common/components/fields/DifficultyField'
import { RadioRow } from '../../common/components/fields/RadioRow'
import { TimerField } from '../../common/components/fields/TimerField'
import type { SetupBodyProps } from '../../common/lib/games'
import {
  HAND_SIZE_OPTIONS,
  WORD_CHECK_OPTIONS,
  BANANAGRAMS_BAG_MAX,
  tilesNeeded,
  type BananagramsSetup,
} from '../lib/setup'
import form from '../../common/components/fields/setupForm.module.css'
import styles from './SetupForm.module.css'

/**
 * bananagrams's per-game setup form, rendered inside the common
 * `SetupGameDialog`. Choices:
 *
 *   - **Starter tiles** — how many tiles each player is dealt, one
 *     of {15, 21}. 21 is the Bananagrams default; 15 is a quicker
 *     game.
 *   - **Tiles in bag** — 1..144 (the full Bananagrams set is 144); a
 *     smaller bag makes a shorter game. Must hold at least one starter
 *     hand per player — the neutral hint below shows the live "deals N"
 *     figure, and the dialog's guard (manifest `validate` →
 *     `bagSizeError`) disables Start with a red reason when it can't.
 *   - **Dumping a tile** — "Return dumped tiles to the box": off (default) puts
 *     a dumped tile back in the bag; on takes it out of play (the game shrinks
 *     by one each dump).
 *   - **Words** — a 3-way `word_check` dictionary check (Off / At win / Every
 *     peel), plus two always-shown DifficultyField pickers (one for 2-letter
 *     words, band 2..6; one for longer words, 1..6, since 2-letter words are a
 *     separate, thinner vocabulary). *Every peel* (strict) refuses a peel whose
 *     board has an invalid word. The bands define what counts as a real word for
 *     the check AND the upcoming opt-in "check board" helper, so they show
 *     regardless of the mode. (Board geography — one connected grid — is always
 *     required to win, so it's not a knob.)
 *   - **Timer** — the shared `TimerField` (none / count-up / countdown
 *     MM:SS). A countdown that runs out ends the race as a loss for
 *     everyone (`bananagrams.submit_timeout`).
 *
 * Controlled component: state lives in the wrapper; we render `value`
 * and signal via `onChange`. The single cast at the top is the boundary
 * between the manifest's `unknown` setup and our narrow shape.
 */
export function SetupForm({ value, onChange, playerCount }: SetupBodyProps) {
  const s = value as BananagramsSetup
  const needed = tilesNeeded(s, playerCount)

  return (
    <div className={form.setup}>
      <fieldset className={form.fieldset}>
        <legend>Starter tiles per player</legend>
        <RadioRow
          name="hand_size"
          options={HAND_SIZE_OPTIONS.map((n) => ({ value: n, label: n }))}
          value={s.hand_size}
          onChange={(hand_size) => onChange({ ...s, hand_size })}
        />
      </fieldset>

      <fieldset className={form.fieldset}>
        <legend>Tiles in bunch</legend>
        <p className="muted">
          The full bag is {BANANAGRAMS_BAG_MAX}.
          This game deals {needed} ({playerCount} player
          {playerCount === 1 ? '' : 's'} × {s.hand_size}).
        </p>
        <input
          className={styles.bagInput}
          type="number"
          name="bag_size"
          min={1}
          max={BANANAGRAMS_BAG_MAX}
          step={1}
          value={Number.isFinite(s.bag_size) ? s.bag_size : ''}
          onChange={(e) => onChange({ ...s, bag_size: e.target.valueAsNumber })}
        />
      </fieldset>

      <fieldset className={form.fieldset}>
        <legend>Dumping a tile</legend>
        <label className={styles.checkRow}>
          <input
            type="checkbox"
            name="dump_to_box"
            checked={s.dump_to_box}
            onChange={(e) => onChange({ ...s, dump_to_box: e.target.checked })}
          />
          Return dumped tiles to the bag (out of play)
        </label>
        <p className="muted">
          By default a dumped tile goes back to the bunch. With this, it goes to the bag. You still draw three either way.
        </p>
      </fieldset>

      <fieldset className={form.fieldset}>
        <legend>Words</legend>
        <RadioRow
          name="word_check"
          prefix="Words must be legal"
          options={WORD_CHECK_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          value={s.word_check}
          onChange={(word_check) => onChange({ ...s, word_check })}
        />
        {/* The two band pickers are ALWAYS shown — not gated on
            word_check. They define which words count as "real" both for
            the word check (when on above) and for the upcoming opt-in
            "check board" helper a player can run mid-game even when the
            check is off. 2-letter words are a separate, thinner
            vocabulary, so they get their own band. */}
        <div className={styles.dictRow}>
          <DifficultyField
            label="2-letter words"
            length={2}
            minDifficulty={2}
            maxDifficulty={6}
            value={s.dict_2}
            onChange={(dict_2) => onChange({ ...s, dict_2 })}
          />
          <DifficultyField
            label="Longer words (3+)"
            length="3+"
            minDifficulty={1}
            maxDifficulty={6}
            value={s.dict_3plus}
            onChange={(dict_3plus) => onChange({ ...s, dict_3plus })}
          />
        </div>
      </fieldset>

      <TimerField
        value={s.timer}
        onChange={(timer) => onChange({ ...s, timer })}
      />
    </div>
  )
}
