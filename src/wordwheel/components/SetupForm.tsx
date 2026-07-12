import { DifficultyField } from '../../common/components/fields/DifficultyField'
import { RadioRow } from '../../common/components/fields/RadioRow'
import { TimerField } from '../../common/components/fields/TimerField'
import { SetupSection } from '../../common/components/setup/SetupSection'
import { difficultyValue } from '../../common/lib/game/difficulty'
import { cls } from '../../common/lib/util/cls'
import type { SetupBodyProps } from '../../common/lib/games'
import { RANKS } from '../lib/ranks'
import type { WordwheelSetup } from '../lib/setup'
import styles from '../../common/components/fields/setupForm.module.css'
import local from './SetupForm.module.css'

/** Normalize a letter input: lowercase, drop anything but a–z, cap the length.
 *  Keeps state canonical (lowercase, letters-only) so validation + the edge
 *  function agree; the UI uppercases via CSS for the wheel look. */
const cleanLetters = (raw: string, max: number) =>
  raw.toLowerCase().replace(/[^a-z]/g, '').slice(0, max)

/**
 * Allowed target-rank choices for the compete picker. The full
 * 7-rank ladder is `RANKS[0..6]` (Start, Good, Solid, Nice,
 * Great, Amazing, Genius), but Start (0) is trivially won (every
 * player starts at it) and Good (1) typically lands on the first
 * required word — neither makes a meaningful race. We expose
 * Solid..Genius (indices 2..6). Default lands on Amazing (5) per
 * the design conversation.
 */
const TARGET_RANK_CHOICES = [2, 3, 4, 5, 6] as const

/**
 * wordwheel's per-game setup form. Mode is locked at the gametype
 * level (coop or compete — picked by which Start button the
 * player clicked), so this body never renders a mode radio.
 *
 * Coop: a short paragraph + the shared `<TimerField>`. That's it.
 *
 * Compete: adds a target-rank picker. The default seed comes
 * from the compete manifest's `setupForm.defaults.target_rank`
 * (5 = Amazing), and the picker covers Solid..Genius — Start and
 * Good drop out because a target rank below Solid is a no-race.
 *
 * Controlled component pattern: state lives in the wrapping
 * `SetupGameDialog`, this body renders `value` and signals via
 * `onChange`. The `value as WordwheelSetup` cast at the top is the
 * boundary between the manifest's `unknown` setup type and
 * wordwheel's narrow shape.
 */
export function SetupForm({ mode, value, onChange }: SetupBodyProps) {
  const s = value as WordwheelSetup

  // Disclosure summaries carry the current value so it reads without opening.
  const dictLabel = `Dictionaries: ${difficultyValue(s.required)} / ${difficultyValue(s.legal)}`
  const customCenter = (s.custom_center ?? '').toUpperCase()
  const customOuter = (s.custom_letters ?? '').toUpperCase()
  const customLabel =
    customCenter && customOuter
      ? `Custom letters: ${customCenter}-${customOuter}`
      : 'Custom letters (optional)'

  return (
    <div className={styles.setup}>
      {mode === 'coop' ? (
        <p className="muted">
          Everyone in the club types words into the same wheel
          and the team racks up the score together.
        </p>
      ) : (
        <p className="muted">
          Each player works the same wheel independently. First
          to the target rank wins; the rest of the time you only
          see each other's rank, not the words you found.
        </p>
      )}

      {mode === 'compete' && (
        <fieldset className={styles.fieldset}>
          <legend>Target rank — first to reach it wins</legend>
          <RadioRow
            name="target_rank"
            options={TARGET_RANK_CHOICES.map((idx) => ({ value: idx, label: RANKS[idx] }))}
            value={s.target_rank}
            onChange={(target_rank) => onChange({ ...s, target_rank })}
          />
        </fieldset>
      )}

      {/* "Dictionaries" — the required/legal word bands, behind a disclosure whose
          summary shows the current bands (e.g. "Dictionaries: 3 (Familiar) / 5
          (Obscure)"). */}
      <SetupSection label={dictLabel}>
        <p className="muted">
          Required words are the goal; legal words also score but aren't
          required. Both are length-agnostic (examples just show the band).
        </p>
        <DifficultyField
          label="Required words"
          length={null}
          minDifficulty={1}
          maxDifficulty={6}
          value={s.required}
          onChange={(required) => onChange({ ...s, required })}
        />
        <DifficultyField
          label="Legal (bonus) words"
          length={null}
          minDifficulty={s.required}
          maxDifficulty={6}
          value={s.legal}
          onChange={(legal) => onChange({ ...s, legal })}
        />
      </SetupSection>

      {/* Optional custom letters, behind a disclosure whose summary shows the
          chosen letters (e.g. "Custom letters: A-CHIROT") or "(optional)" when
          blank. Both blank → a random board (the normal path); fill both to build
          a board from your own letters. The Start button is gated on
          `customLettersError` (via the manifest's validate), so an invalid partial
          entry blocks Start with an inline reason. Cleared inputs store `undefined`
          so the edge function sees them as absent → random. */}
      <SetupSection label={customLabel}>
        <p className="muted">
          Leave blank for a random board, or set your own: a center letter plus
          eight other letters. All nine must be different.
        </p>
        <div className={local.customRow}>
          <label className={local.field}>
            <span>Center</span>
            <input
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={1}
              value={s.custom_center ?? ''}
              onChange={(e) =>
                onChange({ ...s, custom_center: cleanLetters(e.target.value, 1) || undefined })
              }
              className={cls(local.letterInput, local.centerInput)}
              aria-label="Center letter"
            />
          </label>
          <label className={local.field}>
            <span>Other letters</span>
            <input
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={8}
              value={s.custom_letters ?? ''}
              onChange={(e) =>
                onChange({ ...s, custom_letters: cleanLetters(e.target.value, 8) || undefined })
              }
              className={cls(local.letterInput, local.outerInput)}
              aria-label="Eight other letters"
            />
          </label>
        </div>
      </SetupSection>

      <TimerField
        value={s.timer}
        onChange={(timer) => onChange({ ...s, timer })}
      />
    </div>
  )
}
