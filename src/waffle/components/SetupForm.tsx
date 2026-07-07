import { DifficultyField } from '../../common/components/fields/DifficultyField'
import { RadioRow } from '../../common/components/fields/RadioRow'
import { TimerField } from '../../common/components/fields/TimerField'
import { SetupSection } from '../../common/components/setup/SetupSection'
import { difficultyValue } from '../../common/lib/game/difficulty'
import type { SetupBodyProps } from '../../common/lib/games'
import { EXTRA_SWAP_OPTIONS, type WaffleSetup } from '../lib/setup'
import styles from '../../common/components/fields/setupForm.module.css'

/**
 * waffle's setup form, rendered inside the common SetupGameDialog.
 * Two choices plus the timer:
 *
 *   - **Word difficulty** — which vocabulary band (1..6) the six 5-letter
 *     words are drawn from (sets `difficulty`), via the shared DifficultyField.
 *   - **Swap budget** — how many *extra* swaps beyond the puzzle's
 *     par you get. Fewer = harder. `max_swaps = par + extra_swaps`.
 *
 * Plus the shared `TimerField`.
 *
 * Controlled component (state lives in the wrapper); the single
 * `value as WaffleSetup` cast is the boundary between the manifest's
 * `unknown` setup and waffle's shape. Shared by both manifests (mode
 * doesn't change the form).
 */
export function SetupForm({ value, onChange }: SetupBodyProps) {
  const s = value as WaffleSetup

  // Disclosure summaries carry the current values so each section reads without
  // opening (the boggle/scrabble/spellingbee pattern). Singular "Dictionary" —
  // waffle has ONE band. The swap summary shows the gloss + the number, e.g.
  // "Swap budget: Tight +3".
  const dictLabel = `Dictionary: ${difficultyValue(s.difficulty)}`
  const swapGloss =
    EXTRA_SWAP_OPTIONS.find((opt) => opt.value === s.extra_swaps)?.label ?? 'Custom'
  const swapLabel = `Swap budget: ${swapGloss} +${s.extra_swaps}`

  return (
    <div className={styles.setup}>
      <SetupSection label={dictLabel}>
        <p className="muted">Which vocabulary the puzzle's words come from.</p>
        <DifficultyField
          length={5}
          minDifficulty={1}
          maxDifficulty={6}
          value={s.difficulty}
          onChange={(difficulty) => onChange({ ...s, difficulty })}
        />
      </SetupSection>
      <SetupSection label={swapLabel}>
        <p className="muted">
          Extra swaps beyond the puzzle's minimum — fewer is harder.
        </p>
        <RadioRow
          name="extra_swaps"
          options={EXTRA_SWAP_OPTIONS.map((opt) => ({
            value: opt.value,
            label: (
              <>
                {opt.label} <span className="muted">(+{opt.value})</span>
              </>
            ),
          }))}
          value={s.extra_swaps}
          onChange={(extra_swaps) => onChange({ ...s, extra_swaps })}
        />
      </SetupSection>
      <TimerField
        value={s.timer}
        onChange={(timer) => onChange({ ...s, timer })}
      />
    </div>
  )
}
