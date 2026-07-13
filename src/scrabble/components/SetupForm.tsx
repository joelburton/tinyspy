import { DifficultyField } from '../../common/components/fields/DifficultyField'
import { TimerField } from '../../common/components/fields/TimerField'
import { CoopStyleField } from '../../common/components/fields/CoopStyleField'
import { RadioRow } from '../../common/components/fields/RadioRow'
import { SelectField } from '../../common/components/fields/SelectField'
import { SetupSection } from '../../common/components/setup/SetupSection'
import { difficultyValue } from '../../common/lib/game/difficulty'
import type { SetupBodyProps } from '../../common/lib/games'
import { AI_BAND, AI_LEVELS, AI_LEVEL_LABEL, type AiLevel, type ScrabbleSetup } from '../lib/setup'
import styles from '../../common/components/fields/setupForm.module.css'

/**
 * scrabble's setup form. Shared by both modes:
 *   - two dictionary bands (all six offered each) — separate ceilings for
 *     2-letter and 3+-letter words (the bananagrams split). Uniquely for
 *     scrabble these ARE the acceptance bar, so a lower band makes a stricter
 *     game (docs/games/scrabble.md §3.3);
 *   - the timer;
 *   - **AI opponents (compete only)** — 0–3 AI seats at one skill level. The
 *     band requirement is shown inline; the dialog's `validate` (see manifest)
 *     blocks Start if the dictionary is too narrow for the chosen level or the
 *     head-count doesn't fit. We deliberately don't auto-raise the dictionary —
 *     the player does it, so the change is never a surprise
 *     (docs/scrabble-ai-strength.md).
 * Controlled component; state lives in the SetupGameDialog wrapper.
 */
export function SetupForm({ value, onChange, mode, players, playerCount }: SetupBodyProps) {
  const s = value as ScrabbleSetup

  // Disclosure summary carries the current bands so the section reads without
  // opening (the boggle/spellingbee pattern — 2-letter band first, then 3+).
  const dictLabel = `Dictionaries: ${difficultyValue(s.dict_2)} / ${difficultyValue(s.dict_3plus)}`
  const aiLabel =
    s.ai_count === 0
      ? 'AI opponents: none'
      : `AI opponents: ${s.ai_count} × ${AI_LEVEL_LABEL[s.ai_level]}`
  const aiBandName = difficultyValue(AI_BAND[s.ai_level])

  return (
    <div className={styles.setup}>
      <p className="muted">
        Build words on the board from your rack of tiles. A word is accepted if
        it's in the dictionary at the difficulty you pick for its length.
      </p>
      <SetupSection label={dictLabel}>
        <DifficultyField
          label="2-letter words"
          length={2}
          minDifficulty={1}
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
      </SetupSection>

      {/* AI opponents — compete only (coop is one shared rack, no per-seat AI). */}
      {mode === 'compete' && (
        <SetupSection label={aiLabel}>
          <RadioRow<number>
            name="ai_count"
            prefix="Add AI players:"
            options={[
              { value: 0, label: 'None' },
              { value: 1, label: '1' },
              { value: 2, label: '2' },
              { value: 3, label: '3' },
            ]}
            value={s.ai_count}
            onChange={(ai_count) => onChange({ ...s, ai_count })}
          />
          {s.ai_count > 0 && (
            <>
              <SelectField
                label="Skill"
                value={s.ai_level}
                onChange={(v) => onChange({ ...s, ai_level: v as AiLevel })}
              >
                {AI_LEVELS.map((lv) => (
                  <option key={lv} value={lv}>
                    {AI_LEVEL_LABEL[lv]}
                  </option>
                ))}
              </SelectField>
              <p className="muted">
                {playerCount} human + {s.ai_count} AI. A {AI_LEVEL_LABEL[s.ai_level]} AI plays from the
                “{aiBandName}” dictionary, so both dictionaries above must be at least that wide.
              </p>
            </>
          )}
        </SetupSection>
      )}

      {/* Coop pacing — free-for-all (default) vs turn-by-turn. Self-gates to
          nothing for compete / solo. */}
      <CoopStyleField
        mode={mode}
        players={players}
        coopStyle={s.coopStyle ?? 'free-for-all'}
        firstTurnUserId={s.firstTurnUserId ?? ''}
        onChange={({ coopStyle, firstTurnUserId }) =>
          onChange({ ...s, coopStyle, firstTurnUserId })
        }
      />

      <TimerField value={s.timer} onChange={(timer) => onChange({ ...s, timer })} />
    </div>
  )
}
