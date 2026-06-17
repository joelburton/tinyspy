import { useEffect, useState, type ReactNode } from 'react'
import { Rnd } from 'react-rnd'
import {
  clampToViewport,
  useDraggablePanel,
  type PanelRect,
} from '../hooks/useDraggablePanel'
import styles from './FloatingPanel.module.css'
// (Below: a 'hard'/'soft' literal is passed to clampToViewport
// per-call. See the ClampMode type in useDraggablePanel.)

type Props = {
  /** Header bar label. The header is the drag handle when
   *  draggable; the title is always visible. */
  title: string
  /** Called when the user dismisses the panel (X click in the
   *  header, optional ESC). Backdrop click does NOT dismiss —
   *  even when `backdrop` is set the click is consumed silently. */
  onClose: () => void
  /** Initial position. `'center'` (default) computes a centered
   *  rect on mount from the current viewport and `defaultSize`;
   *  passing explicit coordinates overrides. Ignored if a
   *  persisted rect exists for `persistKey`. */
  defaultPosition?: { x: number; y: number } | 'center'
  /** Initial size on the first mount. Subsequent mounts use the
   *  persisted rect (if `persistKey` is set). */
  defaultSize?: { width: number; height: number }
  /** When true, the panel can be dragged by its header. Default
   *  true. SuspendConfirmDialog opts out for the "small modal"
   *  feel. */
  draggable?: boolean
  /** When true, the panel can be resized by its corners/edges.
   *  Default true. Modals with natural dimensions (Setup, Hint)
   *  opt out. */
  resizable?: boolean
  /** Lower bounds on size when resizable. Defaults are sensible
   *  for chat-sized panels; modals typically tighten them. */
  minWidth?: number
  minHeight?: number
  /** When true, dismiss the panel on ESC. Default true. Chat /
   *  scratchpad set false — they're closed only via the X. */
  closeOnEsc?: boolean
  /** When true, render a fixed-position dimming layer below the
   *  panel that blocks pointer events on everything except the
   *  panel itself (and other panels at higher z-index, like the
   *  always-on-top chat). Default false. Only Setup uses this
   *  today — "you can't set up two games at once" — so the
   *  visual dim signals focused-task and the click-block prevents
   *  accidental Start clicks underneath. Clicking the backdrop
   *  does NOT close the panel; mid-setup state is too easy to
   *  lose to a stray click. */
  backdrop?: boolean
  /** localStorage key under which to persist position + size.
   *  When set, the panel restores its rect on mount and writes
   *  back on every drag/resize. When omitted, the panel uses
   *  `defaultPosition` / `defaultSize` afresh on each mount. */
  persistKey?: string
  /** Stacking tier. Defaults to 500 (the modal tier). Chat passes
   *  10000 so it sits above every modal regardless of open order. */
  zIndex?: number
  /** Panel body content. */
  children: ReactNode
}

/**
 * Shared shell for every floating panel — modals (SetupGameDialog,
 * HowToPlayModal, HintModal, SuspendConfirmDialog), the always-on
 * FloatingChat, and a future per-game scratchpad. One header
 * pattern, one drag implementation (react-rnd), one ESC behavior,
 * one optional backdrop, one z-index axis.
 *
 * Why a single shell rather than separate Modal + FloatingPanel
 * components: the per-panel decisions (draggable, resizable,
 * backdrop, persistence, ESC) are all orthogonal props, and
 * forking the shell into two reads as "Modal vs not" while in
 * truth every panel is a floating panel under the hood. The
 * single component keeps the choice surface visible.
 *
 * Drag handle: when draggable, the header bar carries the
 * `dragHandle` class and react-rnd binds drag events there. The
 * panel body and close button are NOT drag handles — clicking the
 * X reliably closes; selecting text in the body reliably selects.
 *
 * Stacking: z-index is the only mechanism. Default 500 (modal
 * tier). FloatingChat passes 10000 to sit above modals. The
 * backdrop, when present, paints at `zIndex - 1`.
 */
