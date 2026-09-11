# Area: lists

The folders it reads: `lists`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN 2026-09-11.** Roster agreed and stamped `cs-audited-lists`.
Every finding is worked except the near-misses in F-lists-11
(vocabulary-conversion), which want Joel and are now in the folder's `todo.md`.
Two were found while working others rather than in the audit read: F-lists-18
(segmented-listed-as-a-pattern) and F-lists-19 (ring-shows-unasked), the
second raised by Joel.

Still owed before this area can close: the folder's `doc.md` Design, the
whole-area re-read, and the blessing.

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
| `SelectionList.test.tsx` | written by this area — F-lists-2 (selection-list-untested) |
| `SimpleScrollableList.test.tsx` | written by this area — F-lists-2 (selection-list-untested) |
| `doc.md` | lede only; Design owed |
| `todo.md` | the near-miss values F-lists-11 surfaced |

Written by this area, and so on the roster too:

| file | what it is |
|---|---|
| `core-css/patterns/empty-state.css` | the shared `.emptyState` — F-lists-9 (empty-state-four-ways) |

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

**WORKED 2026-09-11 (Joel: "write test").** `SelectionList.test.tsx` — 43
tests: the cursor's arrival and blanking, clamped arrows, Home/End, a measured
page (with the heights stubbed, plus the fallback and the clamp past the end),
Enter acting and Space not, all seven keys trapped, disabled rows taking the
cursor and refusing both Enter and a click, click moving the cursor,
`frozen` ignoring keys and holding its ring through a blur, the shrink-under-
cursor clamp, the empty state, and `autoFocus`. `SimpleScrollableList.test.tsx`
— 6: rows vs the message inside the frame, and the tally.

