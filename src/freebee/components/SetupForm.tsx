import { TimerField } from '../../common/components/TimerField'
import type { SetupBodyProps } from '../../common/lib/games'
import type { FreeBeeSetup } from '../lib/setup'
import styles from './SetupForm.module.css'

/**
 * freebee's per-game setup form (Phase 3 — minimal).
 *
 * Only choice the players make today: the timer. Mode is fixed
 * to 'coop' on the manifest's default and not exposed in the
 * UI; the form just keeps it stable on every onChange.
 *
 * Future fields (designed-in but deferred):
 *   - Mode radio (coop / compete) + target-rank slider when
 *     compete mode is selected.
 *   - Custom-letters (6 outer + 1 center) override.
 *
 * Controlled component pattern: state lives in the wrapping
 * `SetupGameDialog`, this body renders `value` and signals via
 * `onChange`. The `value as FreeBeeSetup` cast at the top is
 * the boundary between the manifest's `unknown` setup type and
 * freebee's narrow shape.
 */
export function SetupForm({ value, onChange }: SetupBodyProps) {
  const s = value as FreeBeeSetup

  return (
    <div className={styles.setup}>
      <p className="muted">
        freebee plays cooperatively in v1 — everyone in the club
        types words into the same honeycomb and the team racks
        up the score together. Pick a timer if you'd like one.
      </p>
      <TimerField
        value={s.timer}
        onChange={(timer) => onChange({ ...s, timer })}
      />
    </div>
  )
}