export function FloatingPanel({
  title,
  onClose,
  defaultPosition = 'center',
  defaultSize = { width: 480, height: 360 },
  draggable = true,
  resizable = true,
  minWidth = 240,
  minHeight = 200,
  closeOnEsc = true,
  backdrop = false,
  persistKey,
  zIndex = 500,
  children,
}: Props) {
  // ESC handler. Window-level so it works regardless of where
  // focus lives inside the panel body. Skipped when closeOnEsc
  // is false (chat / scratchpad).
  useEffect(function installEscapeHandler() {
    if (!closeOnEsc) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeOnEsc, onClose])

  // Header acts as the drag handle when draggable. react-rnd
  // identifies it by class name; the .header / .dragHandle
  // distinction is just so the header can render a cursor: move
  // affordance when draggable but not when not.

  return (
    <>
      {backdrop && (
        <div
          className={styles.backdrop}
          style={{ zIndex: zIndex - 1 }}
          aria-hidden="true"
          // No onClick — backdrop click is intentionally a no-op
          // (see Props.backdrop docstring).
        />
      )}
      <FloatingPanelBody
        title={title}
        onClose={onClose}
        defaultPosition={defaultPosition}
        defaultSize={defaultSize}
        draggable={draggable}
        resizable={resizable}
        minWidth={minWidth}
        minHeight={minHeight}
        persistKey={persistKey}
        zIndex={zIndex}
      >
        {children}
      </FloatingPanelBody>
    </>
  )
}

// Inner component split out so the persistence hook can branch
// on `persistKey` without conditionally calling hooks at the
// outer call site (rules-of-hooks).
function FloatingPanelBody({
  title,
  onClose,
  defaultPosition,
  defaultSize,
  draggable,
  resizable,
  minWidth,
  minHeight,
  persistKey,
  zIndex,
  children,
}: {
  title: string
  onClose: () => void
  defaultPosition: { x: number; y: number } | 'center'
  defaultSize: { width: number; height: number }
  draggable: boolean
  resizable: boolean
  minWidth: number
  minHeight: number
  persistKey: string | undefined
  zIndex: number
  children: ReactNode
}) {
  if (persistKey) {
    return (
      <PersistedPanel
        title={title}
        onClose={onClose}
        defaultPosition={defaultPosition}
        defaultSize={defaultSize}
        draggable={draggable}
        resizable={resizable}
        minWidth={minWidth}
        minHeight={minHeight}
        persistKey={persistKey}
        zIndex={zIndex}
      >
        {children}
      </PersistedPanel>
    )
  }
  return (
    <EphemeralPanel
      title={title}
      onClose={onClose}
      defaultPosition={defaultPosition}
      defaultSize={defaultSize}
      draggable={draggable}
      resizable={resizable}
      minWidth={minWidth}
      minHeight={minHeight}
      zIndex={zIndex}
    >
      {children}
    </EphemeralPanel>
  )
}

// Variant with persistence — uses the shared useDraggablePanel
// hook to restore + save the rect.
function PersistedPanel({
  title,
  onClose,
  defaultPosition,
  defaultSize,
  draggable,
  resizable,
  minWidth,
  minHeight,
  persistKey,
  zIndex,
  children,
}: {
  title: string
  onClose: () => void
  defaultPosition: { x: number; y: number } | 'center'
  defaultSize: { width: number; height: number }
  draggable: boolean
  resizable: boolean
  minWidth: number
  minHeight: number
  persistKey: string
  zIndex: number
  children: ReactNode
}) {
  const seed = resolveDefaultRect(defaultPosition, defaultSize)
  const { rect, setRect } = useDraggablePanel({
    persistKey,
    defaultRect: seed,
    minWidth,
    minHeight,
  })
  return (
    <PanelRnd
      title={title}
      onClose={onClose}
      rect={rect}
      setRect={setRect}
      draggable={draggable}
      resizable={resizable}
      minWidth={minWidth}
      minHeight={minHeight}
      zIndex={zIndex}
    >
      {children}
    </PanelRnd>
  )
}

