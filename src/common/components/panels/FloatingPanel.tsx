import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Rnd } from 'react-rnd'
import {
  clampToViewport,
  useDraggablePanel,
  type PanelRect,
} from '../../hooks/ui/useDraggablePanel'
import { useCoarsePointer } from '../../hooks/ui/useCoarsePointer'
import { usePhone } from '../../hooks/ui/usePhone'
import { useVisualViewport } from '../../hooks/ui/useVisualViewport'
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
  /** When true, the panel GROWS on open to fit its natural content
   *  height (capped to the viewport, past which the body scrolls),
   *  instead of staying at `defaultSize.height`. `defaultSize.height`
   *  becomes just the first-paint seed. For content-sized modals
   *  whose height varies with what's inside — the Setup dialog, where
   *  a game with many options must open tall enough to show them all.
   *  Incompatible with `persistKey` (a saved height would fight the
   *  fit), so only the ephemeral, non-persisted panels honor it. */
  fitContent?: boolean
  /** Stacking tier. Defaults to 500 (the modal tier). Chat passes
   *  10000 so it sits above every modal regardless of open order. */
  zIndex?: number
  /** When true, a full-screen phone sheet stays clear of the
   *  on-screen keyboard: it's sized to the measured visual viewport
   *  (which shrinks by the keyboard), so a panel with a text input
   *  (chat) keeps its input + content above the keyboard with
   *  nothing hidden behind it. Phone-only; inert on tablets/desktop
   *  (no soft keyboard → visual viewport == layout viewport).
   *  Default false. */
  reserveKeyboard?: boolean
  /** Panel body content. */
  children: ReactNode
}

