import { TimerField } from '../../common/components/TimerField'
import { DifficultyField } from '../../common/components/DifficultyField'
import { SelectField } from '../../common/components/SelectField'
import { RadioRow } from '../../common/components/RadioRow'
import type { SetupBodyProps } from '../../common/lib/games'
import {
  GUESS_OPTIONS,
  WORD_COUNT_OPTIONS,
  type PsychicnumSetup,
} from '../lib/setup'
import styles from '../../common/components/setupForm.module.css'

/**
 * psychicnum's per-game setup form, rendered inside the common
 * `SetupGameDialog`. Choices for the players:
 *
 *   - **Guesses** — guess budget, one of {3, 5, 7, 9}.
 *   - **Words on the board** — how many words (5..20); three are secret.
 *   - **Word difficulty** — the dictionary band the board is drawn from
 *     (the shared `<DifficultyField>`).
 *   - **Timer** — the shared `<TimerField>`.
 *
 * No member-aware UI (every guess is interchangeable; no seats),
 * no auto-seeding logic — the manifest's defaults already cover
 * a usable initial state.
 *
 * Controlled component pattern, same as the codenamesduet form: state
 * lives in the wrapper; we render from `value` and signal via
 * `onChange`. The single `value as PsychicnumSetup` cast at
 * the top is the boundary between the manifest's `unknown` setup
 * type and psychicnum's narrow shape.
 *
 * Component name `SetupForm` matches the file + the
 * `manifest.setupForm` field — this is the *form definition*,
 * distinct from `PsychicnumSetup` (the *data shape* the form
 * produces, stored on `common.games.setup`). The folder path
 * (`psychicnum/components/SetupForm.tsx`) disambiguates from the
 * other games' SetupForm components.
 */
export function SetupForm({ value, onChange }: SetupBodyProps) {
  const s = value as PsychicnumSetup

  return (
    <div className={styles.setup}>
      <fieldset className={styles.fieldset}>
        <legend>Guesses per player</legend>
        {/* Copy is mode-neutral on purpose — the same SetupForm
            backs both psychicnum_coop and psychicnum_compete
            manifests. In coop this is the shared pool (per-player
            value equals shared value because everyone decrements
            in lock-step); in compete each player gets this many
            independently. The number-on-the-radio carries the
            same meaning either way. */}
        <p className="muted">
          How many guesses each player starts with.
        </p>
        <RadioRow
          name="guesses"
          options={GUESS_OPTIONS.map((n) => ({ value: n, label: n }))}
          value={s.guesses}
          onChange={(guesses) => onChange({ ...s, guesses })}
        />
      </fieldset>
      <fieldset className={styles.fieldset}>
        <legend>Words on the board</legend>
        {/* The board shows this many words; three of them are the hidden
            secrets, so a bigger board is more haystack. Same in both modes. */}
        <p className="muted">
          {s.word_count} words on the board — find the 3 secrets among them.
        </p>
        <SelectField
          value={s.word_count}
          onChange={(v) => onChange({ ...s, word_count: Number(v) })}
        >
          {WORD_COUNT_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </SelectField>
      </fieldset>
      <fieldset className={styles.fieldset}>
        <legend>Word difficulty</legend>
        {/* Dictionary band: board words are drawn from common.words at
            difficulty ≤ this (harder bands add more obscure words). */}
        <p className="muted">
          How obscure the board words can get.
        </p>
        <DifficultyField
          length={null}
          minDifficulty={1}
          maxDifficulty={6}
          value={s.difficulty}
          onChange={(difficulty) => onChange({ ...s, difficulty })}
        />
      </fieldset>
      <TimerField
        value={s.timer}
        onChange={(timer) => onChange({ ...s, timer })}
      />
    </div>
  )
}
