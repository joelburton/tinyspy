// cs-blessed-floating-panels

import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { Rnd } from 'react-rnd'
import { useDraggablePanel, VIEWPORT_EDGE_MARGIN, type PanelRect } from './useDraggablePanel'
import { useIsCoarsePointer } from '../mobile/useIsCoarsePointer'
import { useIsPhone } from '../mobile/useIsPhone'
import { useVisualViewport } from '../mobile/useVisualViewport'
import { useTabRing } from '../keyboard/useTabRing'
import { cls } from '../utils/cls'
import { usePanelEscape } from './usePanelEscape'
import { CloseButton } from '../buttons/CloseButton'
import styles from './FloatingPanel.module.css'

/**
 * How far apart a floating panel's PARTS sit — the field row from the failure
 * line from the results, in the panel's own content column.
 *
 * Two values, because there are two kinds of floating panel and they read
 * differently: a finder you drive from the keyboard wants its parts close, a
 * form you fill in wants room. Anything a panel needs BELOW this level — the gap
 * between a form's fields, the gap inside a field — belongs to the component
 * that owns it, not here.
 */
export type PanelDensity = 'tight' | 'loose'

/**
 * Which KIND of floating panel this is — the one word every caller must pick
 * (docs/ui.md → Floating panels):
 *
 *   - `companion`      something you keep NEARBY while you play: chat, the
 *                      scratchpad, Help, a setter's note.
 *   - `dialog`         a question that can WAIT. Movable, no dim, and it opens
 *                      where you left it.
 *   - `modal-normal`   a question worth thinking or talking about. Dims — but
 *                      chat stays reachable, which is not a leak: a normal
 *                      modal never claimed the world stopped.
 *   - `modal-blocking` the world stops. Answer it now; nothing underneath is
 *                      live.
 *   - `modal-fault`    as blocking, but strictly above it — an error must be
 *                      readable mid-question.
 *
 * The family is what decides the scrim, the drag, Escape, the remembered rect
 * and the layer; `FAMILY` below is the table, and doc.md → Intro to area says why one
 * word rather than five props.
 */
export type PanelFamily =
  | 'companion'
  | 'dialog'
  | 'modal-normal'
  | 'modal-blocking'
  | 'modal-fault'

/** What each family claims, in one place — the table behind `PanelFamily`. */
const FAMILY: Record<
  PanelFamily,
  {
    // Dims the page — and "dim" means everything below is INERT.
    scrim: null | 'light' | 'dark'
    // The family's answer unless the panel argues otherwise: the two patient
    // families hold answers you read or search, a modal holds a form you fill
    // in. The help guides are the panels that argue — companions, but pages to
    // read, so they pass `loose`.
    density: PanelDensity
    // Immovability IS the signal: if you can drag it you can leave it for
    // later; if you cannot, you deal with it now.
    draggable: boolean
    // `'close'` — Escape dismisses it. `'swallow'` — Escape is consumed and
    // NOTHING closes, not even the panel below.
    escape: 'close' | 'swallow'
    // Whether this family opens WHERE YOU LEFT IT. A modal is a fresh task each
    // time, so it centers even though you can move it.
    remembersRect: boolean
    // `'window'` — titlebar with a ✕, and a full-page sheet on a phone.
    // `'card'` — no titlebar; the title is a heading the leaf renders, and it
    // stays a card at every size. The titlebar IS the drag handle, so a family
    // that can never be dragged has no use for one.
    shape: 'window' | 'card'
    // Written out in full rather than interpolated (`var(--z-${family})`),
    // which would blind the dead-token guard to the whole ladder: it captures a
    // dynamically-built name as its prefix, so every token extending `--z-`
    // would read as alive. Spelled out, each reference is exact.
    layer: string
  }
