// cs-unmet

import type { ReactNode } from 'react'
import { actionSurface } from '@/common/actions/actionSurface'
import { nameWithKey } from '@/common/actions/nameWithKey'
import type { BoundAction } from '@/common/actions/useBoundAction'
import { SCOPE_LABEL, type Scope } from '../lib/types'
import { cls } from '@/common/utils/cls'
import styles from './Controls.module.css'

/** The three scopes of one assistance family, each its own action. */
export type ScopeActions = Record<Scope, BoundAction>

type Props = {
  /** Is the pen or the pencil selected? The pair below is two destinations for
   *  one toggle, and this is which one you are already at. */
  pencil: boolean
  actPencil: BoundAction
  check: ScopeActions
  /** Reveal is coop-only, and says so itself: in a race all three hide and the
   *  group goes with them. */
  reveal: ScopeActions
  /** Any remaining action buttons (End / Concede) — rendered icon-only in their
   *  own rule-separated group at the end of the bar, so the destructive action
   *  can't be misread as another check/reveal square. */
  children?: ReactNode
}

const SCOPES = ['letter', 'word', 'puzzle'] as const

/**
 * The crossword tool row: the pen/pencil toggle + check and (coop-only)
 * reveal at letter / word / grid scope. The scope is resolved on the client
 * (via cursor.ts) and sent as coordinates; the server checks/reveals against
 * the shielded solution.
 *
 * Every square IS its action — what it does, whether it is live and which key
 * also does it all arrive with the binding — so this file arranges buttons and
 * decides nothing about them. Which is why there is no `mode` and no `disabled`
 * prop: a race's Reveal squares hide themselves, and a frozen board grays
 * everything at once.
 *
 * Every button in the bar is a uniform square (`--iconButton-size`), so the
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
 * Every square also carries a `data-tooltip` naming its full action and its key,
 * since the visible glyph is deliberately terse.
 */
export function Controls({ pencil, actPencil, check, reveal, children }: Props) {
  // Two names for one action: the pair is a segmented view of a single toggle,
  // so each cap says where it takes you and clicking the one you're already on
  // is nothing to do.
  const asPencil = actionSurface(actPencil, 'Pencil')
  const asPen = actionSurface(actPencil, 'Pen')
  const revealShown = SCOPES.some((scope) => !actionSurface(reveal[scope]).hidden)

  return (
    <div className={styles.controls}>
      <div className={styles.group} role="group" aria-label="Fill with pen or pencil">
        <span className={styles.label}>Fill:</span>
        {/* Pencil = tentative. The glyph borrows the grid's pencilled-entry look
            exactly (gray + italic, Grid.module.css `.pencil`), so the toggle
            previews what typing will produce. */}
        <button
          type="button"
          {...asPencil.buttonProps}
          className={cls(styles.btn, styles.pencilBtn, pencil && styles.btnOn)}
          aria-pressed={pencil}
          data-tooltip={nameWithKey('Pencil — tentative entries', actPencil)}
          onClick={() => {
            if (!pencil) actPencil.run()
          }}
        >
          P
        </button>
        {/* Pen = committed. Bold ink-blue against the pencil's gray italic. */}
        <button
          type="button"
          {...asPen.buttonProps}
          className={cls(styles.btn, styles.penBtn, !pencil && styles.btnOn)}
          aria-pressed={!pencil}
          data-tooltip={nameWithKey('Pen — committed entries', actPencil)}
          onClick={() => {
            if (pencil) actPencil.run()
          }}
        >
          P
        </button>
      </div>

      <Rule />

      <div className={styles.group}>
        <span className={styles.label}>Check:</span>
        <ScopeButtons verb="Check" actions={check} />
      </div>

      {revealShown && (
        <>
          <Rule />
          <div className={styles.group}>
            <span className={styles.label}>Reveal:</span>
            <ScopeButtons verb="Reveal" actions={reveal} />
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


/** The one-character glyph on the square; the group label supplies the verb. */
const SCOPE_GLYPH: Record<Scope, string> = { letter: 'L', word: 'W', puzzle: 'G' }

function ScopeButtons({ verb, actions }: { verb: string; actions: ScopeActions }) {
  return SCOPES.map((scope) => {
    // The registry calls these rows "Letter" / "Word" / "Grid", which is right
    // in the menu where the verb is the parent row. Out here each square is on
    // its own, so the surface takes the fuller name — and Check and Reveal of
    // the same scope stay addressable apart.
    const surface = actionSurface(actions[scope], `${verb} ${SCOPE_LABEL[scope].toLowerCase()}`)
    if (surface.hidden) return null
    return (
      <button key={scope} type="button" className={styles.btn} {...surface.buttonProps}>
        {SCOPE_GLYPH[scope]}
      </button>
    )
  })
}
