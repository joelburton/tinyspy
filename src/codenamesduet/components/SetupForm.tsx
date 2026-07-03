import { useEffect } from 'react'
import { RadioRow } from '../../common/components/RadioRow'
import { TimerField } from '../../common/components/TimerField'
import type { SetupBodyProps } from '../../common/lib/games'
import {
  TURN_OPTIONS,
  type CodenamesduetSetup,
} from '../lib/setup'
import styles from '../../common/components/setupForm.module.css'

/**
 * codenamesduet's per-game setup form, rendered inside the common
 * `SetupGameDialog`. Two choices for the players:
 *
 *   - **Turns** — starting turn count, one of {9, 10, 11}
 *     (matches the Duet rulebook's mission counts). 9 is the
 *     standard game; 10 and 11 are easier warm-ups.
 *   - **Who gives the first clue** — radio with the two club
 *     members. `create_game` seats the chosen user as A
 *     (since A always opens the game), the other as B.
 *
 * On mount we auto-seed `firstClueGiverUserId` to the first
 * club member. The manifest's defaults can't carry a member id
 * (defaults are evaluated before any club is known), so the
 * resolution happens here. The user can still flip the radio
 * before clicking Start.
 *
 * Controlled component pattern: state lives in the wrapper,
 * we render from `value` and signal via `onChange`. The single
 * `value as CodenamesduetSetup` cast at the top is the boundary
 * between the manifest's `unknown` setup type and codenamesduet's
 * narrow shape — see the SetupBodyProps doc in
 * src/common/lib/games.ts.
 *
 * Component name `SetupForm` matches the file + the
 * `manifest.setupForm` field — this is the *form definition*,
 * distinct from `CodenamesduetSetup` (the *data shape* the form
 * produces, stored on `common.games.setup`). The folder path
 * (`codenamesduet/components/SetupForm.tsx`) disambiguates from the
 * other games' SetupForm components.
 */
export function SetupForm({ members, value, onChange }: SetupBodyProps) {
  const s = value as CodenamesduetSetup

  // Auto-pick the first member as first-clue-giver when the form
  // first sees a populated member list with an empty selection.
  // Once firstClueGiverUserId is set, the inner condition is
  // false and this is a no-op — including on s-change reruns.
  useEffect(function seedFirstClueGiver() {
    if (s.firstClueGiverUserId === '' && members.length > 0) {
      onChange({ ...s, firstClueGiverUserId: members[0].user_id })
    }
  }, [s, members, onChange])

  return (
    <div className={styles.setup}>
      <fieldset className={styles.fieldset}>
        <legend>Number of turns</legend>
        <p className="muted">
          The standard game is 9. Pick 10 or 11 for an easier
          warm-up (matches the rulebook's mission difficulties).
        </p>
        <RadioRow
          name="turns"
          options={TURN_OPTIONS.map((t) => ({ value: t, label: t }))}
          value={s.turns}
          onChange={(turns) => onChange({ ...s, turns })}
        />
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Who gives the first clue?</legend>
        <p className="muted">
          The first clue-giver is seated as A; the other player
          opens as the guesser.
        </p>
        <RadioRow
          name="firstClueGiver"
          options={members.map((m) => ({ value: m.user_id, label: m.username }))}
          value={s.firstClueGiverUserId}
          onChange={(firstClueGiverUserId) => onChange({ ...s, firstClueGiverUserId })}
        />
      </fieldset>

      <TimerField
        value={s.timer}
        onChange={(timer) => onChange({ ...s, timer })}
      />
    </div>
  )
}
