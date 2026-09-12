# Area: menu

The folders it reads: `menu`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN 2026-09-11.** Roster agreed (Joel: "audit the area") and
stamped `cs-audited-menu`. Findings recorded from one read of all eleven
files. The prose findings were worked first, on Joel's ask ("make the
lede/doc.md and fix docstrings and missing docstrings — this will help me
understand this section"): F-6, F-7, F-8, F-10 and F-11 are WORKED, F-9 in
this folder's files; the behavior, shape and stylesheet findings wait. The three behavior findings (F-1, F-2 and the
masked half of F-2) were CHECKED with a throwaway spec before being written
down, since last area's reading was wrong in the direction of "nothing is
wrong here" three times; the spec was deleted after the run.

## The roster

All in `src/common/menu/`:

| file | what it is |
|---|---|
| `Menu.tsx` + `.module.css` + `.test.tsx` | the one component: the chevron-wrapped trigger, the popover, the keyboard contract, the submenu hybrid (flyout on desktop, drill-down on mobile), the icon gutter |
| `menuModel.ts` | the row, section and header types, `menuRow` (what the menu draws for a row), `MenuApi` |
| `gameMenu.ts` + `.test.ts` | `buildGameMenu`: the framing every game's menu shares |
| `gameMenuStore.ts` + `.test.ts` | the sections a game has pushed |
| `pageMenuStore.ts` | how to open the page's menu, for the `?` key |
| `doc.md` | lede + Design, present (not on `DESIGNS_OWED`) |
| `todo.md` | empty |

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

## F-menu-2 · `flyout-switch-loses-parent-index` · Opening a second flyout by click records its parent as row 0

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

## F-menu-5 · `useCallback-with-unstable-deps` · `openMenu` is memoized on a fresh array

`openMenu`'s deps are `[flatRows]`, which is rebuilt every render, so the
callback — and the `useImperativeHandle` value hung off it — is new every
render. Harmless, and a claim the memo cannot keep. Minor: drop the memo, or
compute the first enabled row at call time.

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
  hint carries `padding-left: var(--spacer-1)` as its floor, both negative
  margins are gone, and the guard's spacer row lost `1.5rem` and `-1rem`. Not
  looked at on screen: that takes a run of the app, which is Joel's to okay.
- The item's `0.95rem` / `0.82rem` type against the ramp; the header's are
  the same two numbers.
- `opacity: 0.45` for a disabled row — whether buttons/forms settled a
  disabled treatment this should share.
- `--field-muted-ink-color` on `.itemIconSlot`, a FIELD token on a menu,
  three lines from `--page-text-muted-color` doing the same job on
  `.itemShortcut`, `.headerLine`, `.itemChevron` and `.itemBack`. One muted
  ink per file.
- `.chevron`'s `0.65em`, `.itemDot`'s `--dot-size: 0.7em`, `.itemIconSlot`'s
  `1.05rem` and the icon's `size={15}` — four sizes for marks in one row.

## F-menu-13 · `half-marked-groups` · Two selector groups mark their second selector only

`.trigger:hover,` / `.trigger[aria-expanded='true']` and
`.item:hover:not(:disabled),` / `.item:focus`: the marker sits on the second
line of each. `corecss.md` records the marking script doing exactly this and
`floating-panels` marked both lines of its scrim group. Say which is the
convention; make these two match it.

## F-menu-14 · `chevron-stroke-archaeology` · A number justified by a glyph that no longer exists

`strokeWidth={3}`, with a comment that it is "an IDENTITY rather than a tuned
number" because "the hand-drawn chevron this replaced was stroke 2 on a 16
viewBox". The old glyph is gone, so the number has no live referent. Either it
matches a mark on screen today, and the comment names that, or it is a tuned
number and says so.

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
- **`todo.md` is empty** and the icons area's handoff — "a menu row picks its
  glyph by hand, so every game names the same action's glyph twice" — is not
  in it. That handoff is DONE: `menuRow` takes `icon ?? item.spec.icon` from
  the registry, and no game passes a glyph to a row.

## Predicted test breaks

*(written when the area starts changing things)*

- F-menu-1 and F-menu-2: nothing red today, which is the fault — the probe's
  three specs go into `Menu.test.tsx`, two for F-1 (added with its fix) and
  one for F-2.
- F-menu-4: the whole existing suite is the check — 53 tests, green through
  the merge.
- F-menu-3: none; no caller, no spec.
- F-menu-12: CSS modules are proxies under vitest, so nothing runs
  differently; the guard's `pending` rows must shrink as each value converts,
  or the guard fails on the stale row.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design harvested (the hybrid, the gutter)
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
