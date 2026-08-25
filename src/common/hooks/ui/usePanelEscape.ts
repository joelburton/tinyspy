// cs-audited

import { useEffect } from 'react'

/**
 * How each family answers Escape. `'close'` dismisses; `'swallow'` consumes the
 * key and closes NOTHING — not the panel, and not whatever is under it.
 */
export type EscapePolicy = 'close' | 'swallow'

/**
 * Resolve a tier expression — `'var(--z-modal-normal)'` — to the number the
 * ladder gives it.
 *
 * **Reading the real value is the point.** A hand-written rank table lived here
 * first, and it was a second copy of an order that already exists in
 * `base.css`: it disagreed with the ladder the moment Help got a rung of its
 * own, ranking BELOW the setup dialog it paints above. Escape order and paint
 * order are the same order, with exactly one stated exception (chat, below), so
 * there is no reason for a second list.
 *
 * Cached because these never change — no theme moves a z- layer. Falls back to
 * 0 outside a browser (jsdom returns nothing for a custom property), where
 * every panel ties and mount order decides, which is a sane degradation for a
 * key nothing headless presses.
 */
const rankCache = new Map<string, number>()
function rankOf(tier: string): number {
  const hit = rankCache.get(tier)
  if (hit !== undefined) return hit
  const token = tier.match(/--[\w-]+/)?.[0]
  const raw = token
    ? getComputedStyle(document.documentElement).getPropertyValue(token)
    : ''
  const n = Number.parseInt(raw, 10)
  const rank = Number.isNaN(n) ? 0 : n
  rankCache.set(tier, rank)
  return rank
}

type Entry = {
  /** Matches the panel shell's `data-floating-panel` value. */
  id: string
  /** The tier this panel ranks at for Escape — usually the one it paints at. */
  tier: string
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

/** The panel Escape belongs to when focus is not inside any of them: the
 *  highest tier, later mount breaking a tie. */
function topmost(): Entry | undefined {
  return open.reduce<Entry | undefined>((best, e) => {
    if (!best) return e
    const a = rankOf(e.tier)
    const b = rankOf(best.tier)
    if (a > b) return e
    if (a === b && e.seq > best.seq) return e
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
 *   2. Focus is not in any panel → Escape acts on the top one, **ranked by the
 *      tier it sits at** — the same order it paints in — with later-mounted
 *      breaking ties. Exactly one component ranks somewhere other than where it
 *      paints: chat, which lives above every modal so a conversation stays
 *      reachable, but ranks at its family so a modal you just opened takes
 *      Escape first (Joel, 2026-08-24).
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
  tier: string,
  escape: EscapePolicy,
  onClose: () => void,
): void {
  useEffect(() => {
    const entry: Entry = { id, tier, escape, onClose, seq: seqCounter++ }
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
  }, [id, tier, escape, onClose])
}
