import { DifficultyField } from '../../common/components/fields/DifficultyField'
import { SelectField } from '../../common/components/fields/SelectField'
import { TimerField } from '../../common/components/fields/TimerField'
import { CoopStyleField } from '../../common/components/fields/CoopStyleField'
import type { SetupBodyProps } from '../../common/lib/games'
import type { LetterboxedSetup } from '../lib/setup'
import styles from '../../common/components/fields/setupForm.module.css'

/**
 * letterboxed's per-game setup form. Mode is locked at the gametype level
 * (coop/compete — picked by which Start button the player clicked), so this
 * body never renders a mode radio.
 *
 * Two knobs, and they pull in OPPOSITE directions, which the copy has to make
 * plain: a lower word limit is harder, while a higher dictionary band is
 * EASIER (more legal words means more escape routes off an awkward tail).
 *
 * Controlled component: state lives in the wrapping `SetupGameDialog`; this
 * body renders `value` and signals via `onChange`.
 */
export function SetupForm({ mode, players, value, onChange }: SetupBodyProps) {
  const s = value as LetterboxedSetup

  return (
    <div className={styles.setup}>
      {/* Coop pacing — first, right below the dialog's player picker.
          Self-gates to nothing for compete / solo. Turn-by-turn suits this
          game unusually well: the chain hands off on its own. */}
      <CoopStyleField
        mode={mode}
        players={players}
        coopStyle={s.coop_style ?? 'free-for-all'}
        firstTurnUserId={s.first_turn_user_id ?? ''}
        onChange={({ coopStyle, firstTurnUserId }) =>
          onChange({ ...s, coop_style: coopStyle, first_turn_user_id: firstTurnUserId })
        }
      />

      {mode === 'coop' ? (
        <p className="muted">
          One shared chain. Each word starts with the last letter of the one
          before it, and no word may use two letters from the same side.
          Together, touch all twelve letters.
        </p>
      ) : (
        <p className="muted">
          Same twelve letters, a private chain each. First to touch all twelve
          within the word limit wins; until then you only see how far the
          others have got, not their words.
        </p>
      )}

      <SelectField
        label="Word limit"
        value={s.max_words}
        onChange={(v) => onChange({ ...s, max_words: Number(v) })}
      >
        {[2, 3, 4, 5, 6].map((n) => (
          <option key={n} value={n}>
            {n} words{n === 2 ? ' — every board can be done in two' : ''}
          </option>
        ))}
      </SelectField>

      {/* Higher = easier here, unlike most games' difficulty bands. */}
      <DifficultyField
        label="Dictionary (higher accepts more words)"
        length={null}
        minDifficulty={1}
        maxDifficulty={6}
        value={s.legal_band}
        onChange={(legal_band) => onChange({ ...s, legal_band })}
      />

      <TimerField value={s.timer} onChange={(timer) => onChange({ ...s, timer })} />
    </div>
  )
}
