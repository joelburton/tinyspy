// cs-audited

import { useEffect } from 'react'
import type { PanelFamily } from '../../components/floating-panels/FloatingPanel'

/**
 * How each family answers Escape. `'close'` dismisses; `'swallow'` consumes the
 * key and closes NOTHING — not the panel, and not whatever is under it.
 */
export type EscapePolicy = 'close' | 'swallow'

/**
 * Where each family sits for the purposes of "which panel is on top". Same
 * order as the z- ladder, and deliberately the FAMILY's order rather than the
 * painted one: chat lives at `z-chat`, above every modal, but it is classed a
 * companion — so with a setup modal open, Escape closes the setup, not the
 * conversation you have been keeping open all game (Joel, 2026-08-24).
 */
const RANK: Record<PanelFamily, number> = {
  companion: 0,
  dialog: 1,
  'modal-normal': 2,
  'modal-blocking': 3,
  'modal-fault': 4,
}

type Entry = {
  /** Matches the panel shell's `data-floating-panel` value. */
  id: string
  family: PanelFamily
  escape: EscapePolicy
  onClose: () => void
  /** Mount order, so ties break by later-mounted-wins. */
  seq: number
}

/** Every panel currently on screen. Module-level on purpose: the whole point is
 *  that Escape is answered ONCE for the app, not once per panel. */
const open: Entry[] = []
let seqCounter = 0
let listening = false

/** The panel Escape belongs to when focus is not inside any of them: highest
 *  family rank, later mount breaking a tie. */
function topmost(): Entry | undefined {
  return open.reduce<Entry | undefined>((best, e) => {
    if (!best) return e
    if (RANK[e.family] > RANK[best.family]) return e
    if (RANK[e.family] === RANK[best.family] && e.seq > best.seq) return e
    return best
  }, undefined)
}

/** The panel containing focus, if focus is in one at all. */
function focused(): Entry | undefined {
  const el = document.activeElement?.closest?.('[data-floating-panel]')
  if (!el) return undefined
  const id = el.getAttribute('data-floating-panel')
  return open.find((e) => e.id === id)
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || open.length === 0) return
  // Escape belongs to the panels whenever any are open, so it never falls
  // through to a game's own handler with a modal on screen.
  const target = focused() ?? topmost()
  if (!target) return
  e.preventDefault()
  if (target.escape === 'close') target.onClose()
}

/**
 * Escape for floating panels: **what you're IN, else what's on TOP.**
 *
 *   1. Focus is inside a panel → Escape acts on THAT panel, and stops there.
 *      You have been typing in chat; Escape closes chat, whatever is stacked
 *      above it. If that panel swallows Escape, nothing happens — it does not
 *      fall through to the panel below, which would be the most confusing
 *      outcome available.
 *   2. Focus is not in any panel → Escape acts on the top one, ranked by
 *      FAMILY (see `RANK`), later-mounted breaking ties.
 *
 * **Why this is one module-level listener and not one per panel.** It used to be
 * per-panel, and two open panels meant two listeners, so a single Escape fired
 * both: open a game's setup, open Help from its footer "?", press Escape once,
 * and BOTH close — the form you were filling in is gone
 * (plans/areas/floating-panels.md → F16 `esc-closes-every-panel`). A key that
 * means "dismiss this" cannot be answered by everything at once; something has
 * to know what "this" is, and that is the registry below.
 *
 * The registry doubles as the answer to "which movable thing is on top", which
 * §20's Open 1 needs for the same reason.
 */
export function usePanelEscape(
  id: string,
  family: PanelFamily,
  escape: EscapePolicy,
  onClose: () => void,
): void {
  useEffect(() => {
    const entry: Entry = { id, family, escape, onClose, seq: seqCounter++ }
    open.push(entry)
    if (!listening) {
      window.addEventListener('keydown', onKeyDown)
      listening = true
    }
    return () => {
      const i = open.indexOf(entry)
      if (i !== -1) open.splice(i, 1)
      if (open.length === 0 && listening) {
        window.removeEventListener('keydown', onKeyDown)
        listening = false
      }
    }
  }, [id, family, escape, onClose])
}
