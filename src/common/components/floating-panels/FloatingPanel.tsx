// cs-unmet

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Rnd } from 'react-rnd'
import {
  clampToViewport,
  useDraggablePanel,
  useReclampOnResize,
  VIEWPORT_EDGE_MARGIN,
  type PanelRect,
} from '../../hooks/ui/useDraggablePanel'
import { useCoarsePointer } from '../../hooks/ui/useCoarsePointer'
import { usePhone } from '../../hooks/ui/usePhone'
import { useVisualViewport } from '../../hooks/ui/useVisualViewport'
import { useFocusTrap } from '../../hooks/ui/useFocusTrap'
import { cls } from '../../lib/util/cls'
import { usePanelEscape } from '../../hooks/ui/usePanelEscape'
import { CloseButton } from '../buttons/CloseButton'
import styles from './FloatingPanel.module.css'
// (Below: a 'hard'/'soft' literal is passed to clampToViewport
// per-call. See the ClampMode type in useDraggablePanel.)

/**
 * Which KIND of floating panel this is (plans/app-audit.md §20).
 *
 * The five families are the app's vocabulary for what a panel claims about the
 * page underneath it, and declaring one is how a panel gets held to that claim
 * — before this prop existed the claim lived in a document and the code
 * disagreed with it in four measurable ways (a modal-normal with no scrim,
 * three dialogs that forgot the rect they are defined by, three dimmed forms
 * that let Tab walk out behind them, and a scrim shade that tracked how each
 * panel was BUILT rather than what it meant).
 *
 *   - `companion`  something you keep NEARBY while you play — open it, keep it
 *                  open, move it where you want. Chat, the scratchpad, Help, a
 *                  setter's note. Reading is the common case; writing (the
 *                  scratchpad) is the exception, which is why it is not called
 *                  a workspace.
 *   - `dialog`     a question that can WAIT. No dim, movable, and it opens
 *                  where you left it.
 *   - `modal-normal`   a question worth thinking or talking about. Dims to
 *                  focus you — but chat stays reachable, which is not a leak: a
 *                  normal modal never claimed the world stopped.
 *   - `modal-blocking` the world stops. Answer it now; nothing underneath is
 *                  live.
 *   - `modal-fault`    as blocking, but strictly above it — an error must be
 *                  readable mid-question.
 */
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

export type PanelFamily =
  | 'companion'
  | 'dialog'
  | 'modal-normal'
  | 'modal-blocking'
  | 'modal-fault'

/** What each family claims, in one place. Everything here USED to be a prop
 *  each caller passed, which is how the claims and the code drifted apart. */