> = {
  companion:        { density: 'tight', scrim: null,    draggable: true,  escape: 'close',   remembersRect: true,  shape: 'window', layer: 'var(--z-companion)' },
  dialog:           { density: 'tight', scrim: null,    draggable: true,  escape: 'close',   remembersRect: true,  shape: 'window', layer: 'var(--z-dialog)' },
  'modal-normal':   { density: 'loose', scrim: 'light', draggable: true,  escape: 'close',   remembersRect: false, shape: 'window', layer: 'var(--z-modal-normal)' },
  'modal-blocking': { density: 'loose', scrim: 'dark',  draggable: false, escape: 'close',   remembersRect: false, shape: 'card',   layer: 'var(--z-modal-blocking)' },
  'modal-fault':    { density: 'loose', scrim: 'dark',  draggable: false, escape: 'swallow', remembersRect: false, shape: 'card',   layer: 'var(--z-modal-fault)' },
}

/**
 * What a floating panel is given. `family` is the one required decision; the
 * rest are the questions a family cannot answer for its members, which the
 * component's docstring walks through. Exported so the family-named components
 * (`Companion`, `Dialog`, `NormalModal`) take the same props minus the one
 * they supply.
 */
export type FloatingPanelProps = {
  // What KIND of panel this is — see `PanelFamily`. Required: there is no
  // sensible default, and a silent one is how a modal-normal ended up with no
  // dim at all.
  family: PanelFamily
  // Override the family's spacing between the panel's parts.
  density?: PanelDensity
  // Titlebar label, for the WINDOW families — it doubles as the drag handle. A
  // CARD family has no titlebar, renders its own heading in the body, and
  // passes nothing here.
  title?: string
  // The ✕, and Escape where the family allows it. Clicking the scrim does NOT
  // dismiss: the click is consumed silently.
  onClose: () => void
  // Where it opens. `'center'` (default) resolves against the viewport on
  // mount; explicit coordinates override. Ignored once `persistKey` has a
  // stored rect.
  defaultPosition?: { x: number; y: number } | 'center'
  // Size on a first mount, and the first-paint seed when `fitContent` is on.
  defaultSize?: { width: number; height: number }
  // Draggable by corners and edges. Default true; a panel whose content knows
  // its own size opts out.
  resizable?: boolean
  // The narrowest this panel may be — a floor on the DRAG, so it means nothing
  // on a panel that cannot be resized. It also floors the viewport clamp, but
  // only as far as the viewport has room for: a minimum never outranks the
  // screen (`clampToViewport`).
  minWidth?: number
  // "You can't drag this shut" — so it means nothing without `resizable`, and
  // it is 0 by default. Where a floor IS wanted, react-rnd only stops for a
  // number: a `min-height` in CSS on chat's message list leaves the list its
  // height and scrolls the body, giving a stubby panel with a scrollbar rather
  // than a floor. Derive the number from what the body needs — "the titlebar,
  // the composer and four messages".
  minHeight?: number
  // Where a remembered rect is stored. The FAMILY decides WHETHER a panel opens
  // where you left it; this says under what key, which is per-instance (the
  // scratchpad's is per-game). Required by the families that remember, ignored
  // by the rest.
  //
  // Restoring on a smaller screen is safe: the rect is hard-clamped into the
  // current viewport on mount and the STORED value is left alone, so plugging
  // the big monitor back in puts the panel where you left it there.
  persistKey?: string
  // Grow on open to fit the natural content height, capped to the viewport
  // (past which the body scrolls), rather than staying at `defaultSize.height`
  // — for a panel whose height varies with what is inside it, like setup. Safe
  // alongside `persistKey` on a panel that is NOT resizable: a stored height
  // only fights the fit if the user chose it, and nobody chooses a height they
  // cannot drag.
  fitContent?: boolean
  // Stacking tier, defaulting to the family's own layer. A STRING, not a
  // number, because the ladder's one home is `base.css` — a numeric default
  // here would be a second copy of the order, free to disagree with the tokens.
  // `guards/vocabularies.test.ts` fails a numeric literal passed here.
  //
  // Pass one only for a panel that can be summoned from inside something
  // outranking its family — chat and the help guides — and say why at the call
  // site. doc.md → Intro to area covers why that case exists.
  zIndex?: string
  // Rank for Escape at the FAMILY's layer rather than at the tier this panel
  // paints on — "paints high, ranks low". Chat is the only caller and the only
  // reason it exists: it paints above every modal so a conversation stays
  // reachable, but ranking there would make Escape close the chat you have kept
  // open all game instead of the form you just opened.
  escapeRank?: 'family'
  // Keep a full-screen phone sheet clear of the on-screen keyboard by sizing it
  // to the measured visual viewport, so a panel with a text input (chat) keeps
  // its input and content above the keyboard. Phone-only, and inert elsewhere
  // (no soft keyboard → visual viewport == layout viewport).
  reserveKeyboard?: boolean
  // Panel body content.
  children: ReactNode
}

