# Area: menu

The folders it reads: `menu`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: CLOSED 2026-09-11, blessed.** Roster agreed (Joel: "audit the
area") and stamped `cs-audited-menu`; the nine code files are
`cs-blessed-menu` on Joel's word the same day (`doc.md` and `todo.md` take no
stamp). Fourteen findings from one
read of all eleven files, every one worked or closed; the closing re-read
found eight more, all worked the same sitting. `doc.md` is harvested and
`todo.md` holds the one thing owed. The
prose findings were worked first, on Joel's ask ("make the lede/doc.md and fix
docstrings and missing docstrings — this will help me understand this
section"). The three behavior findings (F-1, F-2 and the masked half of F-2)
were CHECKED with a throwaway spec before being written down, since last
area's reading was wrong in the direction of "nothing is wrong here" three
times; the spec was deleted after the run.

## The roster

All in `src/common/menu/`:

| file | what it is |
|---|---|
| `Menu.tsx` + `.module.css` + `.test.tsx` | the one component: the chevron-wrapped trigger, the popover, the keyboard contract, the submenu hybrid (flyout on desktop, drill-down on mobile), the icon gutter |
| `menuModel.ts` | the row, section and header types, `menuRow` (what the menu draws for a row), `MenuApi` |
| `gameMenu.ts` + `.test.ts` | `buildGameMenu`: the framing every game's menu shares |
| `gameMenuStore.ts` + `.test.ts` | the sections a game has pushed |
| `pageMenuStore.ts` | how to open the page's menu, for the `?` key |
| `doc.md` | lede + Design, present (not on `INTROS_OWED`) |
| `todo.md` | one Maybe: a disabled row cannot say why |

Left off: the three things that render or fill it — `PageHeaderMenu`, which
is the only thing that mounts `<Menu>`; `GameHeaderMenu`, the one subscriber
to the game store; `useAccountMenuSection`, the account submenu — and every
game's PlayArea, which calls `buildGameMenu`.

**Callers, for evidence (read, not stamped).** `<Menu>`: ONE renderer,
`PageHeaderMenu`, which passes `logo`, `sections`, `triggerLabel` and
`returnFocusOnClose` — and nothing else, which is F-3. `buildGameMenu`: every
game's PlayArea. The `menuModel` types: `GamePage`, `gamePageCtx`,
`GameHeaderMenu`, `ClubPage`, `useAccountMenuSection`, `PageHeaderMenu` and
the games' PlayArea tests. `gameMenuStore`: `GamePage` writes, `GameHeaderMenu`
reads. `pageMenuStore`: `PageHeaderMenu` registers, `AppActionsHost` opens.
`act-open-menu` is `?` in the registry, as the prose says.

**The docs.** docs/ui.md → GamePage menu is the owning section and holds up:
the framing, "a row is an action", the shortcut hints, when rows are read, the
store's stability argument, the focus rule, the keyboard table and the
submenu hybrid all match the code. docs/keyboard-shortcuts.md → Menus,
dialogs, and panels matches `onPopoverKeyDown` key for key. The section's
title says "GamePage" and its body covers every page's menu; noted, not a
finding.

## Findings

### Behavior

## F-menu-1 · `outside-click-leaves-submenu-open` · A mousedown outside closes the menu and forgets the submenu — WORKED

`closeOnOutsideClick` calls `setOpen(false)` and nothing else; every other
way out (`closeMenu`, Tab) also clears `submenu`. Two consequences, both
reproduced:

- **Desktop:** open, open a flyout, click outside, click the trigger — the
  menu reopens WITH the flyout up (two `role="menu"`), contradicting the
  test "reopening the menu starts at the top level", which passes only
  because it closes via the trigger.
- **Mobile:** the drill-down branch renders whenever `isMobile && openParent`
  and never asks `open`, so after an outside click the drilled list STAYS ON
  SCREEN. Nothing closes it but the trigger or a key.

One path forgot one piece of state, and the early-return branch (F-4) is
what let the second half hide.

**WORKED 2026-09-11, with F-4.** A `dismiss` closes without touching focus
and clears the submenu; Tab and the outside click both go through it, and
`closeMenu` already did. With one render path the `open` guard covers the
drill-down by construction. Two specs added, one per presentation — the two
the probe had failed on the old code.

## F-menu-2 · `flyout-switch-loses-parent-index` · Opening a second flyout by click records its parent as row 0 — WORKED

