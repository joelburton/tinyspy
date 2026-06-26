import { DifficultyField } from '../../common/components/DifficultyField'
import { TimerField } from '../../common/components/TimerField'
import type { SetupBodyProps } from '../../common/lib/games'
import {
  HAND_SIZE_OPTIONS,
  MONKEYGRAM_BAG_MAX,
  tilesNeeded,
  type MonkeyGramSetup,
} from '../lib/setup'
import styles from './SetupForm.module.css'

/**
 * MonkeyGram's per-game setup form, rendered inside the common
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
 *   - **Words** — an opt-in "require real words to win" dictionary check on the
 *     winning peel, plus two always-shown DifficultyField pickers (one for
 *     2-letter words, band 2..6; one for longer words, 1..6, since 2-letter
 *     words are a separate, thinner vocabulary). The bands define what counts as
 *     a real word for both the win check AND the upcoming opt-in "check board"
 *     helper, so they show regardless of the checkbox. (Board geography — one
 *     connected grid — is always required, so it's not a knob.)
 *   - **Timer** — the shared `TimerField` (none / count-up / countdown
 *     MM:SS). A countdown that runs out ends the race as a loss for
 *     everyone (`monkeygram.submit_timeout`).
 *
 * Controlled component: state lives in the wrapper; we render `value`
 * and signal via `onChange`. The single cast at the top is the boundary
 * between the manifest's `unknown` setup and our narrow shape.
 */
export function SetupForm({ value, onChange, playerCount }: SetupBodyProps) {
  const s = value as MonkeyGramSetup
  const needed = tilesNeeded(s, playerCount)

  return (
    <div className={styles.setup}>
      <fieldset className={styles.fieldset}>
        <legend>Starter tiles per player</legend>
        <p className="muted">
          How many tiles each player is dealt. First to place them all wins.
        </p>
        <div className={styles.radioRow}>
          {HAND_SIZE_OPTIONS.map((n) => (
            <label key={n} className={styles.radio}>
              <input
                type="radio"
                name="hand_size"
                checked={s.hand_size === n}
                onChange={() => onChange({ ...s, hand_size: n })}
              />
              {n}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Tiles in bag</legend>
        <p className="muted">
          The full bag is {MONKEYGRAM_BAG_MAX}; fewer makes a shorter game.
          This game deals {needed} ({playerCount} player
          {playerCount === 1 ? '' : 's'} × {s.hand_size}).
        </p>
        <input
          className={styles.bagInput}
          type="number"
          name="bag_size"
          min={1}
          max={MONKEYGRAM_BAG_MAX}
          step={1}
          value={Number.isFinite(s.bag_size) ? s.bag_size : ''}
          onChange={(e) => onChange({ ...s, bag_size: e.target.valueAsNumber })}
        />
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Dumping a tile</legend>
        <label className={styles.checkRow}>
          <input
            type="checkbox"
            name="dump_to_box"
            checked={s.dump_to_box}
            onChange={(e) => onChange({ ...s, dump_to_box: e.target.checked })}
          />
          Return dumped tiles to the box (out of play)
        </label>
        <p className="muted">
          By default a dumped tile goes back in the bag. To the box, it leaves
          the bunch (so the game ends sooner) — though a dump can pull from the
          box if the bunch runs low. You still draw three either way.
        </p>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Words</legend>
        <p className="muted">
          To go out, your tiles must always form one connected grid. Optionally,
          require every word in it to be real:
        </p>
        <label className={styles.checkRow}>
          <input
            type="checkbox"
            name="check_words"
            checked={s.check_words}
            onChange={(e) => onChange({ ...s, check_words: e.target.checked })}
          />
          Require real words to win
        </label>
        {/* The two band pickers are ALWAYS shown — not gated on
            check_words. They define which words count as "real" both for
            the win check (when required above) and for the upcoming
            opt-in "check board" helper a player can run mid-game even
            when the win check is off. 2-letter words are a separate,
            thinner vocabulary, so they get their own band. */}
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