const FAMILY: Record<
  PanelFamily,
  {
    /** Dims the page — and "dim" means everything below is INERT. */
    scrim: null | 'light' | 'dark'
    /** How far apart the panel's parts sit, unless the panel says otherwise.
     *  The two patient families hold answers you read or search; a modal holds a
     *  form you fill in. A panel whose content argues the other way overrides it
     *  — the help guides are companions and pass `loose`, being pages to read. */
    density: PanelDensity
    /** Immovability IS the signal: if you can drag it you can leave it for
     *  later; if you cannot, you deal with it now. */
    draggable: boolean
    /** The trap FOLLOWS THE SCRIM. A backdrop already blocks the pointer, so a
     *  modal that did not trap would hand a keyboard user Tab access to
     *  controls they cannot click. Trapping restricts nothing that was usable. */
    trapsFocus: boolean
    /** `'close'` — Escape dismisses it. `'swallow'` — Escape is consumed and
     *  NOTHING closes, not even the panel below (closing a fault by accident is
     *  a real problem, and closing the thing under it would be worse). */
    escape: 'close' | 'swallow'
    /** Whether this family opens WHERE YOU LEFT IT. Movable-and-remembers is
     *  the rule for the two patient families; a modal is a fresh task each
     *  time, so it centers even though you can move it (Joel, 2026-08-24). */
    remembersRect: boolean
    /**
     * A WINDOW or a CARD — the second split, and it follows from the first.
     *
     * **The titlebar IS the drag handle** (`dragHandleClassName` names the
     * header and nothing else carries the class), so a family that can never be
     * dragged has no use for one: its only remaining job is a title the body
     * shows better and bigger, and its ✕ is a third way out duplicating a button
     * already on screen. `FaultModal` used to print "Error" in both places,
     * four lines apart, and nobody noticed — a titlebar reads as chrome rather
     * than as content.
     *
     * `'window'` — titlebar with a ✕, and a full-page sheet on a phone.
     * `'card'` — no titlebar; the title is a heading the leaf renders; stays a
     * card at every size, so the thing the question is ABOUT is still visible
     * behind it.
     */
    shape: 'window' | 'card'
    /**
     * The family's layer, written out in full.
     *
     * **Not interpolated** (`var(--z-${family})`), which is what this looked
     * like first. That version made the dead-token guard blind to the whole
     * ladder: a dynamically-built `var()` name is captured as its prefix and
     * vouches for every token extending it, so `--z-board` and `--z-ghost` —
     * which nothing reads until the boards convert — would have read as alive
     * forever. Spelling each one out keeps every reference exact.
     *
     * It is still not a table of TIERS in TypeScript, which is the thing §20
     * bans: the code carries the NAME, `base.css` carries every VALUE, and
     * those cannot drift apart.
     */
    layer: string
  }
> = {
  companion:        { density: 'tight', scrim: null,    draggable: true,  trapsFocus: false, escape: 'close',   remembersRect: true,  shape: 'window', layer: 'var(--z-companion)' },
  dialog:           { density: 'tight', scrim: null,    draggable: true,  trapsFocus: false, escape: 'close',   remembersRect: true,  shape: 'window', layer: 'var(--z-dialog)' },
  'modal-normal':   { density: 'loose', scrim: 'light', draggable: true,  trapsFocus: true,  escape: 'close',   remembersRect: false, shape: 'window', layer: 'var(--z-modal-normal)' },
  'modal-blocking': { density: 'loose', scrim: 'dark',  draggable: false, trapsFocus: true,  escape: 'close',   remembersRect: false, shape: 'card',   layer: 'var(--z-modal-blocking)' },
  'modal-fault':    { density: 'loose', scrim: 'dark',  draggable: false, trapsFocus: true,  escape: 'swallow', remembersRect: false, shape: 'card',   layer: 'var(--z-modal-fault)' },
}