/**
 * Reach for this to put a window-like thing over the page: chat, the
 * scratchpad, Help, a word dialog, setup, a confirmation. It is the shell all
 * of them share — one titlebar, one drag, one Escape, one scrim, one layer.
 *
 * **Pick a `family` and the shell supplies the rest** — the scrim and its
 * shade, whether you can drag it, what Escape does, whether it opens where you
 * left it, and what it stacks above. That is the one decision a caller has to
 * make; see `PanelFamily` for the five.
 *
 * Three questions the family can't answer stay props, because panels in the
 * same family differ on them: who knows the SIZE (`resizable` / `fitContent` —
 * chat and Help are both companions and disagree), under what KEY a remembered
 * rect is stored (`persistKey`), and the geometry seeds (`defaultSize`,
 * `minWidth` / `minHeight`).
 *
 * Most callers don't reach for this directly: `<Companion>`, `<Dialog>`,
 * `<NormalModal>` and `<BlockingModal>` each name a family for you. doc.md →
 * Intro to area covers why one shell rather than several.
 */
export function FloatingPanel({
  family,
  title,
  escapeRank,
  onClose,
  defaultPosition = 'center',
  density,
  defaultSize = { width: 480, height: 360 },
  resizable = true,
  minWidth = 240,
  minHeight = 0,
  persistKey,
  zIndex,
  fitContent = false,
  reserveKeyboard = false,
  children,
}: FloatingPanelProps) {
  const claims = FAMILY[family]
  // The family's answer unless the panel argues otherwise.
  const resolvedDensity = density ?? claims.density
  const tier = zIndex ?? claims.layer
  // On a touch device (coarse pointer) every panel is forced
  // non-draggable and non-resizable — dragging/resizing a floating
  // box is a mouse affordance, and (crucially) removing the drag
  // binding is what fixes the close-button bug: react-draggable
  // preventDefault()s the header touchstart, which cancels the
  // synthesized click so the X's onClick never fires. No drag
  // handle → the X works. The full-screen-sheet geometry on phones
  // is handled in CSS (@media (--phone)); tablets keep the centered
  // rect, just pinned in place. doc.md → Details has the phone sheet.
  const coarse = useIsCoarsePointer()
  const effectiveDraggable = claims.draggable && !coarse
  const effectiveResizable = resizable && !coarse
  // A viewport change RE-CENTERS this panel unless it remembers where you put
  // it. See `useReclampOnResize` for why a modal-normal is in the set despite
  // being draggable, and why the second clause matters on a touch device.
  const recenterOnResize = !claims.remembersRect || !effectiveDraggable

  // Escape: what you're IN, else what's on TOP. One listener for the whole app
  // rather than one per panel — see `usePanelEscape`. The id is how the handler
  // maps focus back to a registered panel; it is stamped on the shell as
  // `data-floating-panel`, which the action dispatcher already looks for.
  const panelId = useId()
  usePanelEscape(
    panelId,
    escapeRank === 'family' ? claims.layer : tier,
    claims.escape,
    onClose,
  )

  // WHERE the panel is. One hook for both kinds: a key means the rect is
  // remembered between opens, no key means it resets on every mount, and the
  // family is what decides which (`useDraggablePanel`).
  const { rect, setRect } = useDraggablePanel({
    persistKey: claims.remembersRect ? persistKey : undefined,
    defaultRect: resolveDefaultRect(defaultPosition, defaultSize),
    minWidth,
    minHeight,
    recenterOnResize,
  })

  return (
    <>
      {claims.scrim && (
        <div
          className={claims.scrim === 'dark' ? styles.scrimDark : styles.scrimLight}
          // One tier below the panel it dims, so it covers the page and nothing
          // else.
          style={{ zIndex: `calc(${tier} - 1)` }}
          aria-hidden="true"
          // No onClick: clicking the scrim is deliberately a no-op. The
          // preventDefault stops the click BLURRING the panel's focused control
          // to <body>, which would leak later keystrokes to whatever window
          // listener sits behind it (the crossword grid, under a confirm).
          onMouseDown={(e) => e.preventDefault()}
        />
      )}
      <PanelRnd
        panelId={panelId}
        shape={claims.shape}
        title={title}
        onClose={onClose}
        rect={rect}
        setRect={setRect}
        draggable={effectiveDraggable}
        resizable={effectiveResizable}
        minWidth={minWidth}
        minHeight={minHeight}
        zIndex={tier}
        fitContent={fitContent}
        density={resolvedDensity}
        reserveKeyboard={reserveKeyboard}
      >
        {children}
      </PanelRnd>
    </>
  )
}

