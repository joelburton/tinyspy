# Mobile

The record of the mobile-appearance pass — the high-level model (what plays
where, and the decisions shaping the work), what "mobile-ready" means here, the
shared breakpoint convention, what's been done so far, and what's deliberately
left for later.

This is the "real mobile pass" that [`ui.md → Audience and platform:
desktop-first`](ui.md#audience-and-platform-desktop-first) named as a future
project. It's now underway, one screen at a time. The desktop-first posture
still holds: **most players are on a laptop/desktop**, so the desktop layout
stays the default and mobile is expressed as an *exception* layered on top —
never mobile-first.

## Strategy

The evolving high-level model — *what plays where* and the decisions that shape
the pass. Being filled in as we talk it through; expect churn.

### Device classes

Think of it as a 2-D space (shape), not a 1-D ladder (width). Five reference
devices:

| class | example | character |
|---|---|---|
| **phone-p** | iPhone portrait | tightest of all — the case that needs the most work |
| **phone-l** | iPhone landscape | wide but **short**; good for tiles side-by-side, bad for anything needing vertical room (or a pop-up keyboard, which eats a short screen) |
| **tablet-p** | iPad portrait | roomy; ≈ a desktop with less width |
| **tablet-l** | iPad landscape | ≈ desktop |
| **desktop** | laptop / desktop | the default; everything targets this first |

Width alone can't separate **phone-l** (~844×390) from **tablet-p** (~768×1024):
similar widths, opposite shapes. So the media model is
**width × (height|orientation) × pointer**:

- **width** → column count / collapse-to-a-sheet (the 56.25rem line — see
  [The breakpoint](#the-breakpoint)).
- **`(pointer: coarse)` / `(hover: none)`** → a touch device → disable dragging,
  favor bigger tap targets. This is the right signal for *touch behaviors*, not
  width (a touch tablet is still touch).
- **`(max-height: ~480px)`** → a landscape phone → the "short" case, where
  vertical chrome crushes a tall board and a pop-up keyboard covers most of it.

### Naming the device classes (breakpoints)

We want the five classes defined **once, globally**, not re-typed ad hoc — most
games won't need per-class tweaks, but when one does, the condition should
already have a name. Two CSS facts shape how:

1. **Custom properties can't live in `@media`.** `@media (max-width: var(--bp))`
   is invalid — media conditions are evaluated before the cascade, so `var()`
   isn't available. "CSS vars for breakpoints" can't be literal vars.
2. **phone-p vs phone-l (and tablet-p vs -l) are *orientation*, not width** — the
   same device rotated. So each class is a **compound** condition (width +
   orientation/height), not a single threshold.

The tool that names a compound `@media` condition once and lets every CSS module
reference it is PostCSS **`@custom-media`**:

```css
/* one definitions file, referenced by every module */
@custom-media --touch    (pointer: coarse);              /* touch device (phone OR tablet) */
@custom-media --mobile   (max-width: 56.25rem);          /* the existing collapse line */
@custom-media --phone-p  (max-width: 34rem);             /* narrow portrait */
@custom-media --phone-l  (orientation: landscape) and (max-height: 27.5rem);
@custom-media --tablet-p (min-width: 34.0625rem) and (max-width: 56.25rem) and (orientation: portrait);
@custom-media --tablet-l (orientation: landscape) and (min-height: 27.5625rem) and (pointer: coarse);

@media (--phone-l) { … }   /* usage in any module */
```

`--touch` and `--mobile` do the heavy lifting (touch behaviors + layout
collapse); the four orientation classes are for the occasional per-mode tweak.
The thresholds above are a **starting proposal — tune against real devices.**

**Mechanism (wired up):** `postcss-custom-media` + `@csstools/postcss-global-data`,
configured in [`postcss.config.js`](../postcss.config.js) — global-data injects
the definitions from `src/common/breakpoints.css` into every file, custom-media
resolves them. Vite auto-loads the config. Definitions live once in
[`breakpoints.css`](../src/common/breakpoints.css); edit a value there and it
changes everywhere. **A running `vite dev` only picks up the postcss config on
restart** (it's a startup-time config, not HMR'd) — so after pulling this,
restart the dev server or the breakpoints won't resolve. The JS side keeps its
own copy of the `--mobile` line ([`useIsMobile`](../src/common/hooks/ui/useIsMobile.ts));
the two must be kept in sync by hand.

### Input is the primary axis

**What input a game needs on a touch device predicts playability better than
screen size does.** The keyboard kinds:

- **real-keyboard** — a physical keyboard.
- **virtual-keyboard** — the OS pop-up keyboard a phone raises when you type.
- **in-game-keyboard** — one we draw ourselves (wordle's letter grid).

…plus the two non-keyboard inputs that matter most:

- **tap** — touching tiles/buttons. The touch-native input; **always preferred**
  where a game's move can be expressed as taps.
- **drag** — moving a tile by dragging it. A **mouse** affordance; unpleasant on
  touch — on a phone *and* on a tablet. If a game's move fundamentally needs
  drag, that's the signal to make it **real-keyboard-required**, not to build a
  touch-drag interaction.

Principles that fall out:

- **Prefer tap.** Most games that "type" on desktop can express the same move as
  a tap (pick a tile), so on touch they need **no keyboard at all**. This
  collapses most of the roster into the easy bucket.
- **A transient native virtual keyboard is fine** when you don't need to watch
  the board *while* typing. codenames duet clue entry is the model: the
  clue-giver has already read the board, so the OS keyboard popping up for the
  clue word is acceptable — no reason to build an in-game keyboard there.
- **Never require drag on touch.** Dragging is a desktop/mouse interaction; a
  drag-only game becomes real-keyboard-required (or desktop-only) on mobile
  rather than growing a touch-drag path.

### Where each game plays (by input on touch)

- **Tap-only — no keyboard, strong on phones:** connections, waffle, wordle
  (its in-game keyboard *is* taps), psychicnum (tap a tile to guess), spellingbee
  (tap letters), boggle (tap adjacent tiles to trace a path, or type). *Verified
  end-to-end via a touch-only e2e (`.tap()`, no
  keystroke): psychicnum tap-tile → Submit locks the tile; spellingbee
  tap-letters → Submit accepts the word.*
- **Transient native keyboard, acceptable:** codenames duet / tinyspy (clue
  entry only).
- **Real-keyboard-required (desktop or a tablet *with* a keyboard):** crossplay
  (crossword grid); scrabble (tile placement is drag-or-type, and we won't build
  touch-drag or an in-game keyboard for it, so it needs a real keyboard).
- **Desktop-only:** bananagrams (drag-heavy + a large arena; unpleasant even on a
  tablet with a keyboard).

**bananagrams is HARD-BLOCKED on touch** (a "needs a desktop" screen — the shared
[`<DeviceBlockNotice>`](../src/common/components/game/DeviceBlockNotice.tsx)),
not soft-warned: we don't let people limp through a broken experience. It's
desktop-only (a drag-heavy 25×25 arena), so the gate keys off the *pointer* —
`useCoarsePointer()` in its PlayArea blocks *all* touch (phone + tablet), since
even a keyboard tablet has no mouse to drag with.

The two keyboard-required games — **scrabble + crossplay** — are **NOT**
blocked, and both now have mobile layouts (info sheet + board-fills-width): a
**layout for keyboard-attached devices, not a touch-entry mode**. A
keyboard-attached tablet plays them fine and the browser can't tell that apart
from a bare phone, so we'd rather leave them un-gated than lock out the tablet
case; a bare phone renders the layout but can't enter tiles/letters.

The **phone-l tension**: landscape helps fit tiles side-by-side
(psychicnum / connections / tinyspy — text in tiles needn't wrap) but a short
screen hurts anything that still raises a keyboard. connections (pure tap) is the
clean landscape win. We won't *prevent* portrait play of the landscape-friendly
ones; and we may *tell* users to hold the drag/board-hungry ones (scrabble)
portrait.

### Decisions / directions

1. **Panels on touch:** *(Done — see [What's been
   done](#panels-on-touch--full-screen-sheets--the-close-button-fix).)*
   non-draggable + non-resizable; **full-viewport on
   phones**, centered modal on tablets. Gate on `(pointer: coarse)`, not width.
   This is *also* the fix for the X-won't-close-on-touch bug — react-draggable
   `preventDefault()`s the touchstart on the header (the drag handle), which
   kills the synthesized `click`, so the close button's `onClick` never fires;
   remove the handle and the X just works. `FloatingPanel` already has the
   `draggable`/`resizable` props, so forcing them off on coarse pointers fixes
   chat, scratchpad, setup, and help in one place.
2. **Viewport height:** *(Done — `svh` chosen; see [What's been
   done](#viewport-height--svh-instead-of-vh).)*
   use `svh` (or `dvh`) instead of `vh` in the full-height
   calcs, so content fits the *visible* viewport with the mobile-Safari toolbar
   present (our never-scroll pages never let it retract, so `100vh` — the
   toolbar-hidden height — runs too tall and hides content). To actually
   *reclaim* the toolbar's space, an **"Add to Home Screen" / standalone PWA**
   (web-app-capable meta + a manifest `display: standalone`) gives the full
   viewport and a native feel — a strong fit for a returning-friends app.
3. **Phone sizing via tokens, not a root font-size shrink.** The things that read
   "too big" on a phone are display type we oversized for desktop drama (the
   tile-word clamp, psychicnum's 2rem entry, headings) — already tokens; dial
   them down under the breakpoint. Leave body text and tap targets alone (touch
   wants tap targets *bigger*). Mind the **iOS trap**: an `<input>` with a font
   under **16px** triggers focus-zoom on iOS, so shrink the *field*, not the
   input font, past that floor.
4. **The infoCol-as-a-separate-screen** (rough POC in psychicnum — a menu-opened
   sheet) is the pattern that makes most games tablet-ready with little extra
   CSS. **Phones need the most per-game tweaking; tablets mostly inherit.**

### Open questions

- Is **56.25rem** the right collapse line, or should tablets keep the desktop
  two-column layout (only phones collapse)? Current lean: one mobile treatment
  (the sheet for phone *and* tablet); revisit if a tablet reads cramped.
- Does the **transient native keyboard** actually feel fine in phone-p / phone-l
  for codenames duet? Worth a quick prototype — it's the one remaining
  keyboard-raising path.
## The rules of this pass

- **Desktop-first, always.** Mobile styles are `@media (max-width: …)` overrides
  on top of the desktop rules. We never rewrite a layout mobile-first with
  `min-width` overlays. A mobile change must not alter the desktop layout at all.
- **The invariant that must survive on a phone: [the page never
  scrolls](ui.md#page-height-fits-the-viewport).** Every screen fits the
  viewport; growth-prone regions scroll inside their own frames, not the
  document. The most common way a narrow screen breaks this is **horizontal**
  overflow — a wide row, a fixed two-column body, or a long unbreakable text
  token forcing the page wider than the viewport. Verify no-scroll headless at a
  phone width before declaring a screen done (see
  [testing](testing.md) — a Playwright render + a `scrollWidth <= innerWidth`
  assertion; a jsdom test can't catch layout width bugs).
- **Graceful, not pixel-perfect.** We make the screen usable and un-scrolled on a
  phone; we don't chase a bespoke mobile design for every component.

## The breakpoint

**`--mobile` (`56.25rem` / 900px) is the primary desktop→mobile line for the
whole app.** Below it: phones and portrait tablets (an iPad in portrait is
768–834px). At or above it: landscape tablets and desktops keep the full desktop
layout. This is the layout-collapse switch — two columns fold to one (+ the
info-column sheet) — and every component agrees on where it happens.

It's defined once as a custom-media in
[`breakpoints.css`](../src/common/breakpoints.css) and used as `@media (--mobile)`
everywhere — see [Naming the device classes](#naming-the-device-classes-breakpoints)
for the full set (`--phone`, `--touch`, the four orientation classes) and how the
PostCSS pipeline resolves them.

## What's been done

### Club page — tabs instead of two columns

[`ClubPage`](../src/common/components/club/ClubPage.tsx) is a two-column body on
desktop (left = active game + start-a-new-game; right = completed/shelved list).
On a phone the two columns are too cramped, so below the breakpoint the body
becomes a **single column with a tab switcher**: a "New game" tab (the left
column) and a "Completed/shelved (N)" tab (the right column). Only the selected
column renders, so the page still fits the viewport. The tab bar is
`display: none` on desktop, where both columns show side by side unchanged. State
lives in `mobileTab`; a `data-tab` attribute on the body drives the CSS that
hides the inactive column.

### Player strip — dots only on mobile

[`PlayersStrip`](../src/common/components/game/PlayersStrip.tsx) (the header's
"who's playing, what color is who" row, shared by the club page and every game
page) shows a colored dot + username per player. Usernames are variable-length
and can be long handles; on a narrow header they overflow and scroll the page.
Below the breakpoint the strip **drops to dots only** — the dot already carries
the whole signal (color = which player, filled/hollow = present/away), so the
name is the droppable half. Desktop still shows names.

### Actor mentions in feedback — drop the name to a dot on phones

The same "the dot IS the identity, the name is droppable" idea, extended to
**feedback**. A shared pair of widgets in
[`ActorMention.tsx`](../src/common/components/game/lists/ActorMention.tsx) —
`ActorTag` (name-then-dot, "moth ●") and `ActorDot` (dot-then-name, "● moth") —
render the name in a real `.name` span rather than baking it into the message
string. A `show` prop (`auto` / `both` / `name` / `dot` / `none`) controls it;
`auto` (the feedback default) hides the name under `@media (--phone)` via one
rule, so a long username can't overflow a tight header or below-board pill —
"● moth is writing a clue" becomes "● is writing a clue". Turn logs keep their
names (`TurnLogActor` → `show="both"`).

This required the feedback message's `text` to hold the **widget** instead of a
string — fine because `GenericFeedbackMsg.text` is already `ReactNode`; the pill
(and `useGlobalFeedback`) dedup on a separate string key, not the text.
**Migrated: every mobile game's peer/opponent feedback** — codenamesduet,
psychicnum, connections, waffle, wordle, spellingbee, boggle, stackdown. Two
deliberate exclusions: (1) **chat** feedback keeps its sender name — the chat
pill has no size constraint the game feedback areas have, and knowing *who*
messaged matters more there; (2) the keyboard-required games —
**scrabble** and **crossplay** (played on keyboard-attached devices, not bare
phones, even now that both have mobile layouts) and
**bananagrams** (blocked on touch, so its feedback never shows there) — skip the
migration: not worth the churn for games you don't play on a phone. Unit tests that asserted the pill
`text` as a string now render the node and read its text (`nodeText` helper).

### The `.card` shell pages — home / login / claim-username

The three shell screens ([`HomePage`](../src/common/components/home/HomePage.tsx),
[`LoginScreen`](../src/common/components/auth/LoginScreen.tsx),
[`ClaimHandleScreen`](../src/common/components/auth/ClaimHandleScreen.tsx)) all
render inside the global `.card` (in [`theme.css`](../src/common/theme.css)). Two
fixes made them phone-safe:

- **`overflow-wrap: anywhere` on `.card`.** Long *unbreakable* tokens — a long
  username in the "Welcome, …" heading, an email, a solo club's `=handle` — have
  no break opportunity, so they set the card's max-content width and push it past
  a narrow viewport. Allowing a break inside such tokens keeps the card within
  the screen. It only bites words that genuinely can't fit the line, so normal
  prose (and the whole desktop experience) is untouched. A 30-char username would
  have overflowed the desktop card too, so this is general robustness, not a
  mobile-only patch.
- **Trimmed card padding on mobile** (`2rem` → `1.5rem`/`1.25rem` below the
  breakpoint) so a narrow screen isn't eaten by padding.
- The home "SOLO" pill is pinned to `white-space: nowrap` so the new card-level
  wrap can't split its label into "SOL / O".

### Breakpoint system + phone-only page padding

The device classes are now real, shared custom-media
([`breakpoints.css`](../src/common/breakpoints.css) + the PostCSS pipeline; see
[Naming the device classes](#naming-the-device-classes-breakpoints)). The
existing `56.25rem` overrides were migrated to `@media (--mobile)`
(behavior-neutral). The first behavior split on the new system: the tight page
padding (`--page-padding-x/y` → `0.25rem`) is now **`@media (--phone)`** — phones
only. Tablets and desktop keep the roomy default (a tablet has width to spare;
the hair-tight padding only earns its keep on a phone). Verified in a production
build: `@media (--phone)` compiles to
`(width<=34rem),(orientation:landscape) and (height<=27.5rem)` and body padding
resolves to 4px on a phone vs 16/8px on tablet + desktop.

### Panels on touch — full-screen sheets + the close-button fix

Realizes [decision 1](#decisions--directions). Every [`FloatingPanel`](../src/common/components/panels/FloatingPanel.tsx)
(chat, scratchpad, Setup, Help, the modals) now adapts to touch:

- **Non-draggable + non-resizable on any coarse pointer.** A new
  [`useCoarsePointer`](../src/common/hooks/ui/useCoarsePointer.ts) hook (the JS
  mirror of the `--touch` custom-media, like `useIsMobile` mirrors `--mobile`)
  forces `draggable`/`resizable` off when `(pointer: coarse)`. Dragging a
  floating box is a mouse affordance; more importantly this is the **fix for the
  X-won't-close-on-touch bug** — react-draggable `preventDefault()`s the header
  touchstart (the drag handle), which cancels the synthesized `click`, so the
  close button's `onClick` never fired. No drag binding → the X works. One hook
  fixes it for every panel at once.
- **Full-screen sheet on phones.** Below `--phone`, a CSS override in
  [`FloatingPanel.module.css`](../src/common/components/panels/FloatingPanel.module.css)
  cancels react-rnd's inline position/size (`!important` — only that beats an
  inline style) so the panel fills the viewport instead of floating. Insets use
  `env(safe-area-inset-*)` so the header clears a notch / status bar in
  standalone PWA mode — live because [`index.html`](../index.html)'s viewport
  meta sets **`viewport-fit=cover`** (without it the browser letterboxes content
  itself and every `env()` inset resolves to 0, so the code was inert). The
  flip-side: with `cover`, *every* full-bleed surface owns its own safe-area
  padding, so it wants an on-device pass on a notched phone (recorded in
  [deferred.md](deferred.md)). **Tablets are deliberately excluded** — they keep
  the centered-modal rect (roomy enough), just pinned in place by the
  coarse-pointer rule above.

**Keyboard-aware sizing (chat).** A full-screen sheet with a text input has a
problem on iOS: the on-screen keyboard doesn't shrink a `position: fixed` sheet,
so it overlays the input + newest messages — and iOS then auto-scrolls the
webview to reveal the input, stranding earlier content off-screen. You can't fix
this by *guessing* the keyboard height: it varies by device, and Apple's
QuickType predictive bar (which **can't be hidden** from web content) makes it
taller still. So the sheet is sized to the **measured visual viewport** instead:
a `reserveKeyboard` prop (chat opts in) drives the fixed clip layer's `height` /
`top` from [`useVisualViewport`](../src/common/hooks/ui/useVisualViewport.ts) —
the visible region, which shrinks by exactly the keyboard. The sheet then ends at
the keyboard's top edge: the input rides the keyboard, nothing is hidden behind
it, and there's nothing to scroll to. Phone-only (gated by
[`usePhone`](../src/common/hooks/ui/usePhone.ts)); off a phone the hooks are
inert (no soft keyboard → visual viewport == layout viewport). This *does* resize
the sheet when the keyboard toggles — but that's the expected native-chat
behavior (the input bar riding the keyboard), and it's the chat sheet only, not
the game board the no-reflow rule protects.

*(An earlier attempt reserved a fixed `~44–50svh` strip statically to avoid any
reflow. It couldn't win: too small and the keyboard covered the input; too big
and it wasted space; and the full-height fixed sheet still extended behind the
keyboard, so the webview stayed scrollable. Measuring beats guessing.)*

The chat input also needed the **16px font floor** — it was `0.9rem` (14.4px),
under iOS's focus-zoom threshold, so tapping it zoomed the page *in* (and never
back out), leaving the sheet wider than the screen. `@media (--touch)` pins the
field to 16px; desktop keeps 0.9rem. This is the exact trap
[Decisions #3](#decisions--directions) warned about. That sweep has since
happened: a global `@media (--touch) { input, textarea { font-size: max(16px,
1em) } }` in [theme.css](../src/common/theme.css) floors every element-styled
field, and the three class-styled fields that would out-specificity it (this
chat input, the scratchpad textarea, the word-lookup input) each carry their own
`--touch` pin — so no sub-16px input remains.

Guarded by [`panels-touch.e2e.ts`](../e2e/panels-touch.e2e.ts) (a real browser —
jsdom has no layout engine, touch synthesis, or visualViewport): the chat sheet
fills the screen, its input meets the 16px floor, a **tap** on the X closes it,
and — with a mocked-shrunk visual viewport — the sheet clamps to the visible
region with the input never behind the keyboard.

### Viewport height — `svh` instead of `vh`

Realizes [decision 2](#decisions--directions). Every full-height calc — the body
`min-height`, each game's `PlayArea` height / `--avail-h`, the club-page frame,
the menu sheet, the toast host — now uses **`100svh`** (small viewport height),
not `100vh`. On mobile Safari `100vh` is the toolbar-*hidden* height, so a
`100vh` page runs taller than what's visible and forces a scroll — fatal for our
[never-scroll pages](ui.md#page-height-fits-the-viewport), which never scroll and
so never let the toolbar retract. `svh` is the toolbar-*shown* height = exactly
the visible box, and stays stable. It's identical to `vh` on desktop (no
retractable UI), so this is a mobile-only fix with zero desktop effect. Grep
`svh` to find them all; flip together to `dvh` if we ever want the dynamic
behavior. (Standalone PWA mode has no toolbar, so this mainly helps the
in-browser / not-yet-installed path — but it's the correct unit regardless.)

### Per-game conversions — the info-sheet recipe

Each game's mobile pass follows the **psychicnum recipe**: below `--mobile` the
board fills the screen and the whole info column becomes an off-canvas sheet
opened from a mobile-only "Game info" menu item. `useIsMobile()` gates the menu
item; the sheet is otherwise pure CSS — `.infoWrap` is `display: contents` on
desktop (so InfoCol stays the flex child, byte-identical) and a fixed slide-in
sheet on mobile, with a close ✕. The `--avail-w` override hands the board the
full width.

This recipe is currently **copy-pasted per game on purpose** — we're doing two
conversions before extracting a shared `useInfoSheet()` hook + sheet CSS (rule of
three), and logging what DIVERGES each time so the extraction is informed by real
variation rather than psychicnum's assumptions:

- **psychicnum** (the POC / reference) — board is a single grid that flex-fills
  the column. No divergence; this is the baseline shape.
- **wordle** — board **+ on-screen keyboard** stacked in the board column (the
  only game that does this). **Divergence:** the board must cap its height, or on
  a short phone (e.g. iPhone SE) the keyboard is pushed off-screen. Done with a
  `@media (--mobile)` `max-width` on the board grid ([`Board.module.css`](../src/wordle/components/Board.module.css))
  derived from the leftover height (`100svh − chrome − ~15rem` of keyboard +
  feedback + gaps), converted to a width via the board's own aspect ratio so
  tiles stay square and the keyboard's own width is untouched. Guarded by
  [`wordle-mobile.e2e.ts`](../e2e/wordle-mobile.e2e.ts) at a tall + short
  viewport (no page scroll; whole keyboard on-screen; sheet opens/closes).
  wordle needs **no keyboard/input machinery** — its on-screen keyboard is taps,
  and it has no `<input>`, so none of the panel-keyboard/focus-zoom work applies.
- **codenamesduet** — the guesser taps tiles (no keyboard), but the **clue-giver
  types a clue in a below-board `<input>`**, which raises the OS keyboard, and the
  clue-giver needs the board's key-card colors visible *while* composing (the
  doc's earlier "they've already read the board" assumption was wrong). **Divergence
  — resolved by NOT fighting the keyboard:** the board stays full-size and, when
  the keyboard pushes the below-board clue field down, the page scrolls — the
  giver scrolls up to read the board, down to the field. (An earlier attempt
  *shrank* the board to the visual viewport to fit above the keyboard; it crunched
  the board too small and scrolled badly — a full board you scroll reads better.)
  So there's **no special layout code** — just the standard board-fills recipe.
  Two mobile tweaks: the clue inputs are already ≥16px (no focus-zoom), and the
  below-board action buttons (Submit / AI / Pass) go **icon-only on a phone**
  (`iconOnly={usePhone()}` — the shared buttons already support it) so the tight
  clue row fits. Guarded by
  [`codenamesduet-mobile.e2e.ts`](../e2e/codenamesduet-mobile.e2e.ts) (board
  fills, no scroll at rest, collapsed sheet, buttons icon-only). The
  scroll-when-keyboard feel is an on-device check.

**The recipe is now EXTRACTED** (after the psychicnum/wordle/codenamesduet trio
proved it byte-identical — rule of three). Three shared pieces, and a game's
mobile pass is now composing them, not copy-paste:

- [`useInfoSheet()`](../src/common/hooks/game/useInfoSheet.ts) — the `useIsMobile`
  gate + open/close state + the "Game info" `menuSections` (spread into
  `buildGameMenu`'s `extra`; empty on desktop; stable identity so it's safe in
  the menu effect's deps).
- [`<InfoSheet>`](../src/common/components/game/InfoSheet.tsx) — the off-canvas
  wrapper around the game's `<InfoCol>` (`display: contents` on desktop → fixed
  slide-in sheet on mobile + the ✕), owning the sheet CSS. **Accessibility:** the
  *closed* mobile sheet is `visibility: hidden` (not just slid off-canvas), so a
  keyboard user can't Tab into the invisible info column; the *open* one is a
  `role="dialog"` + `aria-modal` that **Escape** dismisses — the cheap half of
  dialog behaviour (focus-trap + tap-outside are a recorded cut, see
  [deferred.md](deferred.md)). The dialog role is gated on `open`, which is only
  ever true on mobile, so desktop's always-visible info column is never
  mis-announced as a modal. `useInfoSheet` also **resets `isOpen` when the
  viewport crosses up to desktop** (adjust-state-during-render, not an effect),
  so a sheet opened on mobile doesn't reappear already-open after a round trip
  through a wide layout.
- **`shared.mobileFill`** on `.layout` (in the scaffold
  [`PlayArea.module.css`](../src/common/components/game/PlayArea.module.css)) —
  the `@media (--mobile)` full-width `--avail-w` + height override.

A converted game is now: `useInfoSheet()`, `cls(shared.layout, shared.mobileFill,
styles.layout)`, and `<InfoSheet>{<InfoCol/>}</InfoSheet>` — ~5 lines, no CSS.
psychicnum / wordle / codenamesduet were refactored onto it (net line removal,
desktop unchanged, e2e green). What stays PER-GAME is the board's own mobile
SIZING — psychicnum flex-fills, wordle caps by leftover height for its keyboard,
codenamesduet keeps a full board + scroll.

**stackdown** was then the first *new* conversion on the extracted recipe — and
it proved the payoff: pure recipe, **no board divergence**. Its square board is
`min(--avail-w, --avail-h, 620px)`, so `mobileFill`'s full-width `--avail-w` (with
`--avail-h` already reserving the below-board WordEntry) fits it on a phone on its
own; input is tile taps (no keyboard). The whole conversion was `useInfoSheet()` +
`shared.mobileFill` + `<InfoSheet>` and nothing else, guarded by
[`stackdown-mobile.e2e.ts`](../e2e/stackdown-mobile.e2e.ts) (tall + short: board
fills, no scroll, sheet works).

**spellingbee + boggle** are the **wide-sheet pair** — the two games whose info
column is a multi-column **WordList** that wants real width. The plain recipe's
sheet is only as wide as its content, which crushed the word columns to one row
each on a phone. The fix is a **`wide` variant of `<InfoSheet>`** (`wide` prop):
below `--mobile` the sheet is `width: 100%` and a flex column whose non-✕ child
(the `<InfoCol>`) stretches to full height (`flex: 1 1 auto; min-height: 0`), so
the WordList fills the sheet and its columns get their natural height. The
columns themselves are now **rem-width** (`--wl-col-width`, default `10.5rem`) via
`grid-auto-columns` instead of the old `calc((100% − gaps)/5)` five-column split —
so the count of columns is driven by the word count and they **side-scroll**
horizontally (as they already did on desktop) rather than being squeezed. Desktop
is unaffected: the rem width matches what five columns used to be on a normal
info column, so a desktop board shows the same column count it always did.

- **spellingbee** — board is the 7-hex honeycomb (SVG, scales with the column via
  `--u`); the recipe fits it on a phone unchanged. Added **click feedback on a
  hive tile**: a one-shot hex-shaped white flash (`.hexFlash`, keyed by a bumping
  nonce so re-tapping the SAME tile replays it) on top of the `:active` press —
  and `-webkit-tap-highlight-color: transparent` on the `<g>`, since the browser's
  default tap-highlight paints a grey box over the hex's square bounding box that
  both looks wrong and hid our flash. Guarded by
  [`spellingbee-mobile.e2e.ts`](../e2e/spellingbee-mobile.e2e.ts).
- **boggle** — the square tile grid fills the phone (`mobileFill`'s `--avail-w`;
  `--avail-h` already reserves the below-board input row). Its touch story is
  **tap-to-trace a word**: tap tiles along a Boggle path (king-move / 8-way
  adjacency) and each letter appends to the shared `word`, so submit + validation
  (`traceableStr`) are unchanged; the path lives in `BoardCol` as tile coords in
  the *displayed* (possibly-rotated) view, so **rotating clears it** (the coords
  would point at different letters). Tapping a selected tile backtracks to it (tap
  the last to step back one, an earlier one to undo to it); tapping a non-adjacent
  unused tile is ignored; **typing or Delete clears the path** (you switched to the
  keyboard). Visual feedback: a traced tile gets an **accent fill + ring**
  (`.selected`), plus the same `:active` press-scale + tap-highlight suppression as
  spellingbee. The EntryBox placeholder is now "Type or tap letters". Path-tracing
  works with a mouse too, so it's a desktop affordance as well. Guarded by
  [`boggle.e2e.ts`](../e2e/boggle.e2e.ts) (trace C→A→T, adjacency guard, backtrack,
  submit-via-button-then-path-clears — Enter would land on the focused tile's own
  key handler, so a tap user commits with the Submit button).

**waffle** was a pure plain-recipe conversion (like stackdown) plus two touch
tweaks. Its square board is `min(--avail-w, --avail-h, cap)`, so `mobileFill`'s
full width fits it on a phone with no board divergence; the info column (a narrow
22rem swap-state readout + swap log, no WordList) uses the **plain** 24rem sheet,
not `wide`. Two input tweaks: (1) the move is already **tap-two-tiles-to-swap** —
tap one tile to pick it up, a second to swap, the same again to cancel — so touch
needs no new model; the *drag* path (HTML5 DnD, a desktop mouse affordance) is
turned **off on a coarse pointer** (`draggable={!disabled && !coarse}`) so a phone
gets the tap model cleanly (no long-press drag-ghost). (2) The picked-up tile's
ring was a faint brown (`--waffle-select-ring`) — too subtle; it's now the app's
**attention yellow** (`--color-history-viewer`, thicker at 4px), which the
`outline-offset` gap keeps legible even on a yellow feedback tile. That's a
visibility fix, so it applies on desktop too. Guarded by
[`waffle-mobile.e2e.ts`](../e2e/waffle-mobile.e2e.ts) (tall + short: board fills,
no scroll, sheet works; drag off on touch; a tap-swap commits).

**connections** was the plain recipe plus a couple of below-board tweaks. The board
is one grid that fills `--avail-w`, so `mobileFill` fills the phone (no divergence,
like psychicnum); input is tap-a-tile (touch-native), no keyboard/drag; the info
column (mistakes/turn-log/Hints/End, no WordList) uses the **plain** sheet. Unlike
the pure-board games it has a below-board **commit row** (mistakes readout +
Clear/Submit), which is tight on a phone, so — same treatment as codenamesduet's
action row — the **buttons go icon-only** (`iconOnly={usePhone()}` + a `@media
(--phone)` drop of their text-era `min-width`) and the **label shortens to
"Mistakes"** (the strike dots already carry "lose at 4"). One tile-text tweak:
connections is the only game with multi-letter WORD tiles, and on a narrow phone
tile a long word (DIAMOND) hit the shared `--tile-font-min` floor and wrapped, so a
`@media (--phone)` rule lowers that floor on connections' grid (letting the
auto-fit shrink it to one line). Guarded by
[`connections-mobile.e2e.ts`](../e2e/connections-mobile.e2e.ts) (tall + short:
board fills, no scroll, sheet works; a tapped 4-tile guess commits).

**crosswords** got the recorded "clue bar under the grid" treatment (it was this
doc's future-direction note; now built). Below `--mobile` the grid + the
active-clue bar are the whole main view — the grid takes the full viewport width
(a second inline cell-size formula, picked by the breakpoint in
`Grid.module.css`; the desktop formula shares width with the clue columns and is
untouched), and the bar hugs the grid's bottom edge showing the one clue the
cursor is on: **2 reserved/clamped lines on a tablet, 3 on a phone** (narrower
wraps more). The Across | Down lists AND the check/reveal Controls strip move
into the **wide** info sheet (the shared recipe; a `display: contents`
`.sheetContent` wrapper keeps them grid items on desktop, byte-identical).
**Keyboard-required still holds** — this is the layout for a tablet (or phone)
*with* a hardware keyboard, not a touch-entry mode; entry is still typed.
Guarded by [`crosswords-mobile.e2e.ts`](../e2e/crosswords-mobile.e2e.ts) at
tablet-p + phone on a generated full-size 15×15 board
(`createCrosswordsGameSized` — the 2×2 e2e fixture caps at max cell size, so it
can't exercise width-bound sizing): no page scroll, width-bound grid, the bar
under the grid at its reserved height, the sheet round-trip, typed entry.

### Tap feedback — one canonical treatment

spellingbee + boggle grew bespoke tap feedback first (grey-flash suppression + an
`:active` press on their own tiles); that treatment is now **canonical on the
shared surfaces**, so every tap game matches instead of a handful. The shared
`.tile` (in [`PlayArea.module.css`](../src/common/components/game/PlayArea.module.css)
— psychicnum / connections / waffle / codenamesduet) and the shared
on-screen-keyboard `.key` (in [`GuessKeyboard.module.css`](../src/common/components/game/entry/GuessKeyboard.module.css)
— wordle + wordiply) each carry three things:

- `-webkit-tap-highlight-color: transparent` — kill the browser's default grey
  tap box, which paints a rectangle that fights the tile fill;
- a **designed press** — tiles scale down (`:active` → `scale(0.96)`), keys
  *darken* instead (a scale would jitter on gap-tight keys);
- **`touch-action: manipulation`** — opt out of iOS Safari's double-tap-to-zoom
  and its ~300ms tap delay, so rapid taps (path-tracing, fast typing) stay crisp.

stackdown's bespoke mahjong `.tile` and boggle/spellingbee's own tiles carry the
same three (they're not the shared `.tile`, so they replicate it locally). The
zoom-suppression *feel* is an on-device check — Playwright can't reproduce
Safari's gesture heuristics (recorded in [deferred.md](deferred.md)).

**The pass now covers every game except one.** Twelve games follow the
info-sheet recipe: the wide-sheet trio **spellingbee / boggle / crosswords**,
and the plain-sheet games **psychicnum / wordle / codenamesduet / stackdown /
waffle / connections / wordwheel / wordiply / scrabble**.

- **scrabble** is **keyboard-required, NOT desktop-only** — like crosswords, its
  conversion is a layout for keyboard-attached devices, not a touch-entry mode
  (drag gets no touch support; play is the keyboard cursor — tap a square,
  type). The board fills the width; on phones the rack + controls row wraps to
  two rows (`@media (--phone)` in BoardCol/PlayArea `.module.css`, with the
  below-board reserve and `--avail-h` grown in lockstep). It stays **un-gated**
  (no `usePhone()` block) so a keyboard-attached phone/tablet — which the
  browser can't detect — stays playable; a bare phone renders fine but can't
  enter tiles. Guard: `e2e/scrabble-mobile.e2e.ts`.
- **bananagrams** is genuinely **desktop-only** (a large 25×25 drag-heavy arena,
  unpleasant even on a keyboard tablet) — **hard-blocked on *all* touch** via the
  shared [`<DeviceBlockNotice>`](../src/common/components/game/DeviceBlockNotice.tsx)
  (`useCoarsePointer()` in its PlayArea). The one game that actually gates the
  device, and the sole unconverted one.

The app *chrome* (the `.card` shell pages, club page, header/player strip, chat,
panels) is mobile-ready for all of them regardless.

## TODO — not doing now, recorded so we don't lose them

These two caps attack the overflow problem at the *source* rather than papering
over it with wrapping/truncation. Long user-supplied strings are the main thing
that threatens the no-scroll invariant on a narrow screen (see the `.card` and
player-strip notes above); bounding their length makes the whole app calmer on
mobile and tightens the rosters, chat, and club lists everywhere.

- [ ] **Cap user handles at 10 characters.** The username is shown in chat, every
  game roster, the header player strip, and as the literal handle of the solo
  club (`=<username>`). A 10-char ceiling keeps all of those compact on a phone.
  Enforced where the handle is created — the SQL `CHECK` on `common.profiles.username`
  and the `claim_username` RPC, mirrored by `HANDLE_REGEX` in
  [`ClaimHandleScreen`](../src/common/components/auth/ClaimHandleScreen.tsx)
  (currently 3–30 chars). Alpha prior: fine to just re-narrow the constraint;
  existing over-long handles get re-picked.
- [ ] **Cap club names at 20 characters.** The club name headlines the club page
  and appears in the home clubs list. A 20-char ceiling keeps the title on one
  line on a phone. Enforced at `create_club` (and wherever a rename lands, once
  that exists).
- [ ] **Audit local/global feedback message COPY for length.** Dropping the name
  to a dot (the actor-mention widgets) handles the *name* half, but some messages
  are just wordy — "is waiting for your turn to complete", "guessed a secret word
  — not it". On a narrow header pill / below-board row a long sentence still
  wraps or crowds. Pass over every game's feedback strings and shorten where the
  meaning survives (the dot already names the actor; the tone/color already
  carries good/bad), so they read tight on a phone without a per-length hack.
