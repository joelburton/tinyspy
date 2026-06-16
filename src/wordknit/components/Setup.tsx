import { TimerField } from '../../common/components/TimerField'
import type { SetupBodyProps } from '../../common/lib/games'
import type { WordknitSetup } from '../lib/setup'
import styles from './Setup.module.css'

/**
 * Wordknit's per-game setup form.
 *
 * Today's one choice: **timer mode** — delegated to the shared
 * `<TimerField>` component (None / Up / Down with MM:SS input).
 * Future fields (puzzle date picker once the archive lands, etc.)
 * land alongside it as additional siblings inside `.setup`.
 *
 * Export name `WordknitSetupForm` matches `manifest.setupForm` —
 * this is the *form definition*, distinct from `WordknitSetup`
 * (the *data shape* the form produces).
 */
export function WordknitSetupForm({ value, onChange }: SetupBodyProps) {
  const s = value as WordknitSetup
  return (
    <div className={styles.setup}>
      <TimerField
        value={s.timer}
        onChange={(timer) => onChange({ ...s, timer })}
      />
    </div>
  )
}