Three jsdom gaps had to be stubbed: `scrollIntoView` doesn't exist,
`offsetParent` is always null (which the focus-on-arrival effect reads as "not
on screen"), and `clientHeight`/`offsetHeight` are 0, so a page cannot be
measured without saying what the heights are.

**Planting found a test that pinned the wrong thing.** "Fires once" originally
grew the list and asserted focus was not retaken — which passes with
`claimedFocus` deleted, because the effect's DEPS watch whether there is
content, not how much, so a growing list never re-runs it. The two halves fail
separately and are now two tests: a club arriving (the deps) and a list
emptying and refilling (the ref). Five other plants — Space activating, the
cursor not clamping, `frozen` blanking on blur, `disabled` ignored, the empty
message never rendered — were each caught by the test that claims them.

## F-lists-3 · `finding-id-in-code` · `SelectionList.tsx` cites `F15 (focus-on-every-refetch)`

Line 220, in the comment on `focusOnArrival`. A finding ID from a deleted
audit, in a durable file — the no-cite rule, and the number would be reused
by any area's fifteenth finding. The sentence around it is also archaeology
("used to re-run this and could take focus out from under you"). Say the
condition: the effect keys on *first content*, not on length, because the
clubs list is realtime and a friend's edit must not move focus.

**WORKED 2026-09-11 (Joel: "fix").** The ID and the archaeology are gone; the
comment states the condition — the effect keys on first CONTENT, and keying on
length would re-run when a friend adds you to a club.

**Five more finding IDs sat in durable files outside this area**, same defect,
and Joel said fix all: `ClubPage.tsx`, `PlayAreaErrorBoundary.tsx` and
`vocabularies.test.ts` cited `F39 (loading-and-errors)`, `ErrorPage.tsx` cited
`F37 (card-only-page)`, and `e2e/crosswords.e2e.ts` cited
`F50 (puzzle-source-picks-in-a-dialog)`. In every one the surrounding sentence
already said the condition, so the ID came out and nothing else changed.
`grep -rn "F[0-9]\+ \`" src e2e docs scripts supabase` is now empty.

## F-lists-4 · `docstring-marker-pass` · Every prop in the folder is a `/**` field

All three components put `/**` on each prop: `SelectionList`'s `Props<T>`
(eleven), `Activation<T>`'s `selected`, `SimpleScrollableList`'s five,
`FilterSelect`'s inline `label` and `className`, and `FilterOption.dot`. Props
are fields; a note on one takes `//`. The `/**` stays on the types, the
components and the two exported helpers. Same pass as `members` made.

**WORKED 2026-09-11 (Joel: "fix").** Every prop note in the folder is `//`:
`SelectionList`'s eleven, `SimpleScrollableList`'s five, `FilterSelect`'s
`label` and `className`, and `FilterOption.dot`. The `/**` stays where it
belongs — the four file/component docstrings, the `FilterOption` type, the six
exported helpers, and `pageSize()`.

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

**WORKED 2026-09-11 (Joel: "fix").** Five rewrites, none of which lost a
reason — each says the same thing about the code in front of the reader
instead of about how it got there:

- `SelectionList`'s "why a component" paragraph is now "why `items` +
  `renderRow` and not children", which is the question a caller actually has.
- `frozen`'s note keeps the swallowed-click hazard as a live consequence
  ("re-renders while the dialog is being clicked") rather than a bug it caused.
- `SelectionList.module.css`'s header says `fills` and `packed` are props so a
  page asks for a variant instead of reaching in with a descendant selector.
- `filterSelectHelpers.ts` drops the native-`<select>` history and the count of
  test files, and points at `FilterSelect.tsx` for the why.
- `FilterSelect.test.tsx`'s header is four lines and points, where it used to
  retell the focus story in full.

`FilterSelect`'s own docstring keeps the rule at full length, as the finding
said it should. `FilterSelect.module.css`'s header went earlier, with F-lists-8
(filter-select-density-inverted).

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

**PART-WORKED 2026-09-11 (Joel: "evaluate if they're useful; if so, update
them. else, trim them").**

Trimmed rather than updated, because each was a roster of callers and a roster
always rots — it had already:

- `SelectionList.module.css`'s header loses its list of sites (which is where
  the scrabble claim lived). The header says what the file paints.
- The `ref` prop's note loses ClubPage: it now says what the ref is FOR — a
  page putting the keyboard back on the list after a dialog closes — which is
  true of both callers and stays true of a third.
- `FilterSelect`'s lede loses "the in-game info-panel filters" for what the
  component does: narrows what a list or readout shows, and never takes focus.

`filterSelectHelpers.ts`'s two (the scope and the count of test files) went
with F-lists-5 (rationale-in-docstrings).

**STOPPED on the last one, because the finding understated it.** The `.popover`
and `.option` comments do not merely cite a TODO that isn't there — they both
assert usernames are UNCAPPED ("an uncapped username can be longer than
`.popover`'s max-width"). Usernames are capped at 15 characters by a CHECK on
`common.profiles` (`^[a-z][a-z0-9-]{2,14}$`, docs/common.md), and the cap's
stated reason is mobile legibility. So the premise is false, not just the
citation. Raised with Joel.

**RESOLVED 2026-09-11 (Joel: "don't ellipsize, those just take up precious
characters. we can just clip with overflow:hidden").** Both `text-overflow`
declarations are gone — `.label` on the closed select as well as `.option`,
since one component ellipsizing half its own text would be drift. `overflow:
hidden` and `white-space: nowrap` stay, so a long label is cut at the edge.

The `.popover` comment keeps the right-anchoring argument, which never
depended on the cap — a left-anchored list grows off-screen and widens the
document — and loses the sentence about uncapped usernames.

## F-lists-7 · `two-names-for-the-closed-button` · "trigger" and "closed select" for one element

The closed button is `.closedSelect` in both modules and "the closed select"
in the helpers and the test, but `FilterSelect.tsx`'s `className` prop says
"Merged onto the TRIGGER", docs/mobile.md says "`FilterSelect`'s club-page
trigger", and docs/ui.md's button-kind table names it "FilterSelect's
trigger" (there `trigger` is the KIND, which is fine — the kind's name is not
the element's). One name for the element. `closedSelect` is the one the CSS
already commits to.

**WORKED 2026-09-11 (Joel: "'trigger' is a bad name. 'closedSelect' is a
better name").** The two uses in the component are now "the closed select":
the `className` prop's docstring and the touch block's comment. docs/ui.md's
button-kind table keeps `trigger` — that is the kind, not the element.
docs/mobile.md's mention goes with F-lists-16 (mobile-md-wrong-rule), which
removes the line it sits in.

The `className` docstring was also STALE, a miss from F-lists-8
(filter-select-density-inverted): it still described the club page as wearing
its own surface + border treatment against an understated info-panel look.
Rewritten to what is true — the club page needs roomier padding to match the
mode buttons' height, and the look is otherwise the component's.

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

**WORKED 2026-09-11, but NOT by inverting.** Joel's ruling: rather than the
component going roomy and `.infoCol` tightening it, the two filters converge on
a single look — the darker divider border, `--radius-sm`, the fill + hover, and
an 11rem cap — and the component keeps the info column's tight PADDING as its
default. So the club page still differs, but on one property instead of seven,
and `.infoCol` declares no density tokens (Option A, the info column declaring
a density for everything inside it, was set aside as its own much larger piece
of work — it moves the turn log and every readout, not just the filter).

What moved: `FilterSelect.module.css` gains `background-color` + a `:hover`,
`4px` becomes `--radius-sm`, and the cap goes 9rem → 11rem.
`clubFilters.module.css`'s `.closedSelect` is down to `padding` alone and its
`:hover` is gone. Visually, only the two in-game filters change — a white fill
on the #fafafa play area where they were transparent, a hover tint, and a later
ellipsis. The club page's radius goes 6px → 4px.

Two of the seven overrides were dead before this (`font-size: 0.8rem` and
`color`, both byte-identical to the component's), which is why the club page
loses more than it visibly had.

Also done here, being the same rules: the header's claim to be "pixel-matched
to the old `.select` in infoPanel.module.css" (no such rule exists — F-lists-6)
and the `.option` copy of it; the doubled touch comment, folded; and
`.option`'s own `4px` → `--radius-sm`, so the file does not use two spellings
of one radius (F-lists-11's silent row for this file, now empty).

The vocabularies guard needed three pending rows edited: `clubFilters`'
`0.8rem` and `1px` are gone from the file, and `FilterSelect`'s `4px` row with
them.

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

**WORKED 2026-09-11 (Joel).** A pattern class, and all four converted now
rather than two now and two per-area — `core-css/patterns/empty-state.css`,
class `.emptyState`, loaded from `main.tsx`. It carries the inset
(`--spacer-3`, my pick — between `SelectionList`'s 1rem and `TurnLog`'s
0.6rem, and exactly `TurnLog`'s horizontal), `--page-text-muted-color`,
`--font-size-1` (Joel's, over the `--font-size-2` first written) and
**oblique**, which he kept and which was `WordList`'s alone. Not centered, so
`WordList` loses its `text-align: center`.

It goes in `patterns/` and not `utilities.css` because that file's own header
draws the line: a class that names a THING goes to `patterns/`, one per file.

**The class is self-sufficient and the two `muted` pairings are gone.**
`utilities.css` loads after `patterns/`, so a leftover `muted` would have won
the font-size at equal specificity and left two empty states a hair apart —
which is also why the pattern owns the size rather than borrowing `.muted`'s
off-scale `0.9rem`.

`SelectionList.empty`, `WordList.empty` and `TurnLog.turnLogEmpty` are deleted;
`SimpleScrollableList.emptyRow` survives as `height: auto` alone, exempting the
message from `.scrollBox > *`'s fixed row height so its inset is not clipped.
That also settles F-lists-12 (dead-declarations)'s `.emptyRow` line, which is
now an active override rather than a duplicate.

An earlier reading of this finding said `SelectionList` asked its CALLERS to
apply `muted`. Wrong — the component applied it itself, as did `TurnLog`. The
drift was in mechanism (two used the class, two hand-rolled the color, and so
also differed in size), not in caller burden.

## F-lists-10 · `custom-property-spelling` · Two spellings of a scoped token in one folder

`--simpleScrollableList-row-height` / `-rows` / `-pad` are camelCase-prefixed;
`--filter-select-dot` is kebab. The repo has both conventions (`--iconButton-size`,
`--pageHeader-height`, `--entryBox-font-size` on one side; `--info-col-width`,
`--dot-size`, `--logo-size` on the other) and no doc rules on it. Two things
to decide: which spelling, and where that rule lives (docs/code-conventions.md).
This folder then follows it; the rest converts area by area.

**WORKED 2026-09-11 (Joel: "we specifically agreed on the `infoCol-width`
style names… if we don't say that clearly, please add it").** The rule is that
a bucket naming a COMPONENT keeps the component's own spelling, because the
bucket is a pointer to a file and kebabing it breaks the grep. A bucket naming
a CONCEPT (`--page-*`, `--board-*`, `--toast-*`, every `--<game>-*`) stays
kebab — there is no identifier to preserve.

It was NOT written down. docs/ui.md's token grammar had the neighboring rule
("hyphens separate different questions; camelCase joins words that answer
one") and all its camelCase examples are multi-word qualities — `inFlight`,
`gameOver`, `terminalFrame` — never a component identifier. Added there, beside
that bullet, as its own item saying it is a different rule and why.

`--filter-select-dot` → `--filterSelect-dot`, its three uses plus a mention in
`core-css/todo.md`.

**Two other tokens are out of step, both outside this area.** `--info-col-width`
(`InfoCol`) is read by every game's `PlayArea.module.css` — a wide rename that
belongs to `game-page`; and `--rank-bar-edge-color` / `--rank-bar-fill-color`
(`RankBar`) belong to `rank-ladder`. Recorded here so neither is lost; not
touched, since the conversion Joel authorized was this area's.

`--gamelist-*` is a judgment call for whoever opens the club area: there is no
`GameList` component, so the bucket may be a concept and already correct.

## F-lists-11 · `vocabulary-conversion` · The raw values, and which are decisions

Per §5, silently where a value equals a step, surfaced where it does not:

`FilterSelect.module.css` —
- `border-radius: 4px` (closed select, option) = `--radius-sm`. Silent —
  **done** with F-lists-8 (filter-select-density-inverted).
- `border: 1px` ×2 = `--border-width-line`. Silent.
- `opacity: 0.7` (caret) = `--opacity-1`. Silent.
- `font-size: 0.8rem` ×2 — nearest `--font-size-2` (0.85rem). Near-miss,
  and still open: F-lists-8 (filter-select-density-inverted) left the size
  alone, since both filters already agreed on it.
- `font-size: 1rem` (touch option) = `--font-size-1`. Silent.
- gaps `0.25rem` = `--spacer-5`, `0.35rem` — near-miss. Paddings are parked
  (`0.05rem 0.3rem`, `0.15rem`, `0.25rem 0.45rem`, `0.6rem 0.75rem`); the
  `top: calc(100% + 2px)`, `max-width: 11rem / 14rem / min(18rem, 80vw)` are
  bespoke-by-intent and want the annotation §7's first item is about.

`SelectionList.module.css` —
- `gap: 0.6rem` and `0.85rem` — recorded in the guard as "moved, not
  chosen". Surface: `0.6` is between `--spacer-4` and `-3`; `0.85` between
  `-3` and `-2`.
- `padding: 0.5rem 0.9rem` / `0.4rem 0.9rem` — parked (padding), and the
  module already writes the bespoke annotation by hand.
- `.empty { padding: 1rem }` — gone with F-lists-9 (empty-state-four-ways);
  the shared `.emptyState` uses `--spacer-3`.
- `outline-offset: -2px` — docs/ui.md's ring table names `-2px` for "abuts";
  is that a token yet? `focus-ring.css` owns the answer.
- `box-shadow: inset 0 0 0 2px` — gone with F-lists-1
  (select-kind-unused); nothing to decide.

`SimpleScrollableList.module.css` — `1.4rem` row height, `0.15rem` pad:
bespoke-by-intent (the box owns the row height by design).

**PART-WORKED 2026-09-11.** The silent conversions are done, all in
`FilterSelect.module.css`: `border: 1px` ×2 → `--border-width-line`,
`opacity: 0.7` → `--opacity-1`, the touch `font-size: 1rem` →
`--font-size-1`, `gap: 0.25rem` → `--spacer-5`. Four pending rows in the
vocabularies guard shrank or went with them, and `--opacity-1` came off
`cssTokens.test.ts`'s `DECLARED_AHEAD` — it had no reader before this.

`outline-offset: -2px` is CLOSED (Joel: "yes, close"). It is not a token and
should not be: `focus-ring.css` tokenizes the ring itself and names three
offsets that each follow from what the element sits against, `-2px` being the
one for an element that abuts its neighbors. The reasoning is already written
down there.

The near-misses are still open and want Joel: `font-size: 0.8rem` ×2 against
`--font-size-2` (0.85rem), `gap: 0.35rem`, and `SelectionList`'s gaps `0.6rem`
and `0.85rem` (recorded in the guard as "moved, not chosen"). Paddings stay
parked.

## F-lists-12 · `dead-declarations` · Leftovers from when a row was a button

`SelectionList.module.css` `.row` sets `text-align: left` and
`color: var(--page-text-color)` — a `<div>` inherits both; these are a
`<button>` reset with no button. `SimpleScrollableList.module.css`
`.emptyRow` sets `height: var(--simpleScrollableList-row-height)` under a
`.scrollBox > *` rule that already sets it on every child. Delete the three
lines. (Both `outline: none`s in `FilterSelect.module.css` are earned —
the comment says why — and stay.)

**The `.emptyRow` line went with F-lists-9 (empty-state-four-ways)**, and not
by deletion: it is now `height: auto`, an exemption from `.scrollBox > *` so
the shared inset is not clipped.

**WORKED 2026-09-11 (Joel: "fix").** `.row`'s two lines deleted. Checked
first rather than assumed: the page's ink is set once, on the `body` rule at
`base.css:617`, and inherited by everything — so the row was restating it;
`text-align: left` is `start`, the inherited default, under a `.list` that
sets neither.

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

**CLOSED 2026-09-11 (Joel: "its fine; it's not an icon, keep it as is").** The
glyph stays where it is. Taking the finding's other branch, the reason is now
in `Caret`'s docstring so this is not re-raised: the registry names glyphs that
stand for something a reader has to learn, and this is the shape of the
control itself.

## F-lists-14 · `scroll-into-view-every-render` · The cursor row's ref is a fresh function per render

`ref={showCursor && i === cursor ? (el) => el?.scrollIntoView(…) : undefined}`
creates a new callback each render, so React detaches and reattaches it and
`scrollIntoView` runs on every render of a focused list — every realtime
update of the clubs list, every filter keystroke on the club page. With
`block: 'nearest'` that is a no-op when the row is visible, so nothing is
wrong on screen. Note it; the cheap fix is a `useEffect` on `[cursor,
showCursor]` scrolling `listRef.current.children[cursor]`. Low priority; a
no-op that runs often is still a no-op.

**WORKED 2026-09-11 (Joel: "ok, fix").** A `useEffect` on `[cursor,
showCursor]` scrolling `listRef.current.children[cursor]`; the row's `ref` is
gone.

The "still a no-op" above undersells it, and the record should say so: `nearest`
is a no-op only while the cursor row is ALREADY visible. Scroll away from the
cursor with the wheel and any unrelated re-render — a realtime club rename, a
filter keystroke — pulls the list back to it. Not reproduced, but it is a
scroll jump rather than nothing.

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

## F-lists-18 · `segmented-listed-as-a-pattern` · Two files call the segmented control a `patterns/` file

docs/ui.md's `core-css/` map listed the patterns as "badge, focus-ring,
heading, page, segmented", and `utilities.css`'s own header says a class
naming a thing goes to "patterns/ for the badge, the segmented control, the
heading row". There is no `patterns/segmented.css`: it is
`common/buttons/Segmented.module.css`, a component module, which is the OTHER
half of the same sentence's rule ("the component's own module when the thing
has one").

Found while placing `empty-state.css`, since that header is what decided where
the new file went.

**WORKED 2026-09-11 (Joel: "no, fix it now. who cares if corecss is paused?
not me. just fix it now").** All three say it correctly: `utilities.css`'s
header and `core-css/doc.md` now list the empty state among the patterns and
put the segmented choice with the components, and docs/ui.md's map was
corrected when the file was placed.

## F-lists-19 · `ring-shows-unasked` · The row ring appears to players who never touch a key

**Not from the audit read — Joel raised it 2026-09-11**, working out the
cursor rules for `plans/keyboard-nav-plan.md` and noticing they apply here
first.

The app has two kinds of cursor. A **geographic cursor** answers *where am I on
this board* (crosswords' cell, scrabble's and bananagrams' `gridCursor`); you
need it to read the board, so it always shows. A **selection cursor** is an
alternative to clicking and answers *which row would Enter act on*; a mouse
user has no use for one. `SelectionList`'s is the second kind and behaved like
the first: the ring appeared on focus, and both page lists autofocus, so a
mouse user landing on the homepage met a blue ring having touched nothing.
Clicking a row painted one too.

Half of this was already written in keyboard-nav-plan.md ("hidden until you
press an arrow", "a click sets the cursor and hides it") as a flat rule for the
boards it covers, with no account of why crosswords and scrabble don't obey it.
The taxonomy is what was missing, and it is now that plan's first section.

**WORKED 2026-09-11.** `revealed` state, separate from `movedTo` so a click can
set the cursor without showing it. A relative key (arrows, PageUp/PageDown)
reveals on its first press without moving; an absolute one (`Home`, `End`)
reveals and moves together; `Enter` is INERT until an arrow has revealed the
cursor — it neither acts nor reveals. Joel's call, over the reveal-on-Enter
first agreed: a key that seems dead invites a second press, and that press
would commit. The other refinement, the absolute/relative split, stands as
agreed — revealing at the resting row would ignore what `End` asked for.

Three crosswords picker tests drove `{ArrowDown}{Enter}` or `{Enter}` and now
need the reveal press. Fixed with the change.

Note the shape: this brings back the second state variable F-lists-1
(select-kind-unused) deleted. `movedTo` is where the cursor is; `revealed` is
whether to paint it. Same shape, different meaning.

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
  **Removed 2026-09-11** (Joel: "i don't know the history; we can remove the
  todo if you think it's already here"). It is: `.packed .row` says in its own
  comment that it exists for rows carrying two lines of text, and four call
  sites pass it. `todo.md`'s two Soon items went with F-lists-9
  (empty-state-four-ways) and F-lists-8 (filter-select-density-inverted), and
  the near-misses F-lists-11 (vocabulary-conversion) surfaced take their
  place.
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
