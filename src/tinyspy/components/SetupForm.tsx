import { useEffect } from 'react'
import type { SetupBodyProps } from '../../common/lib/games'
import {
  TURN_OPTIONS,
  type TinyspySetup,
} from '../lib/setup'
import styles from './SetupForm.module.css'

/**
 * Tinyspy's per-game setup form, rendered inside the common
 * `SetupGameDialog`. Two choices for the players:
 *
 *   - **Turns** — starting timer-token count, one of {9, 10, 11}
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
 * `value as TinyspySetup` cast at the top is the boundary
 * between the manifest's `unknown` setup type and tinyspy's
 * narrow shape — see the SetupBodyProps doc in
 * src/common/lib/games.ts.
 *
 * Component name `SetupForm` matches the file + the
 * `manifest.setupForm` field — this is the *form definition*,
 * distinct from `TinyspySetup` (the *data shape* the form
 * produces, stored on `common.games.setup`). The folder path
 * (`tinyspy/components/SetupForm.tsx`) disambiguates from the
 * other games' SetupForm components.
 */
export function SetupForm({ members, value, onChange }: SetupBodyProps) {
  const s = value as TinyspySetup

  // Auto-pick the first member as first-clue-giver when the form
  // first sees a populated member list with an empty selection.
  // Once firstClueGiverUserId is set, the inner condition is
  // false and this is a no-op — including on s-change reruns.
  useEffect(() => {
    if (s.firstClueGiverUserId === '' && members.length > 0) {
      onChange({ ...s, firstClueGiverUserId: members[0].user_id })
    }
  }, [s, members, onChange])

  return (
    <div className={styles.setup}>
      <fieldset className={styles.fieldset}>
        <legend>Starting timer tokens</legend>
        <p className="muted">
          The standard game is 9. Pick 10 or 11 for an easier
          warm-up (matches the rulebook's mission difficulties).
        </p>
        <div className={styles.radioRow}>
          {TURN_OPTIONS.map((t) => (
            <label key={t} className={styles.radio}>
              <input
                type="radio"
                name="turns"
                checked={s.turns === t}
                onChange={() => onChange({ ...s, turns: t })}
              />
              {t}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Who gives the first clue?</legend>
        <p className="muted">
          The first clue-giver is seated as A; the other player
          opens as the guesser.
        </p>
        <div className={styles.radioRow}>
          {members.map((m) => (
            <label key={m.user_id} className={styles.radio}>
              <input
                type="radio"
                name="firstClueGiver"
                checked={s.firstClueGiverUserId === m.user_id}
                onChange={() =>
                  onChange({ ...s, firstClueGiverUserId: m.user_id })
                }
              />
              {m.username}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  )
}
