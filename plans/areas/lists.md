# Area: lists

The folders it reads: `lists`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN 2026-09-11.** Roster agreed and stamped `cs-audited-lists`;
seventeen findings recorded, F-lists-1 (select-kind-unused) worked.

## The roster

All in `src/common/lists/`:

| file | what it is |
|---|---|
| `SelectionList.tsx` | the pick-one list: container holds focus, arrows move a cursor, Enter acts |
| `SelectionList.module.css` | its frame, row, hairline and cursor mark |
| `SimpleScrollableList.tsx` | a framed `<ul>` that shows N rows and scrolls past that |
| `SimpleScrollableList.module.css` | the cap stated in rows, the tally line |
| `FilterSelect.tsx` | the never-focused dropdown that filters a view |
| `FilterSelect.module.css` | its closed select, popover, options, discs |
| `filterSelectHelpers.ts` | test helpers for driving a `<FilterSelect>` |
| `FilterSelect.test.tsx` | the one spec in the folder |
| `doc.md` | lede only; Design owed |
| `todo.md` | two Soon items, one Maybe |

Left off, agreed at the opening: the e2e specs that drive these from a page
(`club-filters`, `club-keyboard`, `home-keyboard`) and `vocabularies.test.ts`,
which is a guard.

**Callers, for evidence (read, not stamped).** `SelectionList`: `HomePage`
(clubs), `ClubPage` (start list + games list), crosswords' three picker modals.
Every one is the "do now" kind. `SimpleScrollableList`: `AnagramDialog`, alone.
`FilterSelect`: `useWordListFilter` (two), `useTurnLogPlayerPicker`, and the
club page's `GametypeFilter`. `filterSelectHelpers`: six test files.

## Findings

### Code

## F-lists-1 · `select-kind-unused` · The "select" kind has no caller

`SelectionList`'s `Activation<T>` union offers `selected` + `onSelect`, with
its own keyboard (Space selects), its own mark (`.selected`, an inset
box-shadow in the tile's edge color), a cursor that starts on the selected
row, and a docs/ui.md subsection. Nothing renders it: all six call sites are
`onActivate`. The crosswords library picker's docstring records that it moved
OFF this arm ("click or Enter both mean play this"). The kind is designed and
documented against zero uses, and the "select" column of ui.md's key table
describes behavior no page has.

Not proposing removal on my own ("don't remove unprompted"); the choices are
keep it as a designed-ahead kind, or drop the arm, the Space branch, the
`.selected` rule and the ui.md column together. A decision for Joel.

**WORKED 2026-09-11 (Joel: "q1. drop it").** The arm is gone: `Activation<T>`
with it, `onActivate` now a required prop, and `isSelectKind` / `selectedIndex`
/ `resting` deleted. The cursor's two state variables collapsed to one —
`moved` existed only because the select kind's resting row arrived with the
data, so `movedTo` alone is now the cursor and the `useState`-initializer
comment went with it. `Space` keeps its `preventDefault` and does nothing else,
or it would page the scroll box. `.selected` and its comment are out of the
module (`--tile-selected-edge-color` keeps its other reader,
`PlayArea.module.css`), and the module's "The two marks" heading is now "The
cursor". docs/ui.md's key table lost its two-kind columns and "The two kinds,
and the two marks" is now "Choosing, and the one mark".

Two crosswords comments named `selected`/`onSelect` as a shape the picker could
be put back on — `LibraryPickerBlockingModal.tsx`'s docstring and its test's
header. Both now state the rule without the prop pair, since it no longer
exists to return to.

## F-lists-2 · `selection-list-untested` · The component with the most behavior has no spec

`SelectionList.tsx` carries the folder's whole keyboard model — clamped
arrows, Home/End, a measured page, Enter acting and Space not, disabled rows
that take the cursor and refuse Enter, `frozen` holding the ring through a
blur, focus-on-arrival firing once and yielding to an existing focus, the
cursor clamping when the list shrinks under it, click moving the cursor. None
of it has a unit test; `FilterSelect.test.tsx` is the folder's only spec.
The two e2e specs cover arrows, Home/End, Enter and Space on the homepage
and arrows + Enter on the club page; PageUp/PageDown, disabled rows, `frozen`,
the focus-on-arrival guard and the shrink-under-cursor clamp are covered by
nothing. `SimpleScrollableList` has no spec either (its one branch is the
empty test on `children`).

Write `SelectionList.test.tsx` (and a small `SimpleScrollableList.test.tsx`).
A file per unit.

## F-lists-3 · `finding-id-in-code` · `SelectionList.tsx` cites `F15 (focus-on-every-refetch)`

Line 220, in the comment on `focusOnArrival`. A finding ID from a deleted
audit, in a durable file — the no-cite rule, and the number would be reused
by any area's fifteenth finding. The sentence around it is also archaeology
("used to re-run this and could take focus out from under you"). Say the
condition: the effect keys on *first content*, not on length, because the
clubs list is realtime and a friend's edit must not move focus.

## F-lists-4 · `docstring-marker-pass` · Every prop in the folder is a `/**` field

All three components put `/**` on each prop: `SelectionList`'s `Props<T>`
(eleven), `Activation<T>`'s `selected`, `SimpleScrollableList`'s five,
`FilterSelect`'s inline `label` and `className`, and `FilterOption.dot`. Props
are fields; a note on one takes `//`. The `/**` stays on the types, the
components and the two exported helpers. Same pass as `members` made.

## F-lists-5 · `rationale-in-docstrings` · The docstrings tell the history, not the use

Each component's docstring spends most of its length on why it is shaped
this way rather than when to reach for it:

- `SelectionList`: the "Why a component and not a CSS pattern" paragraph
  ("written out by hand at three call sites… cursor index threaded down as a
  prop… which is the duplication being removed") is how it used to work.
  The `frozen` prop's note ends with the bug it once caused ("used to land
  BETWEEN the mousedown and the click… so Cancel did nothing").
- `SelectionList.module.css` header: "a page used to reach in and restyle
  `.item-row`".
- `FilterSelect.module.css` header: "pixel-matched to the old `.select` in
  infoPanel.module.css… While the turn-log picker is still native" — there
  is no `.select` in that file and the turn-log picker IS a `FilterSelect`.
  Stale as well as archaeological.
- `filterSelectHelpers.ts`: "These used to be native `<select>`s, so tests
  reached for `getByRole('combobox')`".
- `FilterSelect.test.tsx` header retells the focus story the component
  already tells.

Keep the rule ("a native select takes focus and nothing gives it back") in
ONE place — `FilterSelect`'s docstring owns it — and let the rest point.
`FilterSelect`'s own docstring is the right length for a component whose
whole reason is one property; the fold-in is the other files.

## F-lists-6 · `stale-caller-claims` · Callers named that do not exist, and scope that has grown

- `SelectionList.tsx` "do now" gloss: "the suggested move stages on the
  board" — scrabble's suggest box is not a `SelectionList` (its `todo.md`
  says it did not fit). `SelectionList.module.css` header lists "scrabble's
  suggested moves" among the sites.
- `SelectionList.tsx` `ref` prop: "ClubPage compares it against
  `document.activeElement` to toggle Tab between its two lists" — that is
  `useTabRing`'s now; ClubPage compares nothing. The other half (focuses it
  when a setup dialog closes) is true.
