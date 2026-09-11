// cs-audited-floating-panels

import type { ReactNode } from 'react'
import { FloatingPanel, type PanelFamily } from './FloatingPanel'
import actionRow from './modalActions.module.css'
import styles from './BlockingModal.module.css'

type Props = {
  // The headline, usually the question. An `<h2>` at the top of the body, not
  // a titlebar — a card has none. Omit it and the leaf renders its own: the
  // fault's is red, and that color IS the shape test ("a box popped up, the
  // app broke").
  title?: string
  // Escape, and whatever footer button also means "get me out" — a card has no
  // ✕, so the fault's Close is the only exit it has. Clicking the scrim does
  // not: see-and-acknowledge.
  onClose: () => void
  // The body — whatever this modal is about.
  children: ReactNode
  // The footer row. Pass the buttons; the row and its layout are ours.
  actions: ReactNode
  // Which of the two blocking families this is. Both stop the world; the fault
  // sits strictly above, because an error must be readable mid-question, and
  // it SWALLOWS Escape where a confirmation accepts it.
  //
  // Narrowed to the two deliberately: a `modal-normal` keeps its drag, so
  // handing that value here would make a movable "blocking" modal, which is
  // the one thing the category cannot be.
  family?: Extract<PanelFamily, 'modal-blocking' | 'modal-fault'>
}

/**
 * Reach for this to stop the world and ask something: nothing underneath is
 * live, and the player answers it now (docs/ui.md → Floating panels).
 *
 * Give it a `title`, a body, and the footer `actions` — every other decision
 * the category makes is made here and is not a prop, because a blocking modal
 * that differed from its siblings would be claiming something about itself
 * that isn't true. doc.md → Design covers which decisions those are.
 *
 * Usually you want a MEMBER of the category rather than this directly:
 * `ConfirmationBlockingModal` asks a question, `AcknowledgeBlockingModal`
 * states something, and `FaultModal` is this one tier up. Reach for the shell
 * itself when the body is something else entirely — crosswords' jump-to-number.
 *
 * NOT for a modal you can move: that is a `modal-normal` (setup, edit profile,
 * the celebration), and its drag is the point.
 */
export function BlockingModal({
  title,
  onClose,
  children,
  actions,
  family = 'modal-blocking',
}: Props) {
  return (
    <FloatingPanel
      family={family}
      onClose={onClose}
      resizable={false}
      fitContent
      // The one width the category gets; the height is a first-paint seed
      // only, since `fitContent` grows past it. Passes no `minWidth`: a floor
      // stops a DRAG, and nothing here can be dragged. Narrower than this and
      // the viewport governs, which is what should happen.
      defaultSize={{ width: 420, height: 240 }}
    >
      {title !== undefined && <h2 className={styles.title}>{title}</h2>}
      {children}
      <div className={actionRow.modalActions}>{actions}</div>
    </FloatingPanel>
  )
}
