// cs-unmet

import type { ReactNode } from 'react'
import { FloatingPanel, type PanelFamily } from './FloatingPanel'
import actionRow from './modalActions.module.css'
import styles from './BlockingModal.module.css'

type Props = {
  /** The headline — usually the question. Rendered as an `<h2>` at the top of
   *  the body, NOT in a titlebar: a card family has none, because the titlebar
   *  is the drag handle and this can never be dragged. Optional for a leaf that
   *  wants to render its own (the fault's is red — that color IS the shape
   *  test, "a box popped up, the app broke"). */
  title?: string
  /** Escape. A card has no ✕, so a footer button must also route here — the
   *  fault's Close is the only exit it has. The scrim deliberately does NOT:
   *  see-and-acknowledge. */
  onClose: () => void
  /** The body — whatever this modal is about. */
  children: ReactNode
  /** The footer row. Pass the buttons; the row and its layout are ours. */
  actions: ReactNode
  /**
   * Which of the two blocking families this is. Both stop the world; the fault
   * sits strictly above, because an error must be readable mid-question — and
   * it SWALLOWS Escape, where a confirmation accepts it.
   *
   * Narrowed to the two on purpose: a `modal-normal` keeps its drag, and
   * handing that value to this component would produce a movable "blocking"
   * modal, which is the one thing the category cannot be.
   */
  family?: Extract<PanelFamily, 'modal-blocking' | 'modal-fault'>
}

/**
 * **The blocking modal** — the shell for the strictest category the app has
 * (plans/css-system-2.md §20). The world stops: nothing underneath is live,
 * and you answer it now.
 *
 * It exists because the category was hand-assembled at every site — four
 * `FloatingPanel` props and a footer `<div>` carrying
 * the shared class, written out separately by the confirmation and the fault.
 * Four things that had to agree, and nothing making them.
 *
 * What it fixes, and why none of these is a prop:
 *
 *   - **`backdrop`** — "dim" here must mean everything below is inert, which
 *     for this category is literally true rather than a mood.
 *   - **not draggable, not resizable** — immovability IS the visible signal.
 *     If you can drag a floating panel you can leave it for later; if you
 *     cannot, you deal with it now. A blocking modal you could shove aside
 *     would be lying about its own category.
 *   - **`fitContent`** — §20's resize test: the content knows the HEIGHT here
 *     (a modal is as tall as its message), so nobody should be picking that
 *     number. It replaces the two hand-written ones, 240 and 280.
 *   - **420 wide, and it is not a prop.** `fitContent` governs height only, so
 *     somebody still has to choose a width — but the category should be ONE
 *     width. The app had two, 420 and 460, and the 40px between them was a
 *     difference without a distinction (Joel, 2026-08-24): two hands, no
 *     decision. A modal that needs to be wider than its siblings would be
 *     saying something about itself that is not true.
 *   - **focus trapped** — the keyboard is owned outright, or "nothing
 *     underneath is live" stops being true the moment you press Tab.
 *
 * Members: `ConfirmationBlockingModal` (a question), `AcknowledgeBlockingModal`
 * (a statement), and the fault, which is this behavior one tier up.
 *
 * NOT for a modal you can move — that is a `modal-normal` (setup, edit profile,
 * the celebration), and its drag is the point.
 */
export function BlockingModal({
  title,
  onClose,
  children,
  actions,
  family = 'modal-blocking',
}: Props) {
  // The trap works on the enclosing `[data-floating-panel]`, so it needs an
  // anchor rendered inside the shell — this body div is it.

  return (
    <FloatingPanel
      family={family}
      onClose={onClose}
      resizable={false}
      fitContent
      // The height is a first-paint seed only; `fitContent` grows past it.
      defaultSize={{ width: 420, height: 240 }}
      minWidth={320}
      // No height floor — and none is passed, because the shell no longer has
      // one to opt out of. This is the panel that proved the point: the old
      // default of 200 held it 81px taller than its own content.
    >
      {title !== undefined && <h2 className={styles.title}>{title}</h2>}
      {children}
      <div className={actionRow.modalActions}>{actions}</div>
    </FloatingPanel>
  )
}
