// cs-fixed

import { ColorChoiceList } from '../account/ColorChoiceList'
import styles from './field.module.css'

type Props = {
  /** The caption. Defaults to "Player color", which is what both callers say. */
  label?: string
  value: string | null
  onChange: (color: string) => void
  disabled?: boolean
}

/**
 * PICK YOUR COLOR — the swatch list with its caption above it.
 *
 * Two callers, `EditProfileModal` and `ClaimHandleScreen`, and they had written
 * the identical wrapper: a `<fieldset className={styles.field}>` with a
 * `<legend className={styles.label}>Player color</legend>` around
 * `<ColorChoiceList>`, in two different areas' files. Byte-identical
 * duplication across areas is the signature this area keeps finding, and it is
 * why the wrapper — not just the list — is the component.
 *
 * **A `<fieldset>`, not a `<label>`**, because the control is a GROUP of
 * swatches rather than one input, and that is the element's actual job. The
 * shared field class carries the reset that keeps it aligned with the `<label>`
 * fields beside it.
 */
export function ColorField({ label = 'Player color', value, onChange, disabled }: Props) {
  return (
    <fieldset className={styles.field}>
      <legend className={styles.label}>{label}</legend>
      <ColorChoiceList value={value} onChange={onChange} disabled={disabled} />
    </fieldset>
  )
}
