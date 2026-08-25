# SelectionList — the plan

**A PLAN, not a description.** It is here to be built and then deleted. The
durable parts fold into [docs/ui.md](../docs/ui.md) when the last site converts,
and this file goes away with them.

The finding it answers is **F38 (`selection-lists`)** in
[areas/homepage.md](areas/homepage.md), which absorbed three others — F11
(`list-cursor-written-twice`), F15 (`focus-on-every-refetch`) and F24
(`empty-list-keeps-box`) — and holds F3 (`home-keyboard-spec`)'s blocking
question.

## What a SelectionList is

**A list you move a cursor through and choose from.** The name is deliberate:
"list" alone also means a plain bulleted list of text, which is most of what the
word points at in this repo (every game's Help panel, for one) and is emphatically
not this.

It is a **React component, not a CSS pattern**, because the duplicated part is
behavior. The paint is four rules; the behavior is a cursor, a focus contract,
six keys, a live-clamping index and a scroll-into-view, which before this pass
was written out by hand at three call sites:

| written three times | where |
|---|---|
| the ring class on the cursor row | `HomePage.tsx:299` · `StartGameButtons.tsx:92` · `ClubGameCard.tsx:178` |
| `scrollIntoView({ block: 'nearest' })` | `HomePage.tsx:294` · `StartGameButtons.tsx:94` · `ClubGameCard.tsx:168` |
| the cursor index threaded down as a prop | `ClubPage.tsx:1112` (`cursor=`) · `ClubPage.tsx:1179` (`kbCursor=`) |

And once, for one list, the same predicate was written twice — `playerCountFits`
decided the paint in `StartGameButtons` and decided again whether Enter acts in
`ClubPage`.

**This is why the component cannot take opaque children.** Given assembled React
elements it can count them but not see inside one, so the ring, the ref, the
disabled test and Enter all stay at the call site — which is the duplication
we are removing. It takes an items array and renders the row wrapper itself.

## The roster — five sites

| site | kind | status |
|---|---|---|
| the homepage's clubs | do now | **converted** |
| ClubPage — start a new game | do now | **converted** |
| ClubPage — your games | do now | **converted** |
| crosswords — the setup library picker | select | **converted** |
| scrabble — the AI's suggested moves | do now | **NOT converted — see below** |

### Scrabble's suggested moves does not fit, and needs a decision

It was on the roster and it should not have been. The box is a bare list of five
text lines with **no frame, no surface, no hairlines and no hover** — and it is
pinned to a fixed height, `5 rows × 1.35rem = 6.75rem`, whose comment says in
so many words that a growable height would shift the setup disclosure and the
Moves log below it.

A SelectionList row is ~2.4rem with its padding, so five of them are ~12rem.
Converting doubles the box and reflows the column, which is the one thing that
rule forbids. And the frame, the surface and the hairlines would arrive with it
— a visible redesign of a game's info column, in a game whose CSS area has not
run.

So it is left alone, and the choice is Joel's:

1. **Leave it bespoke**, like crosswords' clue lists — it is a list of five
   readouts you can click, and the family resemblance may be all there is.
2. **Give SelectionList a frameless, compact form** — a real new variant, not a
   density, since "no frame" contradicts *the frame is what says this is a
   list*.
3. **Redesign the box** to wear the frame, and re-do the height arithmetic. That
   is a scrabble-area decision.

### What is NOT one, and why

Ruled out by Joel, 2026-08-24. The line is **"you pick exactly one thing"** —
not "a column of rows", which is what it looked like from the outside.

| not one | why |
|---|---|
| ClubPage's standalone current-game card | not a list at all. It may borrow `ClubGameRow`'s look; that is the club-page area's call |
| `FilterSelect`'s popover | similar in small ways, not the same idea. It also deliberately takes no focus, which is the opposite contract |
| SetupGameModal's Players roster | check-many, not pick-one |
| `ColorChoiceList` | there is no cursor. The ring **is** the value — a persistent selection with no transient cursor beside it |
| connections' `HintList` | a button per row, not a choice among rows |
| crosswords' `ClueLists` | very close, and staying bespoke to crosswords. Revisit at that area |
| `Menu` | actions that close, not places that stay. Looks alike, is not alike |
| `SelectField` | the same job handed to a native `<select>` on purpose |
| every readout | `WordList`, `TurnLog`, chat, `PauseOverlay`'s roster, `RankBar`, `ChainStrip`, `GuessBoard`, board rows, Help's `<ul>`s |

**Nowhere in the app selects more than one thing**, so there is no multi-select
mode and none should be invented.

## Two kinds

The kinds differ in **what activation means**, and in nothing else.

**do now** — four of the five. Choosing does the thing immediately: you land on
the club, the setup dialog opens, the game opens. `Enter` activates. There is no persistent mark, because you have left.

**select** — the crossword picker, alone. Choosing records a choice you will act
on later, and **must not submit the dialog it sits in**. `Enter` and `Space` both
mean "make this the selection". The chosen row keeps a mark.

> The dialog cannot currently be submitted by Enter from anywhere —
> `SetupGameModal` is not a `<form>`, both footer buttons are `type="button"`,
> and there is no dialog-level Enter handler. So this is a constraint on what we
> build, not a bug standing today.

## The API

```jsx
<SelectionList
  items={visibleGames}                    // the array; its length IS the list length
  renderRow={(g) => <>…</>}               // the row's CONTENT — the component renders the wrapper
  onActivate={(g) => navigate(…)}         // Enter, and click, in the "do now" kind
  disabled={(g) => !playerCountFits(…)}   // optional
  empty="No games yet."                   // shown inside the box
  density="packed"                        // default | packed
  autoFocus                               // this list takes focus on arrival
  fills                                   // absorb the parent's free space

  selected={s.puzzle_id}                  // the "select" kind only
  onSelect={(p) => …}
/>
```

Four of these earn a sentence:

- **`renderRow` returns the row's contents, not the row element.** The component
  renders the wrapper. That is what lets it own the ring, the ref and the click
  — the three-way duplication above.
- **`fills` is a named boolean, not an open `className`.** A className would
  reopen the door the CSS module closes, and there is already a precedent for the
  boolean in `pageMain-fills`. Two known callers want it: ClubPage's two lists.
- **`density` has exactly two values.** ClubPage tightens row padding today
  through a `:global()` descendant selector, and its own comment says packing is a
  fact about *the page*. Two known uses, two named values, no scale.
- **`selected` / `onSelect`, not `value` / `onChange`.** The latter reads as a
  form control, and this deliberately is not one.

**Every no-rows state is `empty` with different text** — nothing yet, nothing
matching the filter, the fetch failed, "Loading puzzles…". No extra prop, and no
caller decides whether to render the list at all: the frame is always there.

**The crossword picker's filter box stays outside the component.** It filters
`items` before they are handed in, which keeps the component about the list.

## Keyboard

The container is the tab stop and holds the real focus; rows are inert. Every key
below is handled on the container.

| key | do now | select |
|---|---|---|
| ↑ ↓ | move the cursor, **clamped, no wrap** | same |
| Enter | activate | make this the selection |
| Space | **nothing** | make this the selection |
| Home / End | jump to first / last | same |
| PageUp / PageDown | move by one visible page | same |
| Tab | not ours | not ours |

- **Space does nothing in the "do now" kind** because selecting must not consent
  to an action. The only reason it is handled at all is to stop it scrolling.
- **None of these ever does the native thing.** The focused element *is* the
  scroll box today, so Space and the four page keys scroll it. All six are
  trapped. A page is measured — the container's `clientHeight` over the first
  row's `offsetHeight` — rather than a constant.
- **Tab belongs to the page**, through the shared `useTabToLists(refs)`: it
  cycles the page's lists, so the club page's two toggle and the homepage's one
  always wins. That is a relationship *between* lists, which is why it is not
  the component's. What the component guarantees is that a list is **exactly one
  tab stop** — before this, the crossword picker's rows were bare `<button>`s,
  so every puzzle in the library was its own stop.

  **Swallowing Tab on a page with a list is a trap**, and the homepage was in
  it: click any blank part of the page, the list blurs and takes its cursor
  with it, and no key is left that can hand the keyboard back. `useSwallowTab`
  is now only for surfaces with no list at all — the five window-key games.

### The cursor

- **The ring shows whenever the container has focus** — not on first arrow. A
  board tile's cursor waits, because it shares the tile with the game's own
  colors; a list row has no competing color, so an always-on ring costs nothing.
- **Clamped to the live list length on every render**, not just on keypress. The
  clubs list is realtime and both club lists are filtered, so rows vanish under
  the cursor.
- **`scrollIntoView({ block: 'nearest' })`** on the cursor row.
- **Clicking a row moves the cursor to it**, so mouse and keyboard agree on
  where you are.
- **The cursor lands on disabled rows; Enter no-ops.** Skipping would put the
  cursor index and the row index out of step — the same class of bug the live
  clamping exists to prevent — and has an edge case with no good answer when
  every row is disabled. Landing is also what happens today.
- **In the "select" kind the cursor starts on the selected row**, or row 0 when
  nothing is chosen yet.

### Focus on arrival

`autoFocus` is the caller's call — the two club-page lists and the homepage say
yes; the crossword picker says no, because its dialog autofocuses a field.

The component owns the *mechanism*: fire **once, when the list first has
content**. That is F15 (`focus-on-every-refetch`), which is a bug, not a design
question — `focusListOnLoad`'s dependency is `[clubs.length]` and the club list
is realtime, so a friend adding you to a club re-runs it.

## Paint

**The row is a `<div>`.** Not an `<a>`, not a `<button>`, not an `<li>`.

- **No `<a>`.** It costs cmd-click and middle-click "open in new tab", and that
  is worth little here: you play one game at a time and view one club at a time.
  What it buys is the invariant — an inert row is not independently focusable or
  activatable, so the container is the *only* way in. `StartGameButtons` prevents
  mousedown default on every row today purely to stop a `<button>` stealing
  focus; that guard stops being necessary.
- **Not `<li>`**, which would force the container to be a `<ul>` and with it the
  empty-state message into an `<li>` (`item-list-empty` is a `<p>` today, and a
  `<p>` in a `<ul>` is invalid). Going all-div also lets `margin: 0`,
  `padding: 0` and `list-style: none` leave, which exist only to hold a `<ul>`'s
  defaults back. The semantic argument for `<li>` is the only one for it, and
  screen readers are out of scope.
- A div row needs `cursor: pointer` said explicitly.

**Two marks, on two properties, so both can show at once:**

| mark | mechanism | color |
|---|---|---|
| the keyboard cursor | `outline: var(--chrome-cursor-ring)`, offset `-2px` | `--chrome-cursor-color` |
| the selection ("select" kind) | inset `box-shadow` | `--tile-selected-edge-color` |

The selection reuses the **tile** vocabulary rather than inventing a list-only
one: on a game piece, "selected" is a thickened black edge, and `base.css` gives
the reason — it leaves the background free for state and attention, which have
nowhere else to go. That is exactly the constraint a row with content in it has.

It is an inset `box-shadow` rather than a border because **a row has no resting
border to thicken**. A tile does; adding 4px to a row would shove its content in
and reflow, which the no-reflow-on-state-change rule forbids. Neither property is
a layout property, and they do not collide.

**The CSS is a module**, in `common/components/lists/`, following
`PageHeaderButton`'s precedent: not a global class, so nothing can wear the look
without rendering the component. Consequence, and it is the reason `density` and
`fills` are props at all — ClubPage tunes both from outside today by writing
global class names, and a module closes that door.

`--chrome-cursor-ring` **stays in `focus-ring.css`** — the menu, inputs and
standalone buttons all read its offsets. Only the `.kb-cursor` *class* moves into
the module.

Every new declaration carries `/* @@ */` (css-system-2.md).

## What this deletes

- **`patterns/list.css`, entirely.** `.item-list`, `.item-row`,
  `.item-list-empty` and its `> *:not(:last-child)` hairline all move into the
  module. Its element rule ("navigates → `<a>`, anything else → `<button>`") is
  wrong the moment rows are divs, and its `<ul>` reset is dead.
- **`.kb-cursor` from `focus-ring.css`.** Its three consumers all become this
  component. The ⚠️ note there about `ColorChoiceList` wearing the same paint for
  a selected state stays true and stays orphaned — the color list is not a
  SelectionList and is not being touched.
- **`ClubGameCard` splits.** `ClubGameRow` is the list row; the standalone
  current-game card keeps its own `styles.card` and stops sharing a component
  with it. The `variant` prop goes by the split, not by collapsing. The name also
  fixes a live collision: `.card` is a settled global pattern (a bordered section
  of a page) and `ClubGameCard.module.css:52` declares a local `.card` meaning
  something else. **A list item is not a card**, and names should stop saying so.
  (Left alone: setgame's `Card`, an actual playing card, and bananagrams'
  `HandCard`, a bordered box.)

## Sequencing

**All five sites convert now**, not one area at a time.

**No existing file is promoted by this work** — not crosswords, not scrabble,
not ClubPage. None of them has fallen into an area yet, and F38 is forward-fixing
rather than auditing, which is neither of the things a stamp claims.

**New files are `cs-audited`** (Joel, 2026-08-24). A file born inside an open
area was never un-reached, and the audit for it is this plan.

## The specs

Both were red before this work and both are rewritten by it:

- **`e2e/home-keyboard.e2e.ts`** — F3 (`home-keyboard-spec`). Its blocking
  question, whether the ring rides the row's `<a>` or its `<li>`, is **dissolved**:
  there is one element and it is a div. The `href` read at line 76 goes with the
  anchor.
- **`e2e/club-keyboard.e2e.ts:85`** read `[class*="_kbCursor_"] a` — both halves
  of that selector stopped existing. It identifies the ringed row by its text
  now, and asserts the game it lands on.
- **`e2e/club-filters.e2e.ts`** was collateral: it reached the rows through
  `_startList_` / `_gamesList_` / `_wrapper_`, all three of which are gone.

All three were red before this work. All three are green now, along with the
five specs that reach a start row through the new helper.

## Findings folded in

- **F11 (`list-cursor-written-twice`)** — the whole Keyboard section above.
- **F15 (`focus-on-every-refetch`)** — "Focus on arrival".
- **F24 (`empty-list-keeps-box`)** — `empty` renders inside the frame, and the
  frame is always drawn. The homepage used to be an exception, replacing the
  whole list with a sentence; Joel closed that on 2026-08-24, so nothing-yet,
  nothing-matching and the-fetch-failed are now one shape everywhere.
- **F3 (`home-keyboard-spec`)** is not folded, but its blocker is gone.

## What the build added that the design didn't foresee

Four things, each written up where it lives:

- **`frozen`** — a caller says "something above me owns the keyboard". While
  frozen the list ignores keys AND keeps its cursor when focus leaves. The
  second half is load-bearing: a setup dialog autofocuses a field, and reading
  that as "the user left the list" both loses the ring behind the modal and
  re-renders at the moment the dialog's own buttons are being clicked — which
  used to swallow the click and make Cancel do nothing.
- **`rowTitle`** — the native tooltip that says why a disabled row does nothing.
  It belongs on the row element, which only the component renders.
- **`position: relative` on the row** — a corner flag and a hover-revealed
  delete × want the ROW's corners, not those of a box inset by its padding.
- **The delete × had to stop propagating.** A row's own click activates it now,
  so without that, pressing × opened the game you were deleting. It also became
  its own component (`ClubGameDeleteButton`) rather than being written twice,
  and it finds its container with `:hover > .deleteButton` rather than naming a
  class that belongs to another module.

**A row is no longer a `<button>`, so `getByRole('button', { name: /Brand/ })`
cannot reach one.** Ten e2e call sites across five specs did exactly that; they
now go through `e2e/helpers/clubPage.ts` — `startGameRow(page, /Brand/)` — so
the next change to the row's markup is one edit rather than ten.

## Open

Only the scrabble question above. Everything raised in the 2026-08-24 design
conversation is answered.
