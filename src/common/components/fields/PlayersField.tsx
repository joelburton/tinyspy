// cs-unmet

import { Dot } from '../text/Dot'
import { Field } from './Field'
import type { AllFieldProps } from './fieldProps'
import type { Member } from '../../lib/games'
import styles from './PlayersField.module.css'

type Props = AllFieldProps<Set<string>> & {
  /** The club roster, in the order it should be listed. */
  members: Member[]
  /** The creating user. Always a player — their row is checked and disabled,
   *  because you cannot start a game you are not in. */
  selfId: string
  /** Fired with the member whose row was clicked. The parent owns the set —
   *  it also has to hand the SELECTED players to the game's own setup body (the
   *  turn-order "First player" picker lists only who will actually play). */
  onChange: (userId: string) => void
}

/**
 * WHO IS PLAYING — a checkbox list of the club's members, all checked by
 * default, sitting above the game-specific setup body.
 *
 * **An ordinary field, in an ordinary section.** It spent a day as the one
 * field outside the section vocabulary — a bordered box of its own, because it
 * must be visible when the dialog opens: who is playing changes what the rest
 * of the form can even offer. `defaultOpen` buys that with no exception at all
 *, so the border, the caption and the padding are the ones
 * every other setting gets, and this file is left holding only the rows.
 *
 * The section's summary is the players' DOTS rather than a word — its live
 * value, the way every other summary carries one, and drawn by the modal
 * because the modal owns the selection.
 *
 * A component rather than markup inside `SetupGameModal`, because a players
 * picker is a FIELD and every other field a setup form has is one of these —
 * `<SetupTimerSection>`, `<DictBandField>`, `<SetupCoopStyleSection>`. Having
 * exactly one caller is not a reason to leave a shape inline — that is how a
 * setup form's shapes drift apart.
 *
 * It owns no state. The parent holds the selection because it needs it anyway:
 * to gate Start on the count, and to pass the chosen players down to the game's
 * own form.
 */
export function PlayersField({
  name,
  members,
  selfId,
  value,
  onChange,
  disabled,
  label,
  help,
  entryHelp,
  error,
  className,
}: Props) {
  return (
    // `group`: the control is a SET of checkboxes, so a caption heads them as a
    // <legend> rather than pointing at one. No box of its own — the
    // <SetupSection> around it draws that.
    <Field label={label} group help={help} entryHelp={entryHelp} error={error} className={className}>
      {members.map((m) => {
        const isSelf = m.user_id === selfId
        return (
          <label
            key={m.user_id}
            className={styles.row}
            title={isSelf ? "You're always a player" : undefined}
          >
            <input
              name={`${name}.${m.user_id}`}
              type="checkbox"
              checked={value.has(m.user_id)}
              onChange={() => onChange(m.user_id)}
              // The creator can't deselect themselves.
              disabled={disabled || isSelf}
            />
            <Dot color={m.color} className={styles.dot} />
            <span>
              {m.username}
              {isSelf && <span className={styles.self}> (you)</span>}
            </span>
          </label>
        )
      })}
    </Field>
  )
}
