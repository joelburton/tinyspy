// cs-unmet

import { Dot } from '../members/Dot'
import { Field } from './Field'
import type { AllFieldProps } from './fieldProps'
import type { Member } from '../members/member'
import styles from './PlayersField.module.css'

type Props = AllFieldProps<Set<string>> & {
  /** The club roster, in the order it should be listed. */
  members: Member[]
  /** The creating user. Always a player — their row is checked and disabled,
   *  because you cannot start a game you are not in. */
  selfId: string
  /** Fired with WHO IS PLAYING NOW, like any other field reporting its new
   *  value — not with the row that was clicked. The field has both the current
   *  set and `selfId`, so it is the one place that can apply the toggle and the
   *  can't-remove-yourself rule together. */
  onChange: (next: Set<string>) => void
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
  function toggle(userId: string) {
    // The creator can't deselect themselves. Their checkbox is `disabled`
    // below, so this is the same rule stated where the value is computed —
    // both halves in one file, rather than agreeing by luck across two.
    if (userId === selfId) return
    const next = new Set(value)
    if (next.has(userId)) next.delete(userId)
    else next.add(userId)
    onChange(next)
  }

  return (
    // `group`: the control is a SET of checkboxes, so a caption heads them as a
    // <legend> rather than pointing at one. No box of its own — the
    // <SetupSection> around it draws that.
    <Field label={label} group help={help} entryHelp={entryHelp} error={error} name={name} className={className}>
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
              onChange={() => toggle(m.user_id)}
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