/**
 * Draws the panel: the react-rnd box, the titlebar, and the body its children
 * sit in. Everything above decides WHAT a panel is; this is the only piece that
 * puts one on screen.
 *
 * It takes `rect` and `setRect` rather than owning them, because react-rnd is
 * controlled and because who supplies the rect is exactly what separates a
 * panel that remembers its place from one that doesn't (`useDraggablePanel`).
 *
 * Two behaviors here are opt-in, and both are about a panel whose height isn't
 * a fixed number: `fitContent` grows it to its content on open, and
 * `reserveKeyboard` keeps a phone sheet above the on-screen keyboard.
 */
function PanelRnd({
  panelId,
  shape,
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
  density,
  reserveKeyboard = false,
  children,
}: {
  panelId: string
  shape: 'window' | 'card'
  title: string | undefined
  onClose: () => void
  rect: PanelRect
  setRect: (next: PanelRect) => void
  draggable: boolean
  resizable: boolean
  minWidth: number
  minHeight: number
  zIndex: string
  fitContent?: boolean
  density: PanelDensity | undefined
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
  const isPhone = useIsPhone()
  const viewport = useVisualViewport()
  const clampToKeyboard = reserveKeyboard && isPhone

  // ── Content-fit (opt-in via `fitContent`) ──────────────────────────────
  // Grow the panel on open so its natural content is fully visible, capped to
  // the viewport (past which the body scrolls). The measured element is the
  // CONTENT wrapper, not the body, whose box is pinned to the panel height — so
  // a lazily-loaded Suspense body swapping in re-triggers the fit.
  const bodyRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // Every panel is a tab ring: Tab cycles the ✕ and the body's own controls and
  // cannot reach the page behind. Every family, not just the dimming ones.
  const shellRef = useRef<HTMLDivElement>(null)
  useTabRing({ within: shellRef })
  // The latest rect and setter in refs, so the observer below installs ONCE
  // (its deps are just [fitContent]) and still reads current values. Synced in
  // a passive effect — never written during render (react-compiler forbids it).
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
      // Capped to the viewport, keeping the same gutter the clamp keeps, top
      // AND bottom — hence twice the margin.
      const target = Math.min(desired, window.innerHeight - VIEWPORT_EDGE_MARGIN * 2)
      if (Math.abs(target - r.height) <= 1) return // already fits (or capped) — don't loop
      setRectRef.current({
        ...r,
        height: target,
        // ANCHOR THE TOP — don't re-center. A fit can land well after the panel
        // is on screen and under a cursor (a lazily-imported body arriving ~300ms
        // in — see SetupGameModal), and re-centering a growing panel slides
        // everything in it upward by half the growth: buttons move out from
        // under the pointer mid-click. Growing downward from a fixed header is
        // the "don't move what someone is looking at" behavior. The panel's
        // OPENING position is still centered (`defaultPosition: 'center'`), so
        // this only governs later re-fits. The one exception is overflow: if
        // growing would push the panel past the bottom edge, ride it up just
        // enough to fit (never above the shared top margin).
        y: Math.max(
          VIEWPORT_EDGE_MARGIN,
          Math.min(r.y, window.innerHeight - target - VIEWPORT_EDGE_MARGIN),
        ),
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
      // The phone sheet's geometry is CSS, keyed off this: a WINDOW fills the
      // viewport, a CARD stays a card at every size (see the module).
      data-phone={shape === 'window' ? 'sheet' : 'card'}
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
        dragHandleClassName={draggable ? styles.dragHandle : undefined}
        onDragStop={(_e, d) => {
          setRect({ ...rect, x: d.x, y: d.y })
        }}
        onResizeStop={(_e, _dir, ref, _delta, position) => {
          setRect({
            x: position.x,
            y: position.y,
            width: ref.offsetWidth,
            height: ref.offsetHeight,
          })
        }}
      >
        {/* The 100%/100% flex-column wrapper the surface treatment rides on.
            It exists because `Rnd`'s own element doesn't reliably give flex
            children a definite height, and this one does — which is what makes
            the body's `flex: 1 1 auto` + `min-height: 0` chain work for a
            scrollable region like chat's.

            `data-floating-panel` marks the subtree as "a panel owns the
            keyboard here": the action dispatcher stands down for events
            focused inside it, so Enter activates a modal's button rather than
            firing a bound action. (Tab needs no marker — the panel's own ring
            is the innermost one while it is open; see `useTabRing`.) Its
            VALUE is the panel's id, which is how `usePanelEscape` maps focus
            back to a registered panel — the selector doesn't care, since
            `[data-floating-panel]` matches with or without one. */}
        <div
          className={styles.shell}
          data-floating-panel={panelId}
          // WINDOW or CARD — the module reads it for the body padding, since a
          // card's content starts at the top edge with no titlebar above it.
          data-shape={shape}
          ref={shellRef}
        >
          {/* No titlebar for a CARD family, which is what passing no `title`
              means. The `.titlebar` / `.dragHandle` split is so the bar can
              show a `cursor: move` only when there is something to drag;
              react-rnd binds the drag to the second class, which nothing else
              carries — so the body selects text and the ✕ closes. */}
          {title !== undefined && (
            <div
              className={`${styles.titlebar} ${draggable ? styles.dragHandle : ''}`}
            >
              <span className={styles.title}>{title}</span>
              <CloseButton show="icon" className={styles.close} onClick={onClose} />
            </div>
          )}
          {/* ONE content wrapper, always — the panel's parts are its children,
              and this is the only element that spaces them. Unconditional for
              two reasons: the fit effect measures its natural height
              independent of the body's pinned box, and a wrapper that appeared
              only when fitting would mean the density gap applied to some
              panels and not others. It is transparent to the flex chain
              (`.content`), so a child that fills the body still does. */}
          <div className={styles.body} ref={bodyRef}>
            <div
              ref={contentRef}
              className={cls(
                styles.content,
                density === 'loose' ? styles.loose : styles.tight,
                !fitContent && styles.contentFills,
              )}
            >
              {children}
            </div>
          </div>
        </div>
      </Rnd>
    </div>
  )
}

/**
 * The ONE key every help panel persists its rect under — every game's guide and
 * the club's "About clubs" alike. Pass it as `persistKey` from any of them.
 *
 * Shared because help is one habit rather than one per game: park it where you
 * like reading it and every guide opens there. The cost is that a remembered
 * rect carries a SIZE too, so once you have dragged help anywhere, a game's own
 * `defaultSize` stops applying — those seeds only fire on a fresh browser.
 */
export const HELP_RECT_KEY = 'puzpuzpuz:help:rect'

/** Turn a `defaultPosition` choice — centered, or explicit coordinates — plus a
 *  `defaultSize` into the concrete rect a panel opens at. */
function resolveDefaultRect(
  defaultPosition: { x: number; y: number } | 'center',
  defaultSize: { width: number; height: number },
): PanelRect {
  if (defaultPosition === 'center') {
    const vw = window.innerWidth
    const vh = window.innerHeight
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
