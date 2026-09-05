// cs-unmet

import { FloatingPanel, type FloatingPanelProps } from './FloatingPanel'

/**
 * A COMPANION — a floating window that keeps you company while you play: chat,
 * the help guides, the scratchpad, the AI suggesters, crosswords' notes.
 *
 * Same shape and same behavior as a `<Dialog>` — no scrim, draggable, remembers
 * where you left it — and the difference is the stacking TIER. A companion sits
 * above the dialogs, which is what lets `?` open the rules over a setup form
 * rather than behind it.
 *
 * What a companion IS lives in `FloatingPanel`'s `FAMILY` table; this supplies
 * the family name.
 */
export function Companion(props: Omit<FloatingPanelProps, 'family'>) {
  return <FloatingPanel family="companion" {...props} />
}