// Variant without persistence — rect lives in component state,
// reset on every mount. Used by modals where "remember position
// across opens" would be surprising.
function EphemeralPanel({
  title,
  onClose,
  defaultPosition,
  defaultSize,
  draggable,
  resizable,
  minWidth,
  minHeight,
  zIndex,
  children,
}: {
  title: string
  onClose: () => void
  defaultPosition: { x: number; y: number } | 'center'
  defaultSize: { width: number; height: number }
  draggable: boolean
  resizable: boolean
  minWidth: number
  minHeight: number
  zIndex: number
  children: ReactNode
}) {
  // Lazy initializer computes the seed rect once on mount —
  // resolves the centered/explicit default against the current
  // viewport, then HARD-clamps so the panel appears fully
  // inside. Subsequent drag/resize stops use the SOFT clamp
  // (let the user park the panel partly off-screen for
  // juggling).
  const [rect, setRectState] = useState<PanelRect>(() =>
    clampToViewport(
      resolveDefaultRect(defaultPosition, defaultSize),
      minWidth,
      minHeight,
      8,
      'hard',
    ),
  )
  const setRect = (next: PanelRect) =>
    setRectState(clampToViewport(next, minWidth, minHeight, 8, 'soft'))
  return (
    <PanelRnd
      title={title}
      onClose={onClose}
      rect={rect}
      setRect={setRect}
      draggable={draggable}
      resizable={resizable}
      minWidth={minWidth}
      minHeight={minHeight}
      zIndex={zIndex}
    >
      {children}
    </PanelRnd>
  )
}

// The actual react-rnd render. Shared between the persisted and
// ephemeral variants — react-rnd is opinionated about controlled
// state, so the `rect` / `setRect` pair is the same shape in
// both cases.
function PanelRnd({
  title,
  onClose,
  rect,
  setRect,
  draggable,
  resizable,
  minWidth,
  minHeight,
  zIndex,
  children,
}: {
  title: string
  onClose: () => void
  rect: PanelRect
  setRect: (next: PanelRect) => void
  draggable: boolean
  resizable: boolean
  minWidth: number
  minHeight: number
  zIndex: number
  children: ReactNode
}) {
  return (
    <Rnd
      className={styles.rnd}
      style={{ zIndex }}
      size={{ width: rect.width, height: rect.height }}
      position={{ x: rect.x, y: rect.y }}
      // Intentionally no `bounds` prop — we want users to be
      // able to drag the panel past the viewport edges for
      // juggling (slide chat to the corner so they can see more
      // of a setup dialog). The soft clamp in setRect catches
      // the drag-stop position and ensures at least ~60px stays
      // visible on each axis, with the header always reachable
      // (top edge can't go negative).
      minWidth={minWidth}
      minHeight={minHeight}
      disableDragging={!draggable}
      enableResizing={resizable}
      // Header carries the dragHandle class; clicking the body
      // doesn't initiate a drag, and clicking the X reliably
      // closes the panel.
      dragHandleClassName={draggable ? styles.dragHandle : undefined}
      onDragStop={(_e, d) => setRect({ ...rect, x: d.x, y: d.y })}
      onResizeStop={(_e, _dir, ref, _delta, position) =>
        setRect({
          x: position.x,
          y: position.y,
          width: ref.offsetWidth,
          height: ref.offsetHeight,
        })
      }
    >
      {/* Inner shell with explicit width: 100%; height: 100% +
          display: flex; flex-direction: column. The Rnd outer
          element doesn't reliably propagate a definite height to
          flex children — this 100%/100% wrapper does, which is
          what lets the body's flex: 1 1 auto + min-height: 0
          chain work for chat's scrollable region. Pattern
          mirrors ../connections' ChatPanel.module.css. */}
      <div className={styles.shell}>
        <header
          className={`${styles.header} ${draggable ? styles.dragHandle : ''}`}
        >
          <span className={styles.title}>{title}</span>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </Rnd>
  )
}

/** Translate the user's `defaultPosition` choice (centered, or
 *  explicit) plus `defaultSize` into a concrete rect. The center
 *  branch computes once on mount against the current viewport. */
function resolveDefaultRect(
  defaultPosition: { x: number; y: number } | 'center',
  defaultSize: { width: number; height: number },
): PanelRect {
  if (defaultPosition === 'center') {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024
    const vh = typeof window !== 'undefined' ? window.innerHeight : 768
    return {
      x: Math.max(0, Math.round((vw - defaultSize.width) / 2)),
      y: Math.max(0, Math.round((vh - defaultSize.height) / 2)),
      width: defaultSize.width,
      height: defaultSize.height,
    }
  }
  return {
    x: defaultPosition.x,
    y: defaultPosition.y,
    width: defaultSize.width,
    height: defaultSize.height,
  }
}
