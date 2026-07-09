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
  (tap letters), boggle (tap adjacent tiles — **needs adding**; the current build
  types/traces). *Verified end-to-end via a touch-only e2e (`.tap()`, no
  keystroke): psychicnum tap-tile → Submit locks the tile; spellingbee
  tap-letters → Submit accepts the word.*
- **Transient native keyboard, acceptable:** codenames duet / tinyspy (clue
  entry only).
- **Real-keyboard-required (desktop or a tablet *with* a keyboard):** crossplay
  (crossword grid); scrabble (tile placement is drag-or-type, and we won't build
  touch-drag or an in-game keyboard for it, so it needs a real keyboard).
- **Desktop-only:** bananagrams (drag-heavy + a large arena; unpleasant even on a
  tablet with a keyboard).

**On a phone, the real-keyboard-required + desktop-only games are HARD-BLOCKED**
(a "play this on desktop / with a keyboard" screen), not soft-warned — we don't
let people limp through a broken experience. Operationally: block scrabble +
crossplay on phone widths (tablets are allowed — assume a keyboard may be
attached, which the browser can't detect); block bananagrams on *all* touch
(phone + tablet), since it's desktop-only.

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
- **boggle** needs a tap-to-select-adjacent-tiles path added for its touch story.

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
  standalone PWA mode. **Tablets are deliberately excluded** — they keep the
  centered-modal rect (roomy enough), just pinned in place by the coarse-pointer
  rule above.

**Keyboard reserve (chat).** A full-screen sheet with a text input has a problem
on iOS: the on-screen keyboard doesn't shrink a `position: fixed` sheet, so it
overlays the input + newest messages — and iOS then auto-scrolls the webview to
reveal the input, stranding earlier content off-screen even after the keyboard
closes. The fix is a `reserveKeyboard` prop (chat opts in): on phones the sheet
still fills the screen, but its body is padded up from the bottom by an assumed
keyboard height (`--keyboard-reserve`, ~44svh) so the input sits *above* where
the keyboard appears. Crucially the space is reserved **whether or not the
keyboard is up**, so toggling it causes **no reflow** — the keyboard just fills
the already-empty strip below the input (the repo's no-reflow-on-state-change
rule, applied to the keyboard). The strip is chat-surface-colored, so nothing
shows through.

Guarded by [`panels-touch.e2e.ts`](../e2e/panels-touch.e2e.ts) (a real browser —
jsdom has no layout engine or touch synthesis): on a 390px touch viewport the
chat panel fills the screen, its input keeps a keyboard-sized gap below it, and a
**tap** on the X closes it.

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
