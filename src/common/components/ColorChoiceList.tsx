import { colorVarFor, MEMBER_COLORS } from '../lib/memberColor'
import { cls } from '../lib/cls'
import styles from './ColorChoiceList.module.css'

type Props = {
  /** The selected color name, or null for none selected. */
  value: string | null
  /** Called with the picked color name. */
  onChange: (color: string) => void
  disabled?: boolean
}

/**
 * The player-color picker: the 8-entry palette (`MEMBER_COLORS`) as a
 * grid of swatches — each its actual color circle + name — with the
 * selected one ringed. Controlled (the parent owns `value`). Shared by
 * the "Edit profile" dialog and the claim screen so the choice looks and
 * behaves identically in both. `colorVarFor` owns each shade.
 */
export function ColorChoiceList({ value, onChange, disabled }: Props) {
  return (
    <div className={styles.swatches}>
      {MEMBER_COLORS.map((name) => (
        <button
          type="button"
          key={name}
          className={cls(styles.swatch, value === name && styles.swatchActive)}
          onClick={() => onChange(name)}
          disabled={disabled}
          aria-pressed={value === name}
        >
          <span
            className={styles.dot}
            style={{ background: colorVarFor(name) }}
            aria-hidden
          />
          <span className={styles.swatchName}>{name}</span>
        </button>
      ))}
    </div>
  )
}
