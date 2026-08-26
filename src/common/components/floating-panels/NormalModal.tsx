// cs-unmet

import { FloatingPanel, type FloatingPanelProps } from './FloatingPanel'

/**
 * A NORMAL MODAL — a form that claims the page until you finish or cancel it:
 * game setup, edit profile, edit club.
 *
 * "Normal" against the two BLOCKING families (`<BlockingModal>`): this one dims
 * the page but you can still drag it, so you can move it aside to read what is
 * underneath. A blocking modal cannot be moved, which IS the signal — you deal
 * with it now.
 *
 * **It takes no `persistKey`**, and that is the point of it being its own
 * component. A modal is a fresh task each time and lands centered
 * (`remembersRect: false`), so on `<NormalModal>` the key is accepted and
 * then discarded at runtime. Here it cannot be passed at all.
 */
export function NormalModal(props: Omit<FloatingPanelProps, 'family' | 'persistKey'>) {
  return <FloatingPanel family="modal-normal" {...props} />
}