- `FilterSelect.tsx` docstring: "A dropdown for the **in-game** info-panel
  filters (… and the turn log's player picker next)". The turn log has it,
  and so does the club page's gametype filter, which is not in-game. Same in
  `filterSelectHelpers.ts` ("the in-game info-panel filters").
- `filterSelectHelpers.ts`: "seven test files drive these pickers" — six
  today, and a count. Say the condition (every spec that renders a filter).
- `FilterSelect.module.css` `.popover`: "docs/mobile.md still carries 'cap
  handles at 10' as a TODO" — mobile.md has no such line.

## F-lists-7 · `two-names-for-the-closed-button` · "trigger" and "closed select" for one element

The closed button is `.closedSelect` in both modules and "the closed select"
in the helpers and the test, but `FilterSelect.tsx`'s `className` prop says
"Merged onto the TRIGGER", docs/mobile.md says "`FilterSelect`'s club-page
trigger", and docs/ui.md's button-kind table names it "FilterSelect's
trigger" (there `trigger` is the KIND, which is fine — the kind's name is not
the element's). One name for the element. `closedSelect` is the one the CSS
already commits to.

## F-lists-8 · `filter-select-density-inverted` · The component states the tight look and the club page loosens it

Carried in from `todo.md` (Soon). `FilterSelect.module.css` states the info
column's look — `0.8rem`, `0.05rem 0.3rem` padding, a divider-colored `1px`
border, `4px` radius, `9rem` max-width — and `clubFilters.module.css`
overrides font-size, padding, max-width, border, radius, background and
color on the same element to get the page's surface treatment. That is the
locked rule backwards (docs/naming.md → tuned / justified / locked: "the
component states the ROOMY default and the surface tightens it, never the
reverse"). naming.md even names the mechanism — `.infoCol { --spacer-2: …;
--font-size-2: … }` — and `.infoCol` declares no such thing today; it sets
`--z-host` and layout only.

The work: the component's closed select and options read the page tokens
(`--font-size-2`, a spacer, `--radius-md`, the surface border), the info
column re-points the few it tightens, and the club page's `.closedSelect`
override shrinks to whatever is genuinely the pair-with-`.modeOption` rule.
Touches `clubFilters.module.css` and `PlayArea.module.css` (`.infoCol`); the
decision is this folder's, so the edit ships here. `clubFilters.module.css`
also carries two consecutive comments on its touch rule saying the same
thing twice; fold them when the file is open.

## F-lists-9 · `empty-state-four-ways` · The "nothing here" line is written four times

Carried in from `todo.md` (Soon), and the count grew: `SelectionList.empty`
(`1rem` padding, `muted` class from the caller), `SimpleScrollableList.emptyRow`
(a row-height `<li>`, `--spacer-5` inline, muted color inline),
`WordList.empty` (oblique, centered, `16px 8px`), `TurnLog.turnLogEmpty`
(`0.6rem 0.75rem`). Four paddings, three ways of saying muted, one oblique.
docs/ui.md → Selection lists already states the rule ("the frame is always
drawn, and every no-rows state goes inside it — paired with `muted`"). This
folder can settle its own two now (one inset, `muted` applied by the
component rather than asked of every caller); the two readouts convert when
`word-list` and `turn-log` open, and the item stays in their `todo.md`s.
Decide here whether the inset is a pattern class or a token.

## F-lists-10 · `custom-property-spelling` · Two spellings of a scoped token in one folder

`--simpleScrollableList-row-height` / `-rows` / `-pad` are camelCase-prefixed;
`--filter-select-dot` is kebab. The repo has both conventions (`--iconButton-size`,
`--pageHeader-height`, `--entryBox-font-size` on one side; `--info-col-width`,
`--dot-size`, `--logo-size` on the other) and no doc rules on it. Two things
to decide: which spelling, and where that rule lives (docs/code-conventions.md).
This folder then follows it; the rest converts area by area.

## F-lists-11 · `vocabulary-conversion` · The raw values, and which are decisions

Per §5, silently where a value equals a step, surfaced where it does not:

`FilterSelect.module.css` —
- `border-radius: 4px` (closed select, option) = `--radius-sm`. Silent.
- `border: 1px` ×2 = `--border-width-line`. Silent.
- `opacity: 0.7` (caret) = `--opacity-1`. Silent.
- `font-size: 0.8rem` ×2 — nearest `--font-size-2` (0.85rem). Near-miss;
  and it is the value F-lists-8 (filter-select-density-inverted) moves
  anyway, so decide it there.
- `font-size: 1rem` (touch option) = `--font-size-1`. Silent.
- gaps `0.25rem` = `--spacer-5`, `0.35rem` — near-miss. Paddings are parked
  (`0.05rem 0.3rem`, `0.15rem`, `0.25rem 0.45rem`, `0.6rem 0.75rem`); the
  `top: calc(100% + 2px)`, `max-width: 9rem / 14rem / min(18rem, 80vw)` are
  bespoke-by-intent and want the annotation §7's first item is about.

`SelectionList.module.css` —
- `gap: 0.6rem` and `0.85rem` — recorded in the guard as "moved, not
  chosen". Surface: `0.6` is between `--spacer-4` and `-3`; `0.85` between
  `-3` and `-2`.
- `padding: 0.5rem 0.9rem` / `0.4rem 0.9rem` — parked (padding), and the
  module already writes the bespoke annotation by hand.
- `.empty { padding: 1rem }` — F-lists-9 (empty-state-four-ways) decides it.
- `outline-offset: -2px` — docs/ui.md's ring table names `-2px` for "abuts";
  is that a token yet? `focus-ring.css` owns the answer.
- `box-shadow: inset 0 0 0 2px` — gone with F-lists-1
  (select-kind-unused); nothing to decide.

`SimpleScrollableList.module.css` — `1.4rem` row height, `0.15rem` pad:
bespoke-by-intent (the box owns the row height by design).

## F-lists-12 · `dead-declarations` · Leftovers from when a row was a button

`SelectionList.module.css` `.row` sets `text-align: left` and
`color: var(--page-text-color)` — a `<div>` inherits both; these are a
`<button>` reset with no button. `SimpleScrollableList.module.css`
`.emptyRow` sets `height: var(--simpleScrollableList-row-height)` under a
`.scrollBox > *` rule that already sets it on every child. Delete the three
lines. (Both `outline: none`s in `FilterSelect.module.css` are earned —
the comment says why — and stay.)

## F-lists-13 · `caret-outside-the-registry` · `FilterSelect` draws its own glyph

`Caret` is an inline SVG in `FilterSelect.tsx`; every other glyph comes from
`icons.ts` under the name of what it means (`IconMenuChevron` is "this opens
a menu of commands"). The module's comment is right that this is a different
meaning — "choices live here" — but the registry is where a meaning gets a
glyph. Either register it (`IconChoicesCaret`, say, a lucide `ChevronDown`
at a small size — or the same solid triangle as a tiny custom element,
which the registry already does for `IconMenuChevron`'s cousin) or write
down why a native-select-shaped triangle is the one glyph that lives with
its component. `icons` is closed and blessed, so adding a name there is a
two-line conformance edit, not a reopening.

## F-lists-14 · `scroll-into-view-every-render` · The cursor row's ref is a fresh function per render

`ref={showCursor && i === cursor ? (el) => el?.scrollIntoView(…) : undefined}`
creates a new callback each render, so React detaches and reattaches it and
`scrollIntoView` runs on every render of a focused list — every realtime
update of the clubs list, every filter keystroke on the club page. With
`block: 'nearest'` that is a no-op when the row is visible, so nothing is
wrong on screen. Note it; the cheap fix is a `useEffect` on `[cursor,
showCursor]` scrolling `listRef.current.children[cursor]`. Low priority; a
no-op that runs often is still a no-op.

### Prose elsewhere, turned up by this area's reading

## F-lists-15 · `deferred-md-stale-dot-line` · docs/deferred.md says the filter cannot show a dot

The struck-through "Filter dropdown on the WordList" item ends: "The
per-player options are NOT yet self-labeled with their color dot — a
`<select>` can't hold one; that would need a custom listbox, and it isn't
worth one here." It is one now, and it does. Docs describe now; drop the
sentence.

## F-lists-16 · `mobile-md-wrong-rule` · docs/mobile.md files the club-page filter under the iOS floor

mobile.md → the 16px rule lists "`FilterSelect`'s club-page trigger" among
the five sites that apply `max(16px, 1em)` against iOS focus-zoom.
`clubFilters.module.css` says, twice, that it is NOT that: a button that
never takes focus cannot trigger focus-zoom, and the size is a tap-target
choice. mobile.md's list should lose it (and "five" with it — a count).

## F-lists-17 · `code-conventions-host-census` · "exactly one does today" in the z- layers section

docs/code-conventions.md → The z- layers says a host that isn't the page
sets `--z-host`, "and exactly one does today: `.infoCol`". A census; it rots
the day a form hosts a filter. Say the condition (a host that is not the
page declares it) and let the reader grep.

### Ruled already, recorded so the re-read does not re-raise them

- **`FilterSelect`'s private Escape listener** bypasses `usePanelEscape`.
  Joel, during the actions sprint: leave it; it is `floating-panels`' to
  decide alongside `InfoSheet`'s and `DefinitionPopover`'s.
- **`role="group"` / `aria-label` / `aria-expanded` / `aria-hidden`** stay:
  existing ARIA is kept, and the test helpers key on `aria-expanded`.

## Notes

- **`todo.md`'s Maybe item contradicts the code.** "A two-line density
  variant of the list row, when it has a consumer" — `packed` IS the
  two-line density, and the club page and crosswords' pickers consume it.
  Either the item meant something else (a THIRD density?) or it predates
  `packed`. Ask at the first working session; if the latter, it goes.
- **`SelectionList`'s `disabled` + `rowTitle`** have one caller each (the
  club page's start list, for a game the member count does not fit). Fine —
  one is a caller — but the docstring's "in practice, why a disabled one
  does nothing" is that caller's story; keep the prop generic.
- **`FilterSelect.test.tsx` selects on `[class*="dot_"]`**, which depends on
  the CSS-module class strategy in vitest (`css: false`, so the proxy's
  spelling). It passes today; a static guard on class existence is the
  memory's rule if it ever flakes.
- **`--chrome-cursor-ring`** is declared in `patterns/focus-ring.css`, not
  `base.css`; `SelectionList.module.css` reads it. Fine, noted so the
  token-exists check does not fail from the wrong file.
- **docs/ui.md → Selection lists** held up on every check except the ones
  above (the "select" column, F-lists-1). Its list of non-members
  (`ColorChoiceList`, `HintList`, `SelectField`) all exist.

## Predicted test breaks

*(written when the area starts changing things)*

- F-lists-1 (select-kind-unused), if the arm goes: none — nothing renders it.
  Confirmed: the full unit suite and both touched folders' lint pass unchanged.
- F-lists-8 (filter-select-density-inverted): `e2e/club-filters.e2e.ts` reads
  labels, not sizes; the vocabularies guard's `FilterSelect.module.css` rows
  shrink.
- F-lists-13 (caret-outside-the-registry): `FilterSelect.test.tsx`'s
  `filterValue` reads `textContent`, which an SVG does not add to; safe.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design written; its row off `DESIGNS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