Rows behind an open flyout are rendered with `navIndex === null` (so they
register no ref), and `onClick` passes `navIndex ?? 0`. Clicking a second
submenu parent while a flyout is open therefore stores `parentIndex: 0`, and
Escape / ArrowLeft then puts focus on the FIRST row of the list rather than on
the parent you came from. The comment above `openSubmenu` knows the anchor
element has to be passed in for this case; the index has the same problem
and was not.

**Masked in the simple case**, which is why it reads as working: when the
focused index is already 0, `setFocusedIndex(0)` changes nothing, the focus
effect does not re-run, and the click's own native focus stays on the parent.
Move inside the first flyout first (ArrowDown), then click the second parent,
then Escape — focus lands on Help. Reproduced. Fix: `renderRow` knows the
row's flat index even when it passes `null` for navigation; carry both, or
find the id in `flatRows`.

**WORKED 2026-09-11.** `renderRow` takes `index` and `navigable` as two
arguments instead of one nullable index, because they were always two facts: a
row behind an open flyout HAS a position, it just isn't the keyboard's to walk.
The ref registration asks `navigable`, the click passes `index`, and the
`?? 0` that invented row 0 is gone. One spec added, and the ArrowDown in it is
load-bearing — it moves the focused index off 0, which is the only reason the
bug shows at all. Planted by restoring the old `0`: the spec fails with focus
on Help, exactly the symptom above.

### Shape

## F-menu-3 · `dead-props` · Two props nobody passes, and the CSS that serves them — WORKED

Joel, 2026-09-11: delete. Both props gone, with `.popoverRight`,
`.flyoutLeft`, the flyout's `right:` branch and `OpenSubmenu.anchor.left`,
which only that branch read. The flyout now has one positioning line.

`popoverAlign` and `triggerClassName` have no caller: `PageHeaderMenu` is the
only thing that renders `<Menu>` and passes neither. With `popoverAlign` go
`.popoverRight`, `.flyoutLeft`, the `right:` branch of the flyout's inline
style and three paragraphs of prose — one of which says "if a future caller
wants right-anchoring we'll add a prop", about the prop that exists. Same
shape as floating-panels' `phone` and `edgeMargin`. Delete, or keep with the
reason written.

## F-menu-4 · `two-popover-renders` · The drill-down returns early with its own copy of the popover — WORKED

`if (isMobile && openParent)` returns a second `<div className={styles.menu}>`
with its own popover — `ref`, `id`, `className`, `role`, `onKeyDown` — and
then the desktop path builds the same wrapper again below. Two places to keep
in sync, and the second is the one that forgot `open` (F-1). The presentations
differ in WHICH rows are listed and whether a flyout is drawn beside them,
not in the popover; one render with the list chosen by presentation would
have had nowhere to forget it.

**WORKED 2026-09-11** (Joel: one render path). The popover is drawn once;
the submenu's rows are rendered once and placed by presentation — in the
popover for the drill-down, in the flyout beside the sections on desktop —
and the section list moved into `renderSections()`, a nested function like
`renderTrigger`. The early return is gone, and with it the second copy of
the wrapper.

## F-menu-5 · `useCallback-with-unstable-deps` · `openMenu` is memoized on a fresh array — WORKED

`openMenu`'s deps are `[flatRows]`, which is rebuilt every render, so the
callback — and the `useImperativeHandle` value hung off it — is new every
render. Harmless, and a claim the memo cannot keep. Minor: drop the memo, or
compute the first enabled row at call time.

**WORKED 2026-09-11** (Joel: drop the memo). A plain function in the body,
like the other handlers here, and the handle's dep list went with it — the
comment there now says why no memo is possible AND why none is wanted:
nothing reads the handle's identity, because `PageHeaderMenu` registers a
closure over its ref ONCE and `pageMenuStore` is a slot rather than a
subscription. The file's other memos — `openSubmenu` on `[isMobile]`,
`closeMenu` on `[returnFocusOnClose]`, `closeSubmenu` and `dismiss` on
nothing — are genuinely stable and were left alone. (The re-read corrected
this sentence: it had said "the other memo", and there are four.)

**An absence found while there, and closed: the imperative handle had NO
spec.** It is the `?` key's whole path into the menu — nothing else opens one
without a pointer or the trigger's own keys — so a dead handle would have
surfaced only as a shortcut that quietly does nothing. One spec added, planted
against a no-op handle.

### Code and prose

## F-menu-6 · `docstring-marker-pass` · `/**` on members and inside a body — WORKED

