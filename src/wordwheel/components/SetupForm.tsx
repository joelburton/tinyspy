// cs-unmet

import { DifficultyField } from '../../common/components/fields/DifficultyField'
import { SelectField } from '../../common/components/fields/SelectField'
import { TimerField } from '../../common/components/fields/TimerField'
import { SetupSection } from '../../common/components/setup/SetupSection'
import { difficultyValue } from '../../common/lib/game/difficulty'
import { cls } from '../../common/lib/util/cls'
import type { SetupBodyProps } from '../../common/lib/games'
import { RANKS } from '../../common/lib/game/rankLadder'
import type { WordwheelSetup } from '../lib/setup'
import form from '../../common/components/fields/setupForm.module.css'
import styles from './SetupForm.module.css'

/** Normalize a letter input: lowercase, drop anything but a–z, cap the length.
 *  Keeps state canonical (lowercase, letters-only) so validation + the edge
 *  function agree; the UI uppercases via CSS for the wheel look. */
const cleanLetters = (raw: string, max: number) =>
  raw.toLowerCase().replace(/[^a-z]/g, '').slice(0, max)

/**
 * Allowed target-rank choices, shared by both modes' pickers. The full
 * 7-rank ladder is `RANKS[0..6]` (Start, Good, Solid, Nice, Great, Amazing,
 * Genius); only Start (0) is withheld, because every player begins at it — a
 * target of Start is won by the first accepted word in compete and instantly
 * in coop (`_rank_idx >= 0` is true from the off). So the list runs
 * Good..Genius (1..6). Compete's default lands on Amazing (5).
 */
const TARGET_RANK_CHOICES = [1, 2, 3, 4, 5, 6] as const

/** The coop picker's "None" option. A UI-only sentinel — choosing it removes
 *  `target_rank` from the setup blob entirely (the server reads absent/null as
 *  "no win condition"), so this number never leaves this file. */
const NO_TARGET = -1

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
 * `SetupGameModal`, this body renders `value` and signals via
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
  const constraintsLabel = s.unique_letters
    ? 'Board constraints: unique letters only'
    : 'Board constraints (optional)'

  // What the two target-rank summaries say. `target_rank` is an index into
  // RANKS, and its ABSENCE is the coop "None" — the key is deleted rather than
  // set to a sentinel, so the summary reads the same absence.
  const targetRankLabel = s.target_rank === undefined ? 'None' : RANKS[s.target_rank]

  return (
    <div className={form.setup}>
      {mode === 'coop' ? (
        <p className={form.helpText}>
          Everyone in the club types words into the same wheel
          and the team racks up the score together.
        </p>
      ) : (
        <p className={form.helpText}>
          Each player works the same wheel independently. First
          to the target rank wins; the rest of the time you only
          see each other's rank, not the words you found.
        </p>
      )}

      {mode === 'compete' ? (
        <SetupSection label={`Target rank: ${targetRankLabel}`}>
          <SelectField
            name="target_rank"
            value={s.target_rank ?? NO_TARGET}
            onChange={(v) => onChange({ ...s, target_rank: Number(v) })}
          >
            {TARGET_RANK_CHOICES.map((idx) => (
              <option key={idx} value={idx}>
                {RANKS[idx]}
              </option>
            ))}
          </SelectField>
        </SetupSection>
      ) : (
        <SetupSection label={`Win at: ${targetRankLabel}`}>
          <SelectField
            name="target_rank"
            value={s.target_rank ?? NO_TARGET}
            // -1 is this picker's "None" value only; it never reaches the setup
            // blob — picking it DELETES the key, because "no win condition" is
            // the absence of a target, not a magic rank.
            onChange={(v) => {
              const choice = Number(v)
              if (choice === NO_TARGET) {
                const rest = { ...s }
                delete rest.target_rank
                onChange(rest)
              } else {
                onChange({ ...s, target_rank: choice })
              }
            }}
          >
            <option value={NO_TARGET}>None</option>
            {TARGET_RANK_CHOICES.map((idx) => (
              <option key={idx} value={idx}>
                {RANKS[idx]}
              </option>
            ))}
          </SelectField>
        </SetupSection>
      )}

      {/* "Dictionaries" — the required/legal word bands, behind a disclosure whose
          summary shows the current bands (e.g. "Dictionaries: 3 (Familiar) / 5
          (Obscure)"). */}
      <SetupSection label={dictLabel}>
        <p className={form.helpText}>
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

      {/* Board constraints — optional rules that narrow which RANDOM board gets
          sampled. Just "unique letters only" today (all nine tiles distinct);
          the section exists so future constraints have a home. Ignored when
          custom letters are set (those letters stand as the player chose them).
          The summary shows the active constraint or "(optional)" when none. */}
      <SetupSection label={constraintsLabel}>
        <label className={form.checkRow}>
          <input
            type="checkbox"
            name="unique_letters"
            checked={s.unique_letters ?? false}
            onChange={(e) => onChange({ ...s, unique_letters: e.target.checked || undefined })}
          />
          Unique letters only
        </label>
        <p className={form.helpText}>
          Pick only boards whose nine tiles are all different letters — no wheel
          with a doubled tile. Applies to random boards; a custom board keeps the
          letters you enter below.
        </p>
      </SetupSection>

      {/* Optional custom letters, behind a disclosure whose summary shows the
          chosen letters (e.g. "Custom letters: A-CHIROT") or "(optional)" when
          blank. Both blank → a random board (the normal path); fill both to build
          a board from your own letters. The Start button is gated on
          `customLettersError` (via the manifest's validate), so an invalid partial
          entry blocks Start with an inline reason. Cleared inputs store `undefined`
          so the edge function sees them as absent → random. */}
      <SetupSection label={customLabel}>
        <p className={form.helpText}>
          Leave blank for a random board, or set your own: a center letter plus
          eight other letters. Repeats are fine — each tile is one use.
        </p>
        <div className={styles.customRow}>
          <label className={styles.field}>
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
              className={cls(styles.letterInput, styles.centerInput)}
              aria-label="Center letter"
            />
          </label>
          <label className={styles.field}>
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
              className={cls(styles.letterInput, styles.outerInput)}
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
