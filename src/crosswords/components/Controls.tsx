import type { Scope } from '../lib/types'
import { cls } from '../../common/lib/util/cls'
import styles from './Controls.module.css'

type Props = {
  mode: 'coop' | 'compete'
  pencil: boolean
  onPencilChange: (pencil: boolean) => void
  onCheck: (scope: Scope) => void
  /** Reveal is coop-only (revealing your grid would trivially win a race). */
  onReveal: (scope: Scope) => void
  disabled: boolean
}

/**
 * The crossword tool row: the pen/pencil toggle + check and (coop-only)
 * reveal at letter / word / grid scope. The scope is resolved on the client
 * (via cursor.ts) and sent as coordinates; the server checks/reveals against
 * the shielded solution.
 */
export function Controls({ mode, pencil, onPencilChange, onCheck, onReveal, disabled }: Props) {
  return (
    <div className={styles.controls}>
      <div className={styles.seg} role="group" aria-label="Pen or pencil">
        <button
          type="button"
          className={cls(styles.segBtn, !pencil && styles.segOn)}
          aria-pressed={!pencil}
          disabled={disabled}
          onClick={() => onPencilChange(false)}
        >
          Pen
        </button>
        <button
          type="button"
          className={cls(styles.segBtn, pencil && styles.segOn)}
          aria-pressed={pencil}
          disabled={disabled}
          onClick={() => onPencilChange(true)}
        >
          Pencil
        </button>
      </div>

      <div className={styles.group}>
        <span className={styles.label}>Check</span>
        <ScopeButtons action="Check" onScope={onCheck} disabled={disabled} />
      </div>

      {mode === 'coop' && (
        <div className={styles.group}>
          <span className={styles.label}>Reveal</span>
          <ScopeButtons action="Reveal" onScope={onReveal} disabled={disabled} />
        </div>
      )}
    </div>
  )
}

const SCOPE_LABEL: Record<Scope, string> = { letter: 'Letter', word: 'Word', puzzle: 'Grid' }

function ScopeButtons({
  action, onScope, disabled,
}: {
  action: string
  onScope: (scope: Scope) => void
  disabled: boolean
}) {
  return (['letter', 'word', 'puzzle'] as const).map((scope) => (
    <button
      key={scope}
      type="button"
      className={styles.actionBtn}
      disabled={disabled}
      // Distinct label so Check/Reveal buttons of the same scope are addressable.
      aria-label={`${action} ${scope}`}
      onClick={() => onScope(scope)}
    >
      {SCOPE_LABEL[scope]}
    </button>
  ))
}
