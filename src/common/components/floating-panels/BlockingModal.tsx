// cs-audited

import { useRef, type ReactNode } from 'react'
import { FloatingPanel } from './FloatingPanel'
import { useFocusTrap } from '../../hooks/ui/useFocusTrap'
import actionRow from './modalActions.module.css'

type Props = {
  /** The titlebar line — usually the question or the headline. */
  title: string
  /** Esc and the titlebar ✕. Whether a footer button also routes here is the
   *  leaf's business. The backdrop deliberately does NOT: see-and-acknowledge. */
  onClose: () => void
  /** The body — whatever this modal is about. */
  children: ReactNode
  /** The footer row. Pass the buttons; the row and its layout are ours. */
  actions: ReactNode
  /**
   * How wide, in px. **Height is not a prop** — `fitContent` handles it, since
   * a modal is as tall as its message. Width has no such answer: nothing in the
   * content says how long a line should be, so somebody has to choose.
   *
   * 420 is the confirmation's long-standing number and now the category's
   * default. The fault passes 460, which is the only other value the app has
   * ever used here and which nothing written down explains.
   */
  width?: number
  /** Stacking tier, as a token string. **Deliberately not defaulted to
   *  `--z-modal-blocking`**: the two ladders coexist and a component moves rung
   *  by rung (plans/css-system-2.md §20 → Open 3), so leaving this unset keeps
   *  today's paint exactly. Passing one would move this modal alone, which is
   *  how a thing ends up ranked against neighbors that have not moved. */
  zIndex?: string
}

/**
 * **The blocking modal** — the shell for the strictest category the app has
 * (plans/css-system-2.md §20). The world stops: nothing underneath is live,
 * and you answer it now.
 *
 * It exists because the category was hand-assembled at every site — four
 * `FloatingPanel` props, a `useFocusTrap` call, and a footer `<div>` carrying
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
 *     number. It replaces the two hand-written ones, 240 and 280. Width is a
 *     different question and stays a prop — see it.
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
  width = 420,
  zIndex,
}: Props) {
  // The trap works on the enclosing `[data-floating-panel]`, so it needs an
  // anchor rendered inside the shell — this body div is it.
  const bodyRef = useRef<HTMLDivElement>(null)
  useFocusTrap(bodyRef)

  return (
    <FloatingPanel
      title={title}
      onClose={onClose}
      draggable={false}
      resizable={false}
      backdrop
      fitContent
      // The height is a first-paint seed only; `fitContent` grows past it.
      defaultSize={{ width, height: 240 }}
      minWidth={320}
      minHeight={200}
      zIndex={zIndex}
    >
      <div ref={bodyRef}>
        {children}
        <div className={actionRow.modalActions}>{actions}</div>
      </div>
    </FloatingPanel>
  )
}
