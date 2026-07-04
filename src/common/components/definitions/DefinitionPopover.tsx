import { useEffect, useRef, useState } from 'react'
import { DefinitionView } from './DefinitionView'
import styles from './DefinitionPopover.module.css'

type Props = {
  /** The word the user clicked. Seeds the lookup; cross-ref clicks
   *  navigate from here. */
  initialWord: string
  /** Bounding rect of the clicked element — the popover anchors just
   *  below it (clamped to the viewport). */
  anchorRect: DOMRect
  onClose: () => void
}

const POPOVER_WIDTH = 280
const GAP = 6

/**
 * A small floating card that defines the word a player clicked. Anchors
 * below the clicked element (or above, when there's more room there),
 * closes on any click (inside or outside) or ESC, and lets the player
 * chase Scrabble cross-references in place (a ref click re-points the
 * lookup without closing or moving the card).
 *
 * Position is fixed (viewport coordinates) rather than absolute,
 * because the click target lives in a scrollable word list — fixed
 * keeps the card put relative to where the word currently is on screen.
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

  useEffect(function closeOnEsc() {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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

  return (
    <div
      ref={cardRef}
      className={styles.card}
      style={{ ...position, left, width: POPOVER_WIDTH, maxHeight }}
      role="dialog"
      aria-label={`Definition of ${word}`}
      // Click anywhere on the card dismisses it — a big, easy target. The
      // cross-ref links inside stop propagation so they navigate instead.
      onClick={onClose}
    >
      <DefinitionView word={word} onNavigate={setWord} />
    </div>
  )
}
