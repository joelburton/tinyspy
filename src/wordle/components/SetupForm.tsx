import { DifficultyField } from '../../common/components/DifficultyField'
import { TimerField } from '../../common/components/TimerField'
import type { SetupBodyProps } from '../../common/lib/games'
import { answerMaxBand, GUESS_OPTIONS, type WordleSetup } from '../lib/setup'
import form from '../../common/components/setupForm.module.css'
import styles from './SetupForm.module.css'

/**
 * wordle's setup form, rendered inside the common SetupGameDialog.
 *
 *   - **Guesses** — the budget (5–8; 6 is classic Wordle). In coop it's
 *     shared by the team; in compete it's each player's own.
 *   - **Answer source** — where the target comes from: "0: Wordle" (the
 *     curated NYT list) or a difficulty band 1–6.
 *   - **Legal guesses** — how obscure a guess may be (band 1–6). Bands below
 *     the answer's hardest are disabled (you must be able to guess any answer);
 *     the manifest's `validate` gates Start on the same rule.
 *
 * Plus the shared `TimerField`. Controlled component (state lives in the
 * wrapper); shared by both manifests (mode doesn't change the form).
 */
export function SetupForm({ value, onChange }: SetupBodyProps) {
  const s = value as WordleSetup

  return (
    <div className={form.setup}>
      <fieldset className={form.fieldset}>
        <legend>Guesses</legend>
        <p className="muted">How many guesses you get (6 is classic).</p>
        <select
          className={styles.select}
          name="max_guesses"
          value={s.max_guesses}
          onChange={(e) =>
            onChange({ ...s, max_guesses: Number(e.target.value) })
          }
        >
          {GUESS_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n} guesses
            </option>
          ))}
        </select>
      </fieldset>
      <fieldset className={form.fieldset}>
        <legend>Words</legend>
        <DifficultyField
          label="Answer source"
          length={5}
          extraLowOption={{ value: 0, label: 'Wordle' }}
          minDifficulty={1}
          maxDifficulty={6}
          value={s.answer_source}
          onChange={(answer_source) => onChange({ ...s, answer_source })}
        />
        <DifficultyField
          label="Legal guesses"
          length={5}
          minDifficulty={answerMaxBand(s)}
          maxDifficulty={6}
          value={s.legal_guess}
          onChange={(legal_guess) => onChange({ ...s, legal_guess })}
        />
      </fieldset>
      <TimerField
        value={s.timer}
        onChange={(timer) => onChange({ ...s, timer })}
      />
    </div>
  )
}