`Menu.tsx`: `OpenSubmenu` (three), `Props` (six, some of them 8–9 lines of
rationale), and inside the component body `hasIcons` and the `navRows` block
carry `/**` — a note in a body takes `//`. `gameMenu.ts`: `buildGameMenu`'s
four option members, inside the signature. `menuModel.ts` is already `//`
throughout. (`PageHeaderMenu`'s `Props` has the same fault — `page-header`'s
file, `cs-unmet`, not touched.)

## F-menu-7 · `misattached-and-missing-docstrings` · Two docstrings sit on the wrong declaration, two exports have none — WORKED

- `menuModel.ts`: the paragraph "WHAT THE MENU DRAWS for one row… The one
  place a bound action is read on its way into a menu" describes the FUNCTION
  `menuRow` and sits on the TYPE `MenuRow`; `menuRow` itself has no docstring.
- `Menu.tsx`: the `/**` "The rows the KEYBOARD is currently walking" sits
  above a `//` comment and `const openParent`; `navRows` is two statements
  down.
- `MenuHeader` and `MenuApi` have no docstring. `MenuApi` is what every
  PlayArea receives.

## F-menu-8 · `stale-claims` · Prose the code no longer matches — WORKED

All fixed 2026-09-11. The `.popover` sentence now points at `.popoverRight`
rather than promising it; whether that class stays is F-3's.

- **The z-index story is inverted.** `Menu.tsx`'s docstring: "above 500-tier
  modals so a menu click can open one; below the 10000-tier chat panel so
  chat stays available". Those numbers are a retired ladder; today `--z-menu`
  is 3200 and `--z-chat` is 3100, so the menu paints ABOVE chat. `base.css`
  says why the menu is a rung; the docstring should point there and stop
  quoting numbers.
- `Menu.module.css` header: "Used by GamePage today… designed to be reusable
  for ClubPage" — every page's header renders it, through `PageHeaderMenu`.
- `.popover`: "Anchored left…; if a future caller wants right-anchoring we'll
  add a prop" — the prop exists (F-3).
- `.divider`: "separates the common items from the per-game items" — the
  shell injects no common items; a game owns its whole menu. It separates
  sections.
- `Menu.tsx` line 133: "see the component docstring's 'Submenus' section" —
  the docstring has no such section; the hybrid is described in the test
  file's header and the stylesheet.
- `Props.logo`: "Every caller passed the identical wrapper before, and a
  fourth could have forgotten it" — archaeology, and there is ONE caller now,
  `PageHeaderMenu`, whose own docstring already makes the point.
- `Menu.test.tsx`'s header lists "What's covered" — and the list stops at
  dividers. Submenus, the icon gutter, key isolation, `returnFocusOnClose` and
  the shortcut hint are covered and not listed. A census that rotted; the
  describe blocks are the list.
- Three mentions of the port's origin for the section header — `.header`
  "(crossplay parity)", `MenuSection.header` "the way the original crossplay
  app it was ported from does", `buildGameMenu.header` "matching the menu of
  the original crossplay app". The reason the header exists is the puzzle's
  credits, which is what to say.

## F-menu-9 · `crosswords-reason-times-seven` · One rationale, written out in seven places — WORKED in this folder

The four sites in `Menu.tsx` are a sentence each now, the prop's pointing at
docs/ui.md → GamePage menu → Focus. `GameHeaderMenu` and `PageHeaderMenu`
still carry the full paragraph; theirs to shorten when their areas open, and
the question below stands.

