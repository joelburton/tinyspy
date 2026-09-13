// cs-blessed-forms

import { MEMBER_COLORS } from '../members/memberColor'
import { Dot } from '../members/Dot'
import { cls } from '../utils/cls'
import { Field } from './Field'
import type { AllFieldProps } from './fieldProps'
import styles from './ColorChoiceField.module.css'

type Props = AllFieldProps<string | null> & {
  onChange: (color: string) => void
}

/**
 * PICK YOUR COLOR — the 8-entry palette (`MEMBER_COLORS`) as a grid of
 * swatches, each drawn as its actual color circle plus its name, under the
 * caption every field has. Controlled: the parent owns `value`, and `onChange`
 * gets the palette NAME (`'red'`), which is what `common.profiles.color`
 * stores.
 *
 * Shared by the "Edit profile" dialog and the first-run claim screen, so the
 * choice looks and behaves the same wherever you make it.
 *
 * **A `<fieldset>`, not a `<label>`**, because the control is a GROUP of
 * swatches rather than one input, and that is the element's actual job. The
 * shared field class carries the reset that keeps it aligned with the
 * `<label>` fields beside it.
 */
export function ColorChoiceField({
  label = 'Player color',
  name,
  value,
  onChange,
  disabled,
  help,
  entryHelp,
  error,
}: Props) {
  return (
    // `group`: the control is a SET of swatches, so the caption is a <legend>
    // heading them rather than a label pointing at one.
    <Field label={label} group help={help} entryHelp={entryHelp} error={error} name={name}>
      <div className={styles.swatches}>
        {MEMBER_COLORS.map((color) => (
          <button
            type="button"
            key={color}
            className={cls(styles.swatch, value === color && styles.swatchActive)}
            onClick={() => onChange(color)}
            disabled={disabled}
            aria-pressed={value === color}
          >
            <Dot color={color} className={styles.dot} />
            <span className={styles.swatchName}>{color}</span>
          </button>
        ))}
      </div>
    </Field>
  )
}
