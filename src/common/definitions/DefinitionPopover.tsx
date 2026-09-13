// cs-blessed-definitions

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDismissOnEscape } from '../keyboard/useDismissOnEscape'
import { DefinitionView } from './DefinitionView'
import styles from './DefinitionPopover.module.css'

type Props = {
  // The word the user clicked. Seeds the lookup; cross-ref clicks navigate
  // from here.
  initialWord: string
  // Bounding rect of the clicked element — the popover anchors just below it
  // (clamped to the viewport).
  anchorRect: DOMRect
  onClose: () => void
}

const POPOVER_WIDTH = 280
const GAP = 6

/**
 * The small card that defines the word a player clicked. Anchored below the
 * clicked element (or above, when there is more room there); closes on any
 * click, inside or out, and on Escape; a cross-reference inside re-points the
 * lookup in place without closing or moving the card.
 *
 * Rendered by `<DefinitionHost>`, which owns the open/anchor state.
 */
export function DefinitionPopover({ initialWord, anchorRect, onClose }: Props) {
  const [word, setWord] = useState(initialWord)
  const cardRef = useRef<HTMLDivElement>(null)

  // Outside-click closes. Mousedown (not click) so it fires before any
  // downstream handler — mirrors Menu's outside-click pattern.
  useEffect(function closeOnOutsideClick() {
    function onDown(e: MouseEvent) {
      const t = e.target as Node | null
      if (t && cardRef.current?.contains(t)) return
      onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  // Escape closes the definition and stops there — it must not also close the
  // floating panel this popover was opened from (`useDismissOnEscape`).
  useDismissOnEscape(true, onClose)

  // Clamp the left edge so a word near the right margin doesn't push the card
  // off-screen.
  const left = Math.max(
    GAP,
    Math.min(anchorRect.left, window.innerWidth - POPOVER_WIDTH - GAP),
  )

  // Vertically, anchor below the word — but when there's more room above (the
  // word sits low on the page), flip above instead, and cap the height to the
  // space available on the chosen side. That way the card can never run off the
  // top or bottom edge and become unreadable; a long entry scrolls internally.
  const spaceBelow = window.innerHeight - anchorRect.bottom - GAP
  const spaceAbove = anchorRect.top - GAP
  const placeBelow = spaceBelow >= 220 || spaceBelow >= spaceAbove
  const position = placeBelow
    ? { top: anchorRect.bottom + GAP }
    : { bottom: window.innerHeight - anchorRect.top + GAP }
  const maxHeight = placeBelow ? spaceBelow : spaceAbove

  // Portalled to <body> because the card is `position: fixed` in viewport
  // coordinates, and a CSS `transform` on any ancestor would re-base those onto
  // the ancestor's origin. Every floating panel is positioned with a transform,
  // so a word clicked inside one (the anagram finder, the lookup dialog) would
  // put the card out by that floating panel's offset. Same reason `<TooltipHost>` and
  // `<ToastHost>` mount at the root.
  return createPortal(
    <div
      ref={cardRef}
      className={styles.card}
      style={{ ...position, left, width: POPOVER_WIDTH, maxHeight }}
      role="dialog"
      aria-label="Definition"
      // Click anywhere on the card dismisses it — a big, easy target. The
      // cross-ref links inside stop propagation so they navigate instead.
      onClick={onClose}
    >
      <DefinitionView word={word} onNavigate={setWord} />
    </div>,
    document.body,
  )
}
