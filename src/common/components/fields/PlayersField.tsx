// cs-fixed

import { Dot } from '../text/Dot'
import type { Member } from '../../lib/games'
import styles from './PlayersField.module.css'

type Props = {
  /** The club roster, in the order it should be listed. */
  members: Member[]
  /** The creating user. Always a player — their row is checked and disabled,
   *  because you cannot start a game you are not in. */
  selfId: string
  /** Who is currently checked. */
  selectedIds: Set<string>
  /** Fired with the member whose row was clicked. The parent owns the set —
   *  it also has to hand the SELECTED players to the game's own setup body (the
   *  turn-order "First player" picker lists only who will actually play). */
  onToggle: (userId: string) => void
  /** Disable every row while the create RPC is in flight. */
  busy?: boolean
  /** The count complaint, when there is one: "Pick at least 2 players." The
   *  parent computes it, because the bounds come from the game's manifest and
   *  the same count gates its Start button. */
  hint?: string | null
}

/**
 * WHO IS PLAYING — a checkbox list of the club's members, all checked by
 * default, sitting above the game-specific setup body.
 *
 * **The one field that is not inside a `<SetupSection>`** (Joel, 2026-08-25).
 * Everything else in a setup form collapses behind a disclosure whose summary
 * carries the current value; this one stays open, because it is not a setting
 * you occasionally revisit — it is who the game is FOR, and it changes what the
 * rest of the form can even offer. It is also the only place a `<fieldset>` is
 * doing the job the element exists for: several related controls under one
 * caption, rather than a single control wearing a group's clothing.
 *
 * A component rather than markup inside `SetupGameModal` because a players
 * picker is a FIELD, and every other field a setup form has is one of these —
 * `<TimerField>`, `<DictBandField>`, `<CoopStyleField>`. It lived inline for
 * as long as it had exactly one caller, which is how the setup form's other
 * shapes drifted too.
 *
 * It owns no state. The parent holds the selection because it needs it anyway:
 * to gate Start on the count, and to pass the chosen players down to the game's
 * own form.
 */
export function PlayersField({
  members,
  selfId,
  selectedIds,
  onToggle,
  busy,
  hint,
}: Props) {
  return (
    <fieldset className={styles.players}>
      <legend className={styles.legend}>Players</legend>
      {members.map((m) => {
        const isSelf = m.user_id === selfId
        return (
          <label
            key={m.user_id}
            className={styles.row}
            title={isSelf ? "You're always a player" : undefined}
          >
            <input
              type="checkbox"
              checked={selectedIds.has(m.user_id)}
              onChange={() => onToggle(m.user_id)}
              // The creator can't deselect themselves.
              disabled={busy || isSelf}
            />
            <Dot color={m.color} className={styles.dot} />
            <span>
              {m.username}
              {isSelf && <span className={styles.self}> (you)</span>}
            </span>
          </label>
        )
      })}
      {hint && <p className={styles.hint}>{hint}</p>}
    </fieldset>
  )
}