export type FloatingPanelProps = {
  /** What KIND of panel this is — see `PanelFamily`. Required: there is no
   *  sensible default, and a silent one is how the app ended up with a
   *  modal-normal that never dimmed. */
  family: PanelFamily
  /** Override the family's default spacing between the panel's parts. The help
   *  guides are the case: companions by family, but pages to read, so they ask
   *  for `loose`. */
  density?: PanelDensity
  /** Titlebar label, for the WINDOW families — it doubles as the drag handle.
   *  A CARD family has no titlebar, so it renders its own heading in the body
   *  and passes nothing here. */
  title?: string
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
  /** When true, the panel can be resized by its corners/edges.
   *  Default true. Modals with natural dimensions (Setup, Hint)
   *  opt out. */
  resizable?: boolean
  /** The narrowest this panel may be. Also floors the viewport clamp, so it is
   *  the one dimension that still bites a panel nobody can resize — nothing
   *  fits-to-WIDTH, so a width floor overrules nothing. */
  minWidth?: number
  /**
   * **"You can't drag this shut."** Meaningful only alongside `resizable`, and
   * **0 by default**.
   *
   * It used to default to 200 and floor the viewport clamp for EVERY panel,
   * including the ones whose whole height is their content — which is how a
   * confirmation ended up 81px taller than what was in it, a band of empty
   * white under the buttons. A floating panel holding one line of text should
   * be one line tall (Joel, 2026-08-25); a floor there is the shell overruling
   * the content for nobody's benefit, since no one can shrink it anyway.
   *
   * **Where it IS legitimate, the number comes from the BODY.** A `min-height`
   * on chat's message list in CSS cannot stop the drag — the list keeps its
   * height and the body scrolls, so you get a stubby panel with a scrollbar
   * instead of a floor. react-rnd only stops for a number. So the mechanism is
   * panel-level and the justification is not: "the titlebar, the composer and
   * four messages", not "300 felt about right".
   */
  minHeight?: number
  /** localStorage key under which to persist position + size. The FAMILY says
   *  whether a panel opens where you left it; this says under what key, because
   *  that is per-instance (the scratchpad's is per-game). Required by the two
   *  families that remember, ignored by the three that don't.
   *
   *  Restoring is safe on a smaller screen than the one it was saved on: the
   *  rect is hard-clamped into the current viewport on mount, and the STORED
   *  value is deliberately left alone so reconnecting the big monitor puts the
   *  panel back where you left it there. */
  persistKey?: string
  /** When true, the panel GROWS on open to fit its natural content
   *  height (capped to the viewport, past which the body scrolls),
   *  instead of staying at `defaultSize.height`. `defaultSize.height`
   *  becomes just the first-paint seed. For content-sized modals
   *  whose height varies with what's inside — the Setup dialog, where
   *  a game with many options must open tall enough to show them all.
   *  Safe alongside `persistKey` when the panel is NOT resizable: a stored
   *  height only fights the fit if the user chose it, and nobody can choose a
   *  height they cannot drag. */
  fitContent?: boolean
  /**
   * Stacking tier, as a token string.
   *
   * **Defaults to the FAMILY'S OWN LAYER** — `var(--z-companion)`,
   * `var(--z-dialog)`, `var(--z-modal-normal)`, and so on — which is §20's rule
   * that *a layer is where its family lives unless a component states
   * otherwise*. There is no table of tiers in TypeScript: the code carries the
   * family NAME and `base.css` carries every value, so the two cannot drift.
   *
   * **Two components state otherwise**, both for the same reason and both with
   * the reason written where someone might undo it: `Chat` passes
   * `var(--z-chat)` (a conversation must stay reachable over every dim below
   * it, and it can open ITSELF), and `GameHelpCompanion` passes `var(--z-help)` (the
   * rules are summoned FROM things, including the setup modal, and must never
   * open behind the form you pressed "?" in).
   *
   * A STRING, not a number, because the ladder's one home is CSS: a numeric
   * default here would be a second copy of the order, free to disagree with the
   * tokens. The scrim's `- 1` survives as `calc()`.
   * `guards/vocabularies.test.ts` fails on a numeric literal passed to this
   * prop. */
  zIndex?: string
  /**
   * Rank at the FAMILY's layer for Escape, rather than at the tier this panel
   * actually paints on.
   *
   * **Chat is the only caller and the only reason this exists.** It paints
   * above every modal — a conversation has to stay reachable over every dim
   * below it — but if it also RANKED there, Escape with a setup dialog open
   * would close the chat you have kept open all game instead of the form you
   * just opened. So it paints high and ranks low (Joel, 2026-08-24).
   *
   * Nothing else should reach for this. Help paints above the setup modal AND
   * ranks above it, which is correct and needs no prop: Escape closes the
   * rules, leaving the form you opened them for.
   */
  escapeRank?: 'family'
  
  /**
   * Force a CARD family to take the full-page phone sheet anyway, for one whose
   * content outgrows a card.
   *
   * **Expected to have no callers**, and that is measured rather than hoped:
   * `fitContent` caps at the viewport and lets the body scroll, so a card
   * degrades into a sheet by itself exactly when the content earns one — a
   * 30×-repeated fault message grew to 647px at a phone's height without
   * overflowing. The one unknown is scrabble's `ScrabbleBlankPickerBlockingModal` (26 letter buttons
   * at ~390px), still hand-rolled. **If that converts cleanly, delete this
   * prop** rather than keep it as decoration.
   */
  phone?: 'sheet'
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
 * Shared shell for every FLOATING PANEL — the window-like things that float
 * over the page: chat, the scratchpad, Help, the word dialogs, setup, and the
 * three modals. One header pattern, one drag implementation (react-rnd), one
 * Escape behavior, one scrim, one z-index axis.
 *
 * **A panel declares its FAMILY and the shell enforces what follows** — the
 * scrim and its shade, whether it can be dragged, whether focus is trapped,
 * what Escape does, and whether it opens where you left it. Those were five
 * separate props once, which meant five chances for a panel to claim one thing
 * and do another; they all now come from one word. See `PanelFamily`.
 *
 * Three questions remain genuinely independent, and stay props:
 *
 *   - **who knows the SIZE** — `resizable` / `fitContent`. Orthogonal to
 *     family: chat (the user knows) and Help (the content knows) are both
 *     companions.
 *   - **under what KEY a remembered rect is stored** — `persistKey`.
 *   - **the geometry seeds** — `defaultSize`, `minWidth`/`minHeight`.
 *
 * Why a single shell rather than separate Modal + FloatingPanel components:
 * every panel is a floating panel under the hood, and forking the shell would
 * read as "Modal vs not" — a split the family word already makes, better.
 *
 * Drag handle: when draggable, the header bar carries the
 * `dragHandle` class and react-rnd binds drag events there. The
 * panel body and close button are NOT drag handles — clicking the
 * X reliably closes; selecting text in the body reliably selects.
 *
 * Stacking: z-index is the only mechanism, every tier is a token from
 * base.css's ladder, and the FAMILY picks it. The scrim, when present, paints
 * one below at `calc(… - 1)`.
 */
export function FloatingPanel({
  family,
  title,
  phone,
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
  // rect, just pinned in place. See docs/mobile.md → "Panels on touch".
  const coarse = useCoarsePointer()
  const effectiveDraggable = claims.draggable && !coarse
  const effectiveResizable = resizable && !coarse
  // A viewport change RE-CENTERS this panel unless it remembers where you put
  // it. See `useReclampOnResize` for why a modal-normal is in the set despite
  // being draggable, and why the second clause matters on a touch device.
  const recenterOnResize = !claims.remembersRect || !effectiveDraggable

  // Escape: what you're IN, else what's on TOP. One listener for the whole app
  // rather than one per panel — see `usePanelEscape`. The id is how the handler
  // maps focus back to a registered panel; it is stamped on the shell as
  // `data-floating-panel`, which the game key-capture hooks already look for.
  const panelId = useId()
  usePanelEscape(
    panelId,
    escapeRank === 'family' ? claims.layer : tier,
    claims.escape,
    onClose,
  )

  // The TITLEBAR acts as the drag handle when draggable. react-rnd identifies it
  // by class name; the `.titlebar` / `.dragHandle` split is just so the bar can
  // show a `cursor: move` affordance when draggable and not when not.

  return (
    <>
      {claims.scrim && (
        <div
          className={claims.scrim === 'dark' ? styles.scrimDark : styles.scrimLight}
          style={{ zIndex: `calc(${tier} - 1)` }}
          aria-hidden="true"
          // No onClick — backdrop click is intentionally a no-op
          // (see Props.backdrop docstring). preventDefault on mousedown so the
          // click doesn't BLUR the panel's focused control to <body>: otherwise
          // a focus-trapped modal (e.g. an End/suspend confirm) leaks subsequent
          // keystrokes to whatever window listener sits behind it (the crossword
          // grid). Non-backdrop panels (the scratchpad) are unaffected.
          onMouseDown={(e) => e.preventDefault()}
        />
      )}
      <FloatingPanelBody
        recenterOnResize={recenterOnResize}
        panelId={panelId}
        trapsFocus={claims.trapsFocus}
        // A card stays a card on a phone unless it says otherwise; a window is
        // always the sheet.
        shape={claims.shape}
        phoneSheet={claims.shape === 'window' || phone === 'sheet'}
        title={title}
        onClose={onClose}
        defaultPosition={defaultPosition}
        defaultSize={defaultSize}
        draggable={effectiveDraggable}
        resizable={effectiveResizable}
        minWidth={minWidth}
        minHeight={minHeight}
        persistKey={claims.remembersRect ? persistKey : undefined}
        zIndex={tier}
        fitContent={fitContent}
        density={resolvedDensity}
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
  recenterOnResize,
  panelId,
  trapsFocus,
  shape,
  phoneSheet,
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
  density,
  reserveKeyboard,
  children,
}: {
  recenterOnResize: boolean
  panelId: string
  trapsFocus: boolean
  shape: 'window' | 'card'
  phoneSheet: boolean
  title: string | undefined
  onClose: () => void
  defaultPosition: { x: number; y: number } | 'center'
  defaultSize: { width: number; height: number }
  draggable: boolean
  resizable: boolean
  minWidth: number
  minHeight: number
  persistKey: string | undefined
  zIndex: string
  fitContent: boolean
  density: PanelDensity | undefined
  reserveKeyboard: boolean
  children: ReactNode
}) {
  if (persistKey) {
    // `fitContent` IS forwarded here, and the old comment said it could not be:
    // "a persisted panel restores a saved height, which would fight the fit".
    // That is true only when the user CHOSE the height — i.e. only when the
    // panel is resizable. Measured 2026-08-25: every panel that persists AND
    // resizes is a companion, and none of them asks to fit; the three that
    // persist and DON'T resize are the word dialogs, where the stored height was
    // never anyone's choice and the fit simply wins.
    return (
      <PersistedPanel
        recenterOnResize={recenterOnResize}
        panelId={panelId}
        trapsFocus={trapsFocus}
        shape={shape}
        phoneSheet={phoneSheet}
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
        fitContent={fitContent}
        density={density}
        reserveKeyboard={reserveKeyboard}
      >
        {children}
      </PersistedPanel>
    )
  }
  return (
    <EphemeralPanel
      recenterOnResize={recenterOnResize}
      panelId={panelId}
      trapsFocus={trapsFocus}
      shape={shape}
      phoneSheet={phoneSheet}
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
      density={density}
      reserveKeyboard={reserveKeyboard}
    >
      {children}
    </EphemeralPanel>
  )
}

// Variant with persistence — uses the shared useDraggablePanel
// hook to restore + save the rect.
function PersistedPanel({
  recenterOnResize,
  panelId,
  trapsFocus,
  shape,
  phoneSheet,
  fitContent,
  density,
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
  recenterOnResize: boolean
  panelId: string
  trapsFocus: boolean
  shape: 'window' | 'card'
  phoneSheet: boolean
  title: string | undefined
  onClose: () => void
  defaultPosition: { x: number; y: number } | 'center'
  defaultSize: { width: number; height: number }
  draggable: boolean
  resizable: boolean
  minWidth: number
  minHeight: number
  persistKey: string
  zIndex: string
  fitContent: boolean
  density: PanelDensity | undefined
  reserveKeyboard: boolean
  children: ReactNode
}) {
  const seed = resolveDefaultRect(defaultPosition, defaultSize)
  const { rect, setRect } = useDraggablePanel({
    persistKey,
    defaultRect: seed,
    minWidth,
    minHeight,
    recenterOnResize,
  })
  return (
    <PanelRnd
      panelId={panelId}
      trapsFocus={trapsFocus}
      shape={shape}
      phoneSheet={phoneSheet}
      title={title}
      onClose={onClose}
      rect={rect}
      setRect={setRect}
      draggable={draggable}
      resizable={resizable}
      fitContent={fitContent}
      density={density}
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
  recenterOnResize,
  panelId,
  trapsFocus,
  shape,
  phoneSheet,
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
  density,
  reserveKeyboard,
  children,
}: {
  recenterOnResize: boolean
  panelId: string
  trapsFocus: boolean
  shape: 'window' | 'card'
  phoneSheet: boolean
  title: string | undefined
  onClose: () => void
  defaultPosition: { x: number; y: number } | 'center'
  defaultSize: { width: number; height: number }
  draggable: boolean
  resizable: boolean
  minWidth: number
  minHeight: number
  zIndex: string
  fitContent: boolean
  density: PanelDensity | undefined
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
      VIEWPORT_EDGE_MARGIN,
      'hard',
    ),
  )
  const setRect = (next: PanelRect) =>
    setRectState(clampToViewport(next, minWidth, minHeight, VIEWPORT_EDGE_MARGIN, 'soft'))
  // Stay reachable when the viewport changes under it. This panel remembers
  // nothing, so there is nothing to write — but "it clamped once on mount" is
  // not the same as "it is on screen", and a modal dragged toward an edge before
  // the window shrank used to be unrecoverable (F26).
  useReclampOnResize(
    rect,
    minWidth,
    minHeight,
    VIEWPORT_EDGE_MARGIN,
    recenterOnResize,
    setRectState,
  )
  return (
    <PanelRnd
      panelId={panelId}
      trapsFocus={trapsFocus}
      shape={shape}
      phoneSheet={phoneSheet}
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
      density={density}
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
  panelId,
  trapsFocus,
  shape,
  phoneSheet,
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
  trapsFocus: boolean
  shape: 'window' | 'card'
  phoneSheet: boolean
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

  // Cycle Tab within the panel, for the families whose scrim claims the page
  // below is inert. The hook walks up to the enclosing `[data-floating-panel]`,
  // which is the shell below — so the trap includes the titlebar's ✕ as well as
  // the body's own controls. Inert for the families that don't trap.
  const shellRef = useRef<HTMLDivElement>(null)
  useFocusTrap(trapsFocus ? shellRef : NO_TRAP)
  // (No "has the user moved it?" flag: the fit anchors the panel's top wherever
  // it currently is, so a dragged panel keeps its position for free.)
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
      // Capped to the viewport with the shared gutter top AND bottom — the
      // literal here used to be 16, twice the clamp's 8, with nothing saying so.
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
      data-phone={phoneSheet ? 'sheet' : 'card'}
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
            and Tab moves between its controls instead of being swallowed.
            Its VALUE is the panel's id, which is how `usePanelEscape` maps focus
            back to a registered panel; the selector is unaffected, since
            `[data-floating-panel]` matches with or without a value. */}
        <div
          className={styles.shell}
          data-floating-panel={panelId}
          // WINDOW or CARD — the module reads it for the body padding, since a
          // card's content starts at the top edge with no titlebar above it.
          data-shape={shape}
          ref={shellRef}
        >
          {/* No titlebar for a CARD family. The header IS the drag handle, so a
              panel that can never be dragged has no use for one — its title is a
              heading the leaf renders in the body, and its ✕ would be a third
              way out duplicating a button already on screen. */}
          {title !== undefined && (
            <div
              className={`${styles.titlebar} ${draggable ? styles.dragHandle : ''}`}
            >
              <span className={styles.title}>{title}</span>
              <CloseButton className={styles.close} onClick={onClose} />
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
 * The ONE key every help panel persists its rect under — the game guides and
 * the club's "About clubs" alike (Joel, 2026-08-24: *"help dialogs can share a
 * key; that's fine. They should remember the location."*).
 *
 * Shared rather than per-surface because help is one habit, not sixteen: park
 * it where you like reading it and every guide opens there. The cost is that
 * the remembered rect carries a SIZE too, so after the first drag a game's own
 * `defaultSize` stops applying — those seeds only ever fire on a fresh browser.
 */
export const HELP_RECT_KEY = 'puzpuzpuz:help:rect'

/** A ref that never points at anything, so `useFocusTrap` finds no panel and
 *  installs nothing — the hook stays unconditionally called (rules of hooks)
 *  while the trap itself is conditional. */
const NO_TRAP = { current: null }

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
