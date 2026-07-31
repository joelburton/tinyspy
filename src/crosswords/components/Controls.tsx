import type { ReactNode } from 'react'
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
  /** Any remaining action buttons (End / Concede) — rendered icon-only in their
   *  own rule-separated group at the end of the bar, so the destructive action
   *  can't be misread as another check/reveal square. */
  children?: ReactNode
}

/**
 * The crossword tool row: the pen/pencil toggle + check and (coop-only)
 * reveal at letter / word / grid scope. The scope is resolved on the client
 * (via cursor.ts) and sent as coordinates; the server checks/reveals against
 * the shielded solution.
 *
 * Every button in the bar is a uniform square (`--icon-button-size`), so the
 * only things telling them apart are the glyph and the group they sit in —
 * hence the two devices this row leans on:
 *
 *   - a **bold label** naming each group ("Fill:", "Check:", "Reveal:"), so a
 *     one-character button reads as "Check word", not as a bare "W";
 *   - a **dark vertical rule** between groups. Near-identical squares in a row
 *     were genuinely easy to mis-click, and the cost isn't symmetric: a
 *     Reveal-grid where a Check-letter was meant spoils the puzzle
 *     irreversibly. The separation earns its ink.
 *
 * Every square also carries a `data-tooltip` naming its full action, since the
 * visible glyph is deliberately terse.
 */
export function Controls({
  mode, pencil, onPencilChange, onCheck, onReveal, disabled, children,
}: Props) {
  return (
    <div className={styles.controls}>
      <div className={styles.group} role="group" aria-label="Fill with pen or pencil">
        <span className={styles.label}>Fill:</span>
        {/* Pencil = tentative. The glyph borrows the grid's pencilled-entry look
            exactly (grey + italic, Grid.module.css `.pencil`), so the toggle
            previews what typing will produce. */}
        <button
          type="button"
          className={cls(styles.btn, styles.pencilBtn, pencil && styles.btnOn)}
          aria-pressed={pencil}
          aria-label="Pencil"
          data-tooltip="Pencil — tentative entries"
          disabled={disabled}
          onClick={() => onPencilChange(true)}
        >
          P
        </button>
        {/* Pen = committed. Bold ink-blue against the pencil's grey italic. */}
        <button
          type="button"
          className={cls(styles.btn, styles.penBtn, !pencil && styles.btnOn)}
          aria-pressed={!pencil}
          aria-label="Pen"
          data-tooltip="Pen — committed entries"
          disabled={disabled}
          onClick={() => onPencilChange(false)}
        >
          P
        </button>
      </div>

      <Rule />

      <div className={styles.group}>
        <span className={styles.label}>Check:</span>
        <ScopeButtons action="Check" onScope={onCheck} disabled={disabled} />
      </div>

      {mode === 'coop' && (
        <>
          <Rule />
          <div className={styles.group}>
            <span className={styles.label}>Reveal:</span>
            <ScopeButtons action="Reveal" onScope={onReveal} disabled={disabled} />
          </div>
        </>
      )}

      {children && (
        <>
          <Rule />
          <div className={styles.group}>{children}</div>
        </>
      )}
    </div>
  )
}

/** The dark vertical rule between groups. Presentational — the group labels
 *  already carry the structure for a screen reader. */
function Rule() {
  return <span className={styles.rule} aria-hidden />
}

const SCOPE_LABEL: Record<Scope, string> = { letter: 'Letter', word: 'Word', puzzle: 'Grid' }
/** The one-character glyph on the square; the group label supplies the verb. */
const SCOPE_GLYPH: Record<Scope, string> = { letter: 'L', word: 'W', puzzle: 'G' }

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
      className={styles.btn}
      disabled={disabled}
      // Distinct label so Check/Reveal buttons of the same scope are addressable.
      aria-label={`${action} ${scope}`}
      data-tooltip={`${action} ${SCOPE_LABEL[scope].toLowerCase()}`}
      onClick={() => onScope(scope)}
    >
      {SCOPE_GLYPH[scope]}
    </button>
  ))
}
