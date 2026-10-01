// cs-unmet

import { useEffect, type RefObject } from 'react'

type CloseOnOutsideMousedownOptions = {
  isOpen: boolean
  triggerRef: RefObject<HTMLElement | null>
  popoverRef: RefObject<HTMLElement | null>
  onClose: () => void
}

/**
 * While the menu is open, a mousedown outside both the trigger and the popover
 * closes it. Mousedown rather than click, so the close lands before any click
 * handler underneath runs.
 */
export function useCloseOnOutsideMousedown({
  isOpen,
  triggerRef,
  popoverRef,
  onClose,
}: CloseOnOutsideMousedownOptions): void {
  useEffect(function closeOnOutsideMousedown() {
    if (!isOpen) return
    function handleMousedown(e: MouseEvent) {
      const target = e.target as Node | null
      if (!target) return
      if (popoverRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('mousedown', handleMousedown)
    return () => document.removeEventListener('mousedown', handleMousedown)
  }, [isOpen, triggerRef, popoverRef, onClose])
}