"The crosswords board reads window keydowns, so a focused trigger would
swallow arrows / reopen the menu" is written in full in `Props.returnFocusOnClose`
(eight lines), `closeMenu`, `onPopoverKeyDown`, `onTriggerKeyDown`,
`GameHeaderMenu`'s prop comment, `PageHeaderMenu`'s `Props`, and docs/ui.md →
Focus — plus the key-isolation tests. One home and pointers. The home is
probably `docs/ui.md → Focus`, which already states it well; the code sites
become a sentence each. (Two of the seven are other areas' files.)

Worth asking while there: after the `keyboard` and `actions` areas, is the
trigger still the thing that would swallow a board key? The claim predates
both. Not a finding about the mechanism — the tests pin the isolation — but
the REASON should be re-said in today's terms if it has changed.

## F-menu-10 · `design-in-docstrings` · The stores and the icon note restate what the docs already own — WORKED

- `gameMenuStore.ts`'s module docstring is doc.md → Design's third paragraph
  nearly verbatim — "why this is not `useState` on the game page", the
  identity loop, "why a module slot is safe".
- `pageMenuStore.ts` makes the module-slot argument again, citing
  `infoSheetStore` (which exists).
- `menuModel.ts`'s `MenuSubmenu.icon` note is twenty lines on the icon
  language — tooltips on touch, the legend, the registry rule — which is
  docs/ui.md → Button iconography's, and `MenuRow.icon` and the test header
  say it a third and fourth time.

Each shrinks to a sentence and a pointer; the doc.md paragraph and ui.md are
the copies that stay right.

## F-menu-11 · `duplicate-jsx-comments` · Two consecutive comments on the leading slot — WORKED

In `renderRow`, lines 418–421 and 422–432 are two JSX comments back to back,
both about the slot before the label, both ending "Not rendered on the
drill-down's Back row". One comment.

### The stylesheet

## F-menu-12 · `vocabulary-pending` · The guard's rows for `Menu.module.css`

`vocabularies.test.ts` carries six rows for this file — spacer `1.5rem`,
`0.3rem`, `0.1rem`, `-1px`, `-1rem`; type `0.95rem`, `0.82rem`, `1rem`;
line-height `1`; opacity `0.45`; transition `100ms`, `80ms`; border `1px`.
Padding is parked and not on them. Two convert silently, since they ARE the
vocabulary's values: `100ms` / `80ms` are `--transition-duration-paint` /
`-nudge`, and `.divider`'s `1px` is `--border-width-line`. The rest are the
a/b/c question, in context:

- **The `1.5rem` gap and the two `-1rem` margins are one decision.** `.item`'s
  `gap: 1.5rem` is the label↔shortcut gutter; `.itemDot` and `.itemIconSlot`
  then each cancel it with `margin-right: -1rem` so the glyph is not flung
  from its label. A gutter that two children have to undo is on the wrong
  element — it belongs to `.itemShortcut` (`margin-left: auto` is already
  there), after which the row's `gap` is the ordinary small one.
  **WORKED 2026-09-11** (Joel: move it). The row's gap is `--spacer-4`, the
  shortcut carries `padding-left: var(--spacer-1)` as its floor, both negative
  margins are gone, and the guard's spacer row lost `1.5rem` and `-1rem`. Not
  looked at on screen: that takes a run of the app, which is Joel's to okay.
- **The last of the literals — CLOSED 2026-09-11.** The file writes one
  number that is not a token, and it is there by decision:
  - `100ms` / `80ms` / the divider's `1px` converted silently, as planned.
    The menu is the FIRST reader of `--transition-duration-nudge`, so that
    token came off `cssTokens.test.ts`'s declared-ahead list — the guard asks
    for that itself when a token stops being declared ahead of anything.
  - The divider's margin is `--spacer-5` (Joel). The popover's and the
    flyout's vertical padding stay at `0.3rem`: padding is parked and not on
    the ramp, so the rule now sits a hair tighter than the panel's own inset.
  - The flyout's `-1px` overlap is `calc(-1 * var(--border-width-line))`. It
    was never a spacing choice — it is the border's width negated, so the seam
    between the two panels stays closed if that edge ever thickens. Off the
    spacer list because it is no longer a spacer.
  - `0.1rem` STAYS, twice, with the reason in the file: the trigger's
    logo-to-chevron gap and the credit line's leading both say "these two are
    one thing", which the ramp's smallest step (`0.25rem`) is too big to say.
- The item's `0.95rem` / `0.82rem` type against the ramp; the header's are
  the same two numbers.
  **WORKED 2026-09-11** (Joel: fit them to the ramp). The menu has two
  sizes, not four — the section title reads at item size and the sub-lines
  match the hint — so they moved together: label and title to
  `--font-size-1`, hint and sub-line to `--font-size-2`, and
  `.itemChevron`'s `1rem` converted silently since it already WAS the
  token's value. Five declarations, no literal left, and the file's
  font-size row is off the guard. The argument for 1rem: nothing states why
  a menu row should be quieter than body text, and `SelectionList` — closed
  and blessed — sets no size on a row at all, so its rows already render at
  that size. `KeyList` puts `--font-size-2` on the whole help list, which
  is what the hint is.
  **This is the first change in the area that moves pixels**, and it has not
  been seen: the label grew 0.8px, so every popover is fractionally wider
  (`max-content`), and on a phone, where the width is already clamped to the
  viewport cap, labels wrap sooner. Crosswords is the stress case (~20 rows,
  "Print answer key (PDF)"). A run of the app is Joel's to okay.
  **Knock-on for the bullet below**: `.itemIconSlot`'s `1.05rem` box and the
  `size={15}` glyph were tuned against a 15.2px label that is now 16px, so
  the four mark sizes are now being judged against a moved reference.
- **`opacity: 0.45` for a disabled row, and it never paints.** The app has
  ONE disabled treatment — `--chrome-disabled-opacity: 0.75` on
  `button:disabled` in base.css, with the argument written there (raised
  from 0.5 because the missing hover carries the message and the label has
  to stay readable). A menu row IS a `<button disabled>`, so that rule
  applies at (0,1,1) and `.itemDisabled` asks for 0.45 from a bare class at
  (0,1,0) and loses; its `cursor: not-allowed` is the global's value
  restated. The whole class is inert — a disabled row has been at 0.75 all
  along. (Computed, not seen on screen.) The one half of base.css's
  argument a menu row does NOT satisfy: a row carries no `title`, so there
  is no tooltip to say why. Arrows skip it, hover skips it, and the fade is
  the only signal. Sibling for contrast: `ShuffleButton`'s identical 0.45 is
  written `.shuffle:disabled` at (0,2,0) and does paint.
  **WORKED 2026-09-11** (Joel: delete the rule and the class). The rule, the
  class and its `cls()` entry are gone; a disabled row keeps the app's one
  treatment, which is what it was already showing, so nothing moves on
  screen. `.item`'s comment now says where the fade comes from. The guard's
  `opacity` row for this file is deleted, and both directions were planted:
  a stale row fails, and a re-added `0.45` fails. The menu row's missing
  `title` is NOT addressed — a disabled row still cannot say why, which is
  a question about rows carrying a reason, not about how far they fade.
- `--field-muted-ink-color` on `.itemIconSlot`, a FIELD token on a menu,
  three lines from `--page-text-muted-color` doing the same job on
  `.itemShortcut`, `.headerLine`, `.itemChevron` and `.itemBack`. One muted
  ink per file.
  **WORKED 2026-09-11** (Joel: a token of its own; then, on seeing the list,
  the credit lines are not part of it). The menu's MARKS have one ink now —
  `--menu-muted-ink-color`, a MENU bucket in both theme files — read by the
  shortcut, the glyph, the submenu chevron and the drill-down's Back row. A
  section's credit lines stay on `--page-text-muted-color`: they are words,
  not marks. The direction is the one Joel picked: the darker of the two
  inks wins, so the three marks that were on the page's muted text darken to
  meet the glyph, which does not move. A COPY of the field hex, not a reference, per CHROME's house rule —
  they agree today and are not the same decision.
  Values: #555555 daylight, #a4abb8 midnight, which is LIGHTER than the
  page's muted text there; the direction flips with the ground, the job does
  not. The glyph is a Lucide icon inheriting `currentColor` from the slot, so
  the slot's color is what paints it. An inline hex was tried and is not
  available: `cssTokens.test.ts` fails any color outside a `--token:`
  definition, and a second guard makes both themes answer the same set of
  roles — which is why this is a named role rather than a value.
  **Three marks change color on screen and none of it has been seen.**
- **The marks in a row.** The bullet first written here listed `.chevron`,
  which is the TRIGGER's down-chevron in the header, and called the four "marks
  in one row" — wrong on both counts (Joel caught it). The marks actually in a
  row are: the identity disc and an action's glyph, which TAKE TURNS in the
  leading slot; the slot itself, a box deliberately wider than the
  glyph so a future glyph's bearings cannot shift every label; and the submenu
  mark at the right edge. The trigger's chevron is a separate question — it
  sits beside the logo and is sized in em so it tracks the header's type.
  **WORKED 2026-09-11** (Joel, two rulings):
  - **EVERY MARK IN A ROW IS `1em`** — the disc, the leading glyph and the
    submenu chevron — so the marks are sized by the label they sit beside and
    the menu's type moves all of them at once (Joel: "whatever sizing the menu
    uses for text… if the menu-text changes, we'd want these to follow"). It
    resolves to 16px today. The glyph had been a hard `size={15}` while the
    label grew to 16px around it, which is what Joel saw as the glyphs looking
    smaller — the one mark in the row that did not move. The slot is `1.15em`,
    still a little wider than the mark, in em now so the label column tracks
    the type too.
  - **A disc inside the icon slot was never getting `.itemDot`.** Found while
    doing the above: `renderRow` draws `<Dot className={styles.itemDot}>` only
    in the NO-icon branch; inside the slot it draws a bare `<Dot>`, which fell
    back to the shared default of `0.65em` (~10.4px). So the disc was
    two-thirds of the glyph in exactly the menus that have icons — every game
    menu. `--dot-size` now sits on `.item`, which reaches a disc in either
    place. NOT verified on screen: sizing is CSS, and CSS modules are proxies
    under vitest, so no spec can see it.
  - **The slot is now reserved on EVERY row** (Joel, on hearing the above:
    "should we just make the menu assume it always has an icon slot?"). The
    `hasIcons` scan, the ternary and the second `<Dot>` branch are gone, and
    `.itemDot` with them — that branch was WHY the sizing bug could exist, so
    the fix and the simplification are the same move. The homepage was the one
    menu without a slot, because its only top-level row is the account row and
    a disc is not a glyph; its disc now sits in the reserved column like
    everywhere else. The two gutter specs were rewritten to pin the new rule
    and planted against a restored conditional: both go red.
  - **The submenu mark is `IconSubmenu`** (Lucide `ChevronsRight`), new in the
    icon registry. It was a text `›`, which Joel reads as too small and
    confusable with a SHORTCUT — the same right-edge slot carries one on other
    rows, and `act-back-to-club` / `act-back-to-home` put a literal `<` there.
    Drawn at `1em` and in the LABEL's ink, not the menu's muted mark
    ink (Joel, on seeing it): the mark says the row leads somewhere, which is
    part of what the row does rather than an annotation beside it, and it has
    to be unmistakable in the slot where a shortcut would otherwise sit. So
    the new token has three readers, not four, and its comment in the theme
    says why the chevron is not one. `.itemChevron` lost
    its `font-size` and `line-height` (it is no longer text) and gained the
    centering `.itemIconSlot` uses, since an SVG has no baseline to align; the
    guard's line-height row for this file went with it. One spec added,
    planted against a wrong glyph class: the mark is the registry's, not a
    character.

## F-menu-13 · `half-marked-groups` · Two selector groups mark their second selector only — CLOSED, NO CHANGE

**Joel, 2026-09-11: "it's fine. just close this issue. we don't need to move
or tidy these."** Nothing moved, in this folder or anywhere else. Do not
raise it again.

`.trigger:hover,` / `.trigger[aria-expanded='true']` and
`.item:hover:not(:disabled),` / `.item:focus` keep their marker on the brace
line, which is what eleven other multi-selector rules across the shell do.
`corecss.md`'s F-corecss-9 says the convention is the FIRST selector; no live
site follows it, and that mismatch is left alone too.

## F-menu-14 · `chevron-stroke-archaeology` · A number justified by a glyph that no longer exists — WORKED

**WORKED 2026-09-11** (Joel: keep 3, rewrite the comment). The number did not
move; the argument did. It now says what a reader can check — this is the
smallest mark the menu draws (`0.65em`, sized to the header's type), and at
that size a default-weight chevron thins out against the logo beside it
instead of reading as a separate affordance. The arithmetic it used to cite
was correct and unusable: 3/24 matching the retired glyph's 2/16 is a fact
about something not in the tree. The app's only other stroke override, the
registry's back arrow at 2.75, is the model — it says "made thicker so it's
easier to read" and invokes nothing.

`strokeWidth={3}`, with a comment that it is "an IDENTITY rather than a tuned
number" because "the hand-drawn chevron this replaced was stroke 2 on a 16
viewBox". The old glyph is gone, so the number has no live referent. Either it
matches a mark on screen today, and the comment names that, or it is a tuned
number and says so.

## The closing re-read

The whole area in one sitting, 2026-09-11, after F-2 (the last group): every
file on the roster, the two docs the folder answers to (docs/ui.md → GamePage
menu, docs/keyboard-shortcuts.md → Menus, dialogs, and panels), and every
cross-file claim a docstring makes, checked against the file it names —
`useStandardGameActions`, the `<` on Back to club, where `act-open-menu` and
`act-open-chat` are bound, the store's one reader, the unmount that clears it,
the paused page. Eight things, all WORKED the same sitting (the eighth on
Joel's pick). Three of them were written by this area, and one is a claim
three files made that the render tree disproves — the case the re-read exists
for.

## F-menu-15 · `menu-unmounts-on-pause` · Three files say the game menu unmounts while paused, and it does not — WORKED

`pageMenuStore.ts` ("GamePage's menu unmounts while the game is paused, so
`?` during a pause finds nothing registered"), `PageHeaderMenu.tsx` ("a page
that drops its menu (GamePage does, while paused)") and `doc.md` ("the game
page while paused — makes `?` a no-op"). Checked: `<GameHeaderMenu>` renders
inside `<PageHeader>`, ABOVE `<PauseBoundary>` in GamePage's tree, and the
pause gate is a render gate over what sits under it. The menu stays mounted
through a pause, `?` opens it, and it holds only the account row — the game's
sections are cleared by the PlayArea's effect cleanup when IT unmounts.
docs/ui.md → Pause behavior had it right and now also says what the paused
menu holds. The no-op case is real and is a page with no header at all: the
sign-in gate, a loading screen, the moment between one page's release and the
next's claim — which is what the three sites say now. `PageHeaderMenu.tsx` is
`page-header`'s and `cs-unmet`; a comment-only conformance edit.

## F-menu-16 · `tab-advances-focus` · Three sites say Tab "advances focus", and the key is consumed — WORKED

docs/ui.md → Keyboard ("Tab while the menu is open closes it and advances
focus normally"), the spec's name ("closes on Tab so focus advances to the
next page element") and the render helper's comment ("so we can test
Tab-closes-and-advances-focus"). The code `preventDefault`s the Tab and
`dismiss`es; keyboard-shortcuts.md says consumed; the spec asserted only that
the menu was gone. All three say consumed now, and the spec pins it — after
two wrong aims. Focus cannot tell the two apart in jsdom: the focused row
unmounts under the press, so focus falls to `<body>` whether or not the key
was claimed, and an assertion on "the next control is not focused" was green
against a planted `preventDefault`-less branch, and so was one on `<body>`.
What tells them apart is the EVENT: a capture-phase listener on `document`
sees it before the popover does and reads `defaultPrevented` afterwards.
Planted: red without the `preventDefault`, green with it.

## F-menu-17 · `dot-size-two-places` · `.item`'s `--dot-size` comment cites the branch F-12 deleted — WORKED

"Set on the ROW rather than on the disc's own class because a disc renders in
two places (inside the leading slot when the menu has icons, inline when it
has none) and only one of those carries that class." The inline branch and
`.itemDot` went with the slot being reserved on every row, in this area, the
same day. The reason the variable is on the row is simpler now — the disc is
drawn in the slot with no class of its own — and that is what it says. Written
by this area.

## F-menu-18 · `design-restated-in-docstrings` · `NavRow` and `MenuSubmenu` restate two doc.md paragraphs — WORKED

F-10 shrank the stores' and the icon note's docstrings to a sentence and a
pointer, and left these two: `NavRow`'s second paragraph is doc.md's
Back-as-a-row sentence, and `MenuSubmenu`'s second and third are doc.md's
one-level cap and "earns it by not being one". Both are a sentence and a
pointer now; what stayed is what a CALLER needs — that Back is a nav row, that
a submenu's items are actions and not submenus, why the type carries its own
words and glyph.

## F-menu-19 · `chip-archaeology` · `MenuSubmenu.dot` justified by the chip it replaced — WORKED

"the fixed top-right chip it replaced WAS the dot, so without one the menu
drops the only place you see your own color" — the chip is gone and the
"only place" is not true of a page whose players strip shows every disc. The
live reason is that the account row shows who you are the way every surface
does, name beside disc; the mechanism half (a color NAME so `label` stays a
string) stays.

## F-menu-20 · `covered-list-regrew` · The test header's census came back as a list of block names — WORKED

F-8 struck "What's covered" because the list had rotted and "the describe
blocks are the list"; the fix wrote the block names out in a sentence instead.
The list matched today and would rot the same way. The header now says each
block pins one piece of the contract and the block names are the list.
Written by this area.

## F-menu-21 · `shell-no-longer-injects` · docs/ui.md → GamePage menu narrates the old model — WORKED

"The shell no longer injects a fixed common section … which the old 'one
common section + one game slot' model couldn't express." A doc describes now;
it says the shell injects nothing and why only the game knows the shape.

## F-menu-22 · `hint-in-the-owning-section` · The menu's owning doc section says "key hint" twice and "Shortcut hints" once — WORKED

docs/ui.md → GamePage menu is the section this folder answers to, and it
used the word Joel ruled has one meaning here (priced help) for the key label
at a row's right edge — the same use this area fixed six of in the folder.

**WORKED 2026-09-11** (Joel: fix the three now, as this area's owning doc).
"key hint" is "shortcut" twice, and the bold lede "Shortcut hints" is "The
shortcut at a row's right edge". The folder and its doc agree; the repo-wide
question — a sweep plus a guard, or a rule that binds only new writing — is
still his, and untouched everywhere else.

## Notes

- **`buildGameMenu` takes `MenuApi` whole** (Joel, 2026-09-11), not a `Pick`
  of its three rows: a slightly noisier test fixture in exchange for a cut
  that is obvious at the signature — arranging is here, pushing is the
  caller's — and the test now asserts `setGameSections` is never called.
- **doc.md was rewritten 2026-09-11** (Joel: make the lede/doc.md first). The
  Design kept what held up — the `?` slot, the store's argument, "a game owns
  its whole menu" — and gained the four decisions it had not said: the
  submenu as one state with two shapes and one keyboard list, the menu
  answering its keys on its own element, the icon gutter as the legend, and
  stacking as a rung. The stores' and the icon note's docstrings now point at
  it instead of restating it.
- **Escape is handled on the popover element**, which is the shape
  `escapeListeners.test.ts` allows. Tab is consumed and closes, per the
  keyboard area's ruling; keyboard-shortcuts.md says the same.
- **The ARIA on the trigger and rows is load-bearing for the tests**
  (`role="menu"`, `menuitem`, `aria-expanded`, `aria-haspopup`) and stays;
  the two comments that justify it in screen-reader terms are the existing
  rationale and are left alone.
- **"hint" has ONE meaning in this repo and it is priced help** (Joel,
  2026-09-11), so the key label at the right edge of a row is the SHORTCUT,
  never the "shortcut hint". Six sites in this folder said otherwise and were
  changed: the stylesheet (twice), `menuModel.ts` (twice), the test file's
  header and one test name, and doc.md. Two uses of the ordinary English
  sense — a "background hint that it's interactive" — became "cue", which is
  the word the file already used a line later.
  **Bigger than this area, and NOT swept**: a rough grep outside the priced-
  help identifiers still matches hundreds of lines across the games and the
  docs, and no guard holds the word. Deciding whether that is a sweep plus a
  guard, or a rule that only applies going forward, is Joel's.
- **`todo.md` was empty at the opening** and the icons area's handoff — "a menu
  row picks its glyph by hand, so every game names the same action's glyph
  twice" — was not in it. That handoff is DONE: `menuRow` takes
  `icon ?? item.spec.icon` from the registry, and no game passes a glyph to a
  row. It holds one Maybe now, from F-12: a disabled row cannot say why.
- **F-9's question is answered, and the reason holds in today's terms.** "Is
  the trigger still the thing that would swallow a board key?" — yes:
  `onTriggerKeyDown` stops propagation while the trigger has focus, and the
  dispatcher listens on `window`, so a focused trigger keeps every key from it
  and Enter reopens the menu. docs/ui.md → Focus already says it that way.
- **The re-read looked at two things and left them.** The `popoverId` and
  `.item:focus-visible` comments argue in screen-reader and forced-colors
  terms; they are the existing ARIA rationale the Notes above keep. And
  docs/ui.md → Z-index quotes `--z-menu`'s number; a doc may state a value
  that base.css owns, and it is right today.

## Predicted test breaks

*(written when the area starts changing things)*

- F-menu-1 and F-menu-2: nothing red today, which is the fault — the probe's
  three specs go into `Menu.test.tsx`, two for F-1 (added with its fix) and
  one for F-2. ALL THREE ARE IN, each planted against the code it describes.
- F-menu-4: the whole existing suite is the check — 53 tests, green through
  the merge.
- F-menu-3: none; no caller, no spec.
- F-menu-12: CSS modules are proxies under vitest, so nothing runs
  differently; the guard's `pending` rows must shrink as each value converts,
  or the guard fails on the stale row.
- F-menu-16: one spec rewritten, not added — the Tab spec pins the consumed
  key instead of the menu merely closing. Planted both ways.

## Closing

- [x] the whole area re-read in one sitting after the last group (2026-09-11,
      F-15 through F-22, all worked)
- [x] the folder's `doc.md` Design harvested — the hybrid and the gutter were
      already there from the rewrite; the re-read added the marks (sized by
      the label, one ink, the two exceptions) and corrected the paused page
- [x] `todo.md` holds everything still owed; nothing durable left in this file
- [x] every file on the roster blessed, or its stamp says why not (Joel,
      2026-09-11: "bless the files here and close and commit" — the nine code
      files; the stamp tool takes no markdown)
