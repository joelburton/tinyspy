import { DifficultyField } from '../../common/components/fields/DifficultyField'
import { SelectField } from '../../common/components/fields/SelectField'
import { TimerField } from '../../common/components/fields/TimerField'
import { CoopStyleField } from '../../common/components/fields/CoopStyleField'
import { SetupSection } from '../../common/components/setup/SetupSection'
import { difficultyValue } from '../../common/lib/game/difficulty'
import type { SetupBodyProps } from '../../common/lib/games'
import { answerMaxBand, GUESS_OPTIONS, type WordleSetup } from '../lib/setup'
import form from '../../common/components/fields/setupForm.module.css'

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
export function SetupForm({ mode, players, value, onChange }: SetupBodyProps) {
  const s = value as WordleSetup

  // Disclosure summaries carry the current values so each section reads without
  // opening (the boggle/scrabble/spellingbee pattern). Answer source 0 is the
  // curated Wordle list — not a difficulty band — so it formats as "0 (Wordle)".
  const guessesLabel = `Guesses: ${s.max_guesses}`
  const answerValue =
    s.answer_source === 0 ? '0 (Wordle)' : difficultyValue(s.answer_source)
  const dictLabel = `Dictionaries: ${answerValue} / ${difficultyValue(s.legal_guess)}`

  return (
    <div className={form.setup}>
      <SetupSection label={guessesLabel}>
        <p className="muted">How many guesses you get (6 is classic).</p>
        <SelectField
          name="max_guesses"
          value={s.max_guesses}
          onChange={(v) => onChange({ ...s, max_guesses: Number(v) })}
        >
          {GUESS_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n} guesses
            </option>
          ))}
        </SelectField>
      </SetupSection>
      <SetupSection label={dictLabel}>
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
      </SetupSection>
      <CoopStyleField
        mode={mode}
        players={players}
        coopStyle={s.coopStyle ?? 'free-for-all'}
        firstTurnUserId={s.firstTurnUserId ?? ''}
        onChange={({ coopStyle, firstTurnUserId }) =>
          onChange({ ...s, coopStyle, firstTurnUserId })
        }
      />
      <TimerField
        value={s.timer}
        onChange={(timer) => onChange({ ...s, timer })}
      />
    </div>
  )
}