/**
 * Shared shell for every floating panel — modals (SetupGameDialog,
 * Help, HintModal, SuspendConfirmDialog, GameOverModal), the always-on
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
  fitContent = false,
  reserveKeyboard = false,
  children,
}: Props) {
  // On a touch device (coarse pointer) every panel is forced
  // non-draggable and non-resizable — dragging/resizing a floating
  // box is a mouse affordance, and (crucially) removing the drag
  // binding is what fixes the close-button bug: react-draggable
  // preventDefault()s the header touchstart, which cancels the
  // synthesized click so the X's onClick never fires. No drag
  // handle → the X works. The full-screen-sheet geometry on phones
  // is handled in CSS (@media (--phone)); tablets keep the centered
  // rect, just pinned in place. See docs/mobile.md → "Panels on touch".
  const coarse = useCoarsePointer()
  const effectiveDraggable = draggable && !coarse
  const effectiveResizable = resizable && !coarse

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
        draggable={effectiveDraggable}
        resizable={effectiveResizable}
        minWidth={minWidth}
        minHeight={minHeight}
        persistKey={persistKey}
        zIndex={zIndex}
        fitContent={fitContent}
        reserveKeyboard={reserveKeyboard}
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
  fitContent,
  reserveKeyboard,
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
  fitContent: boolean
  reserveKeyboard: boolean
  children: ReactNode
}) {
  if (persistKey) {
    // A persisted panel restores a saved height, which would fight the
    // content-fit — so `fitContent` doesn't apply here (see the prop docstring).
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
        reserveKeyboard={reserveKeyboard}
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
      fitContent={fitContent}
      reserveKeyboard={reserveKeyboard}
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
  reserveKeyboard,
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
  reserveKeyboard: boolean
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
      reserveKeyboard={reserveKeyboard}
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
  fitContent,
  reserveKeyboard,
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
  fitContent: boolean
  reserveKeyboard: boolean
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
      fitContent={fitContent}
      reserveKeyboard={reserveKeyboard}
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
  fitContent = false,
  reserveKeyboard = false,
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
  fitContent?: boolean
  reserveKeyboard?: boolean
  children: ReactNode
}) {
  // ── Keyboard-aware clamp (opt-in via `reserveKeyboard`, phones only) ────
  // A full-screen phone sheet with a text input (chat) must not extend behind
  // the on-screen keyboard — otherwise the webview scrolls to the hidden part
  // (and iOS auto-scrolls there on focus/send). We can't know the keyboard's
  // height (and there's no way to hide iOS's QuickType bar), so instead of
  // guessing we size the sheet to the MEASURED visible region: clamp the fixed
  // clip layer to the visual viewport, which shrinks exactly by the keyboard.
  // The sheet then ends at the keyboard's top edge; the input rides it, and
  // there's nothing behind it to scroll to. Phone-only: only there does the
  // sheet fill the clip layer (elsewhere it's a floating/centered panel, so
  // shrinking the layer would just clip it). Off a phone the hooks are inert
  // (no soft keyboard → visual viewport == layout viewport).
  const isPhone = usePhone()
  const viewport = useVisualViewport()
  const clampToKeyboard = reserveKeyboard && isPhone

  // ── Content-fit (opt-in via `fitContent`) ──────────────────────────────
  // Grow the panel on open so its natural content is fully visible, capped to
  // the viewport (past which the body scrolls). We measure the CONTENT wrapper
  // (not the body, whose box is pinned to the panel height) so a lazily-loaded
  // Suspense body swapping in re-triggers the fit. Latest rect/setRect ride in
  // refs so the observer is installed once (no reconnect churn per fit).
  const bodyRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const userMovedRef = useRef(false) // once the user drags/resizes, stop re-centering
  // Latest rect/setRect kept in refs so the observer below installs ONCE (its
  // deps are just [fitContent]) yet always reads current values. Synced in a
  // passive effect — never written during render (react-compiler forbids that).
  const rectRef = useRef(rect)
  const setRectRef = useRef(setRect)
  useEffect(() => {
    rectRef.current = rect
    setRectRef.current = setRect
  })

  useLayoutEffect(() => {
    if (!fitContent) return
    const body = bodyRef.current
    const content = contentRef.current
    if (!body || !content) return
    // The body's own vertical padding sits OUTSIDE `content.offsetHeight`, so it
    // must be added explicitly — omitting it left the panel a dozen px short.
    const cs = getComputedStyle(body)
    const bodyPadV = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
    const fit = () => {
      const r = rectRef.current
      // Everything above the body's content box (shell border + header). Reading
      // it off the live DOM (panel height − body's inner height) keeps it exact
      // regardless of header wrapping, and it's constant so the target is stable
      // no matter the current height → converges in one step (grow OR shrink).
      const chromeAboveBody = r.height - body.clientHeight
      const desired = Math.ceil(chromeAboveBody + bodyPadV + content.offsetHeight)
      const target = Math.min(desired, window.innerHeight - 16)
      if (Math.abs(target - r.height) <= 1) return // already fits (or capped) — don't loop
      setRectRef.current({
        ...r,
        height: target,
        // Re-center vertically on open; once the user has moved the panel,
        // leave its position (setRect soft-clamps it back into view).
        y: userMovedRef.current
          ? r.y
          : Math.max(8, Math.round((window.innerHeight - target) / 2)),
      })
    }
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(fit)
    ro.observe(content)
    return () => ro.disconnect()
  }, [fitContent])

  return (
    // The fixed, overflow-hidden clip layer keeps an off-screen-dragged panel
    // from extending the document (which would scroll the whole page — a hard
    // no). It also makes react-rnd's absolute coords viewport-relative, matching
    // the `clampToViewport` math. `pointer-events` are off on the layer and back
    // on for the panel (see the CSS), so the page beneath stays clickable.
    <div
      className={styles.clipLayer}
      style={
        clampToKeyboard
          ? // Pin the layer to the visible region (above the keyboard). `top`
            // tracks offsetTop so it follows any iOS focus-scroll; `bottom: auto`
            // lets `height` win over the CSS `inset: 0`.
            {
              zIndex,
              top: viewport.offsetTop,
              height: viewport.height,
              bottom: 'auto',
            }
          : { zIndex }
      }
    >
      <Rnd
        className={styles.rnd}
        size={{ width: rect.width, height: rect.height }}
        position={{ x: rect.x, y: rect.y }}
        // Intentionally no `bounds` prop — we want users to be
        // able to drag the panel past the viewport edges for
        // juggling (slide chat to the corner so they can see more
        // of a setup dialog). The soft clamp in setRect catches
        // the drag-stop position and ensures at least ~60px stays
        // visible on each axis, with the header always reachable
        // (top edge can't go negative). The off-screen part is
        // clipped by `.clipLayer`, so it never scrolls the page.
        minWidth={minWidth}
        minHeight={minHeight}
        disableDragging={!draggable}
        enableResizing={resizable}
        // Header carries the dragHandle class; clicking the body
        // doesn't initiate a drag, and clicking the X reliably
        // closes the panel.
        dragHandleClassName={draggable ? styles.dragHandle : undefined}
        onDragStop={(_e, d) => {
          userMovedRef.current = true // stop auto-re-centering after a manual move
          setRect({ ...rect, x: d.x, y: d.y })
        }}
        onResizeStop={(_e, _dir, ref, _delta, position) => {
          userMovedRef.current = true
          setRect({
            x: position.x,
            y: position.y,
            width: ref.offsetWidth,
            height: ref.offsetHeight,
          })
        }}
      >
        {/* Inner shell with explicit width: 100%; height: 100% +
            display: flex; flex-direction: column. The Rnd outer
            element doesn't reliably propagate a definite height to
            flex children — this 100%/100% wrapper does, which is
            what lets the body's flex: 1 1 auto + min-height: 0
            chain work for chat's scrollable region. Pattern
            mirrors ../connections' ChatPanel.module.css. */}
        {/* `data-floating-panel` marks this subtree as "a panel owns the keyboard
            here": the game's window-level key capture (useGlobalKeyHandler) bails
            for events whose focus is inside it, so Enter activates a modal button
            and Tab moves between its controls instead of being swallowed. */}
        <div className={styles.shell} data-floating-panel>
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
          {/* When fitting, the content is wrapped so its natural height can be
              measured independent of the body's pinned box (see the fit effect).
              Other panels render children directly — no structural change. */}
          <div className={styles.body} ref={bodyRef}>
            {fitContent ? <div ref={contentRef}>{children}</div> : children}
          </div>
        </div>
      </Rnd>
    </div>
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
