import { TimerField } from '../../common/components/TimerField'
import type { SetupBodyProps } from '../../common/lib/games'
import type { WordknitSetup } from '../lib/setup'
import styles from './SetupForm.module.css'

/**
 * Wordknit's per-game setup form.
 *
 * Today's one choice: **timer mode** — delegated to the shared
 * `<TimerField>` component (None / Up / Down with MM:SS input).
 * Future fields (puzzle date picker once the archive lands, etc.)
 * land alongside it as additional siblings inside `.setup`.
 *
 * Component name `SetupForm` matches the file + the
 * `manifest.setupForm` field — this is the *form definition*,
 * distinct from `WordknitSetup` (the *data shape* the form
 * produces, stored on `common.games.setup`). The folder path
 * (`wordknit/components/SetupForm.tsx`) disambiguates from the
 * other games' SetupForm components.
 */
export function SetupForm({ value, onChange }: SetupBodyProps) {
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
