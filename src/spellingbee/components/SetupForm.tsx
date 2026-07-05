import { DifficultyField } from '../../common/components/fields/DifficultyField'
import { RadioRow } from '../../common/components/fields/RadioRow'
import { TimerField } from '../../common/components/fields/TimerField'
import type { SetupBodyProps } from '../../common/lib/games'
import { RANKS } from '../lib/ranks'
import type { SpellingbeeSetup } from '../lib/setup'
import styles from '../../common/components/fields/setupForm.module.css'

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
 * spellingbee's per-game setup form. Mode is locked at the gametype
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
 * `onChange`. The `value as SpellingbeeSetup` cast at the top is the
 * boundary between the manifest's `unknown` setup type and
 * spellingbee's narrow shape.
 */
export function SetupForm({ mode, value, onChange }: SetupBodyProps) {
  const s = value as SpellingbeeSetup

  return (
    <div className={styles.setup}>
      {mode === 'coop' ? (
        <p className="muted">
          Everyone in the club types words into the same honeycomb
          and the team racks up the score together.
        </p>
      ) : (
        <p className="muted">
          Each player works the same honeycomb independently. First
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

      <fieldset className={styles.fieldset}>
        <legend>Word difficulty</legend>
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
      </fieldset>

      <TimerField
        value={s.timer}
        onChange={(timer) => onChange({ ...s, timer })}
      />
    </div>
  )
}
