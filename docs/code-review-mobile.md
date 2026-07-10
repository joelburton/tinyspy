# Code review — the mobile FE pass

A review of the mobile-appearance work recorded in [mobile.md](mobile.md), done
2026-07-10 against `main` @ `58e1cfb`. Method: read the shared implementation
(breakpoints, hooks, InfoSheet recipe, FloatingPanel, chrome components) by
hand; swept all eleven games for recipe composition, leftover raw media
queries, iOS input traps, and viewport-unit drift; cross-checked every "done"
claim in mobile.md against the code and the e2e suite.

## Verdict

The approach is genuinely strong — better-considered than most production
mobile passes. The 2-D device model (width × orientation × pointer) instead of
a width ladder, the input taxonomy driving per-game scoping, and the
copy-three-times-then-extract discipline for the info-sheet recipe are all the
right calls, and the implementation matches the documented design almost
everywhere. The sweeps came back remarkably clean: **zero** raw width media
queries outside `breakpoints.css`, **zero** `100vh` remnants in CSS, uniform
recipe composition across all eight converted games, and the `wide` sheet
variant used exactly where the doc says and nowhere else.

There is one significant gap between what mobile.md asserts and what the code
does (the phone hard-block, finding 1), a couple of doc-rot spots, and a tail
of small hardening items. Nothing found undermines the architecture.

## What the approach gets right

Recording these explicitly, since they're the decisions worth repeating in any
future pass:

- **Desktop-first as an enforced invariant, not an aspiration.** Every mobile
  rule in the app is a `@media (--mobile/--phone/--touch)` override layered on
  desktop defaults; there are no `min-width` mobile-first rewrites anywhere.
  Verified by grep: the only `@media` width/orientation/pointer conditions in
  `src/` outside [breakpoints.css](../src/common/breakpoints.css) go through
  the custom-media names — the migration left no stragglers.
- **`@custom-media` + `postcss-global-data` is the right mechanism** for
  "breakpoints defined once." It solves both CSS facts the doc names (no
  `var()` in media conditions; compound conditions) with ~10 lines of config,
  and the definitions file is unusually well-commented. The JS mirrors
  ([useIsMobile](../src/common/hooks/ui/useIsMobile.ts),
  [usePhone](../src/common/hooks/ui/usePhone.ts),
  [useCoarsePointer](../src/common/hooks/ui/useCoarsePointer.ts)) match the
  CSS definitions exactly today (checked character-for-character against
  `breakpoints.css`).
- **Pointer as its own axis.** Gating panel drag/resize on `(pointer: coarse)`
  rather than width is correct, and the fact that one hook flip also fixed the
  X-won't-close-on-touch bug (react-draggable eating the synthesized click) is
  the payoff of modeling the axes separately.
- **The rule-of-three extraction was actually run as designed.** psychicnum /
  wordle / codenamesduet were converted copy-paste, divergences were logged,
  and only then did [useInfoSheet](../src/common/hooks/game/useInfoSheet.ts) +
  [InfoSheet](../src/common/components/game/InfoSheet.tsx) + `shared.mobileFill`
  get extracted — and the audit shows all eight games now compose exactly those
  three pieces with **no leftover copy-pasted sheet CSS** and no per-game
  `useIsMobile` calls. What stayed per-game is genuinely per-game (wordle's
  leftover-height board cap, connections' tile-font floor, psychicnum's entry
  size) and lives in that game's board module, as designed.
- **Measured visual viewport over guessed keyboard height** for the chat sheet
  ([useVisualViewport](../src/common/hooks/ui/useVisualViewport.ts) +
  `reserveKeyboard`) is the correct engineering choice, and the doc recording
  the failed static-reserve attempt is exactly the kind of "why" this codebase
  wants.
- **Real-browser e2e guards** for layout claims (per the repo's
  verify-layout-headless rule): six `*-mobile.e2e.ts` files plus
  `panels-touch.e2e.ts` exist and assert the right things (no-scroll at phone
  sizes, sheet open/close, keyboard clamp via a mocked visual viewport, tap —
  not click — on the X).
