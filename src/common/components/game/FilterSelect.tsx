import { useEffect, useRef, useState } from 'react'
import { cls } from '../../lib/util/cls'
import { Dot } from '../text/Dot'
import styles from './FilterSelect.module.css'

export type FilterOption = {
  value: string
  label: string
  /**
   * A member-color NAME ('red' … 'pink') to draw as an identity disc before
   * the label — the app-wide "this color is this player" marker (docs/ui.md →
   * "Player identity = a colored disc"). Named `dot` to match the same field
   * on menu items and feedback messages.
   *
   * When ANY option in the list carries one, every option reserves the disc's
   * width, so "All / Found / Missed" stay aligned with "(disc) moth".
   */
  dot?: string
}

/**
 * A dropdown for the **in-game** info-panel filters (the word list's KIND/WHO
 * pickers, and the turn log's player picker next) that never takes focus.
 *
 * **Why not a `<select>`.** A native select holds the keyboard, and the app
 * treats that correctly and fatally: `isEditableField` counts `SELECT`
 * alongside INPUT/TEXTAREA, so `useGlobalKeyHandler` stops dispatching and
 * `useGameHasKeyboard` stops the entry caret blinking — "caret visible ⟺ keys
 * reach the game" is a deliberate invariant, and a focused select really does
 * break it. The trouble is getting the focus BACK. The browser fires nothing
 * when a native popup closes: `change` only fires if the value changed, so
 * opening the list and re-picking the option already selected leaves the
 * select focused, the board deaf, and the caret dark until you click the
 * board. There is no event to hang a fix on, and `:focus-visible` matches a
 * mouse-clicked select (measured in Chromium), so CSS can't quietly drop the
 * ring either. Every fix for this is a workaround for a state we can't
 * observe.
 *
 * So: don't take focus at all. `onMouseDown` + `preventDefault()` on the
 * trigger and each option stops the browser focusing them, which means the
 * game keeps the keyboard the entire time — the caret keeps blinking even
 * while the list is open, and typing goes to the board, which is honest,
 * because it does.
 *
 * **Deliberately NOT a form control**, per the constraints these live under:
 * you never Tab to a gameplay filter (`useCaptureKeys` swallows Tab while the
 * caret owns the keyboard), never open one with Space, and never want a focus
 * ring on the board. That is the definition of "not a `<select>`", and it's
 * why this is a plain button + list rather than a keyboard-navigable listbox.
 *
 * Pointer-driven only — closes on outside pointerdown or Escape.
 */
export function FilterSelect({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: string
  options: FilterOption[]
  onChange: (value: string) => void
  /** Accessible name for the trigger, e.g. "Whose words to show". */
  label: string
  /**
   * Merged onto the TRIGGER, for a caller whose surface has its own control
   * look — the club page's filters wear that page's surface + border treatment
   * so they match the mode buttons beside them, while the info-panel filters
   * keep the understated heading-row look. Behaviour is identical either way;
   * only the trigger's skin differs.
   */
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Dismissal. Both listeners are document-level because nothing here is
  // focused — there's no blur to react to, by design.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const current = options.find((o) => o.value === value)
  const anyDots = options.some((o) => o.dot)

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={cls(styles.trigger, className)}
        aria-label={label}
        aria-expanded={open}
        // The whole trick: preventing mousedown's default stops the browser
        // moving focus here, so the game never loses the keyboard. The click
        // still fires.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
      >
        {/* The trigger shows the SELECTED option's disc — one value at a time,
            so it needs no reserved slot, only the disc when there is one.
            Without it, picking a player would drop the colour the list just
            used to identify them. */}
        {current?.dot && <Dot color={current.dot} className={styles.dot} />}
        <span className={styles.label}>{current?.label ?? ''}</span>
        <Caret />
      </button>

      {open && (
        <div className={styles.popover}>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={cls(styles.option, o.value === value && styles.optionOn)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
            >
              {/* Reserved for EVERY option once any option has a disc, so the
                  dot-less entries indent to the same text baseline instead of
                  sitting half a disc to their left. */}
              {anyDots && (
                <span className={styles.dotSlot}>
                  {o.dot && <Dot color={o.dot} className={styles.dot} />}
                </span>
              )}
              <span className={styles.label}>{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** The little solid down-caret a native select draws — the "choices live
 *  here" mark. Inline SVG so it inherits `currentColor`. */
function Caret() {
  return (
    <svg className={styles.caret} width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
      <path d="M0 2.25h8L4 6.75z" fill="currentColor" />
    </svg>
  )
}