- The **16px iOS focus-zoom floor** is defended in depth: a global
  `@media (--touch) { input, textarea { font-size: max(16px, 1em) } }` in
  [theme.css](../src/common/theme.css) catches element-styled fields, and the
  three class-styled fields that would out-specificity it (chat input,
  scratchpad textarea, word-lookup input) each carry their own `--touch` pin.
  The sweep found no remaining sub-16px offender (`SelectField` uses
  `font: inherit` → 16px in its setup-dialog contexts).

## Findings

Ordered most-severe first. 1 is the only one I'd act on before the next
feature; 2–4 are cheap; the rest are judgment calls recorded so they're not
lost.

### 1. The phone hard-block is documented as existing, but is not implemented

[mobile.md → Where each game plays](mobile.md#where-each-game-plays-by-input-on-touch)
states, in the present tense: *"On a phone, the real-keyboard-required +
desktop-only games are HARD-BLOCKED (a 'play this on desktop / with a
keyboard' screen)... block scrabble + crossplay on phone widths... block
bananagrams on all touch."* The closing section repeats it: *"they're
hard-blocked on phone widths, allowed on tablets."*

**No such gate exists.** Neither the three games' components, nor
`GamePage`, nor the manifests/registry, nor any route contains a device check,
a block screen, or even a warning (searched for every plausible spelling; the
only hits are comments and crosswords' Help text "Keyboard required — there's
no on-screen keyboard"). A friend opening scrabble or bananagrams on a phone
today gets the unmodified desktop two-column layout at 390px — overflow,
page-scroll, the works — which is precisely the "limp through a broken
experience" the doc says we don't allow.

Two honest resolutions: build the block (a small `usePhone()` /
`useCoarsePointer()` gate at the GamePage or manifest level, per-game flagged —
likely < 50 lines total), or reword mobile.md to file it under a TODO/decision
rather than an accomplished fact. Given the doc's own severity ("we don't let
people limp through"), building it seems right, but that's Joel's call.

### 2. mobile.md doc-rot — two "verified/remaining" claims no longer match

- *"Verified end-to-end via a touch-only e2e (`.tap()`, no keystroke):
  psychicnum tap-tile → Submit locks the tile"* — **no e2e taps a psychicnum
  tile.** The only `.tap()` callers are `connections-mobile`,
  `spellingbee-flash`, `waffle-mobile`, and `panels-touch`. Either the test was
  never committed or it was later folded away; either way the claim is stale.
- *"other sub-16px inputs across the app still have it (a future sweep)"* —
  the sweep has effectively happened: the global `--touch` floor in theme.css
  plus the three class-level pins cover everything found (see the strengths
  list). This line should be updated to say the floor is now global.

### 3. psychicnum — the reference implementation — has no mobile e2e

Every other converted game is guarded (`wordle-mobile`, `codenamesduet-mobile`,
`stackdown-mobile`, `spellingbee-mobile`, `waffle-mobile`,
`connections-mobile`, boggle's inside `boggle.e2e.ts`), but the game the
recipe is named after has none: no no-scroll-at-phone-width assertion, no
sheet-open/close, no tap-to-guess. A regression in the shared recipe pieces
would most naturally be caught in the baseline game; today it would be caught
only indirectly, through the other games' tests. Cheap to add by cloning
`stackdown-mobile.e2e.ts` (also the plain-recipe shape).

### 4. `env(safe-area-inset-*)` is inert without `viewport-fit=cover`

[FloatingPanel.module.css](../src/common/components/panels/FloatingPanel.module.css)
insets the phone sheet by `env(safe-area-inset-*)` "so the header clears a
notch / status bar in standalone PWA mode" — but
[index.html](../index.html)'s viewport meta is
`width=device-width, initial-scale=1.0` with **no `viewport-fit=cover`**, and
the status-bar style is `default`. Under those settings iOS keeps content out
of the unsafe areas itself and the `env()` values resolve to 0, so the insets
never engage — the code is harmless (0 = edge-to-edge, as the fallback comment
says) but the claimed notch protection doesn't actually exist yet. If
standalone-PWA polish matters (the doc leans that way), this needs
`viewport-fit=cover` added to the meta and then an on-device check that
nothing else regresses (with `cover`, *every* full-bleed surface becomes
responsible for its own safe-area padding, not just this one).

### 5. InfoSheet: the closed sheet stays in the tab order, and has no dialog semantics

On mobile the closed sheet is `translateX(100%)` — visually gone but still
rendered, still focusable. A keyboard user (a tablet with a keyboard is an
explicitly supported class) can Tab into the off-canvas info column and focus
invisible controls. `visibility: hidden` on the non-`.open` mobile state (or
the `inert` attribute when closed) fixes it in one rule; `visibility`
transitions cleanly alongside `transform`.

Related, lower-stakes: the open sheet isn't a `role="dialog"`, can't be
dismissed by Escape or by tapping outside (✕ only), and focus isn't moved into
it on open. For a friends-only alpha on touch-first screens these are
defensible cuts — recording them so the cut is a decision, not an oversight.

### 6. `--phone`'s landscape arm catches short *desktop* windows

`--phone-l` is `(orientation: landscape) and (max-height: 27.5rem)` with no
pointer condition, and it's OR'd into `--phone`. A desktop browser window
shorter than ~440px (docked half-screen, dragged small) therefore gets the
phone treatment: page padding drops to 0.25rem and — the odd one — every
FloatingPanel becomes a full-screen sheet via the `!important` geometry
override, while remaining draggable/resizable in JS (the JS gate is
`pointer: coarse`, which a desktop mouse doesn't match). Dragging then updates
react-rnd's inline transform that the CSS immediately overrides — nothing
moves, cursors lie. Rare, harmless-ish, but it's a CSS/JS *disagreement about
what a phone is*: the CSS sheet keys off `--phone` (shape) while the drag
disable keys off `--touch` (pointer). Cheapest fix if it ever annoys: add
`(pointer: coarse)` to the `--phone-l` arm (in breakpoints.css **and**
usePhone — the hand-sync pair). Recording rather than recommending, since a
real device matching phone-l-without-touch doesn't exist; only weird desktop
windows do.

### 7. Tap-press feedback is inconsistent across the tap games

spellingbee and boggle got the full touch treatment —
`-webkit-tap-highlight-color: transparent` plus a designed press response (hex
flash / `.selected` ring + press-scale). The other six converted tap games
(psychicnum, connections, waffle, wordle, stackdown, codenamesduet) suppress
nothing and add nothing, so a tap there shows the browser's default grey
rectangle flash. For spellingbee the suppression was *forced* (the grey box
outlined the hex's square bounds), so this isn't automatically drift — but "my
tap flashed grey here and white there" is exactly the cross-game cosmetic
inconsistency the repo's UI-consistency goal targets. Worth a deliberate
decision: either the default highlight is fine for rectangular tiles (then
record that), or the shared `.tile` in
[PlayArea.module.css](../src/common/components/game/PlayArea.module.css)
should own one canonical press treatment.

### 8. No `touch-action: manipulation` on tap-heavy surfaces

Rapid repeated taps on the same spot — boggle path-tracing, wordle's on-screen
keyboard, spellingbee's hive — are exactly the gesture iOS Safari interprets
as double-tap-to-zoom, and nothing opts the boards out (`touch-action` appears
only in scrabble/bananagrams drag surfaces, as `none`). Modern Safari
suppresses *some* of this on `width=device-width` pages, but double-tap zoom
on zoomable pages still fires. One `touch-action: manipulation` on the shared
`.tile` (and wordle's key buttons) removes the risk and the residual tap
delay. Needs an on-device check to confirm it's a live problem — e2e touch
synthesis can't reproduce iOS gesture heuristics.

### 9. Three hand-rolled copies of the matchMedia hook

`useIsMobile`, `usePhone`, and `useCoarsePointer` are the same
~35-line `useSyncExternalStore` wrapper differing only in the query string
(and `useVisualViewport` is a cousin). A private
`makeMediaQueryHook(query)` (or a shared `useMediaQuery(query)` the three
one-liner exports call) would collapse the triplicated
subscribe/getSnapshot/jsdom-guard boilerplate and leave exactly one place to
get the pattern right. The per-hook docstrings — which are good and should
survive — can sit on the exported one-liners. Not urgent; it becomes urgent
the day a fourth query is added by copy-paste and someone edits three of the
four guards.

### 10. Small consistencies worth a line each

- **crosswords mixes `dvh` and `svh`:**
  [Grid.tsx:86](../src/crosswords/components/Grid.tsx) sizes cells with
  `100dvh` while the same game's
  [PlayArea.module.css:14](../src/crosswords/components/PlayArea.module.css)
  uses `100svh`. mobile.md says the units should "flip together." Keyboard-
  required/tablet-plus scope makes the visible difference small (the units
  diverge only while a mobile toolbar retracts), but one game shouldn't
  disagree with itself — pick `svh` to match the app.
- **`useInfoSheet` doesn't reset `isOpen` on a breakpoint crossing:** open the
  sheet on mobile, widen to desktop (CSS ignores the state), narrow again —
  the sheet is unexpectedly open. One `isMobile`-keyed reset (or deriving
  `isOpen && isMobile`) closes the loophole. Pure nit; needs a live resize
  across 900px to ever see it.
- **ClubPage's mobile tabs are half an ARIA tabs pattern:** `role="tablist"` /
  `role="tab"` / `aria-selected` without `aria-controls`, `tabpanel` roles, or
  arrow-key navigation. Either finish the pattern or drop to plain buttons
  with `aria-pressed`; the current markup promises keyboard behavior it
  doesn't have. Touch-first context makes this low-stakes.

## Checked and found clean

For completeness — things specifically hunted for that came back with nothing:

- **Breakpoint migration completeness:** no raw `max-width`/`min-width`/
  `orientation`/`pointer` media queries anywhere in `src/` outside
  `breakpoints.css`; the one remaining `56.25rem` literal outside the
  canonical pair is a comment in PlayersStrip.module.css.
- **JS/CSS breakpoint sync:** all three hook queries match `breakpoints.css`
  exactly today.
- **Recipe uniformity:** all eight converted games compose
  `useInfoSheet()` + `menuSections` spread + `shared.mobileFill` +
  `<InfoSheet>`; `wide` on exactly spellingbee + boggle; no game kept private
  sheet CSS or its own `useIsMobile`.
- **`vh` remnants:** none in CSS (the only `100vh` strings are explanatory
  comments); JS `window.innerHeight` uses are layout-viewport math where
  that's the correct viewport (panel centering, popover positioning).
- **Shared-chrome fixed widths:** menu sheet, toasts, celebration dialog,
  panels all cap against the viewport; nothing in `common/` can force a
  320px screen wider.
- **Actor-mention adoption:** the widgets are used by all eight converted
  games (plus scrabble's turn log), matching the doc's migration claim.
- **ClubPage tab switching keeps both columns mounted** (only `display: none`
  on the inactive one) — no state loss on tab flips, and the never-scroll
  frame is preserved.

## Not re-reviewed

The TODOs mobile.md already records (handle/club-name length caps, the
feedback-copy length audit, the crosswords phone treatment) are real and
correctly filed there; this review deliberately doesn't re-litigate them.
On-device feel questions the doc itself defers (codenamesduet's
scroll-when-keyboard, transient-keyboard comfort in phone-l) remain on-device
checks — nothing in code contradicts the recorded expectations.
