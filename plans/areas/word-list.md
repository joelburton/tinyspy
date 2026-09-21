# Area: word-list

The folders it reads: `word-list`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN — opened 2026-09-20, paused the same day and RESUMED 2026-09-20**
once the one-mark-hook work landed in the re-opened `board-marks`. Nothing was
abandoned: the seventeen findings stand, and the prose pass is the next step.

**The audit READ is DONE (2026-09-20).** Every roster file read end to end —
the three source files, the stylesheet, the three specs, `doc.md` and
`todo.md` — and the evidence beside them: the three `InfoCol.tsx` files, the
three `PlayArea.tsx` sites that build the rows (once for the screen and once
more inside the print action), the shared builder and boggle's own copy of it,
`infoPanel.module.css`, `Dot.tsx`, `DefinableWord.tsx`, `.definable` in
`utilities.css`, the responsive-column clamp in `playArea.module.css`,
`docs/playarea.md → Word list`, and the three game docs' word-list lines.
Baseline at the read: `tsc -b` clean, lint clean, 31 of 31 unit tests green
in the folder; every roster stamp now `cs-audited-word-list`. **Seventeen
findings, F-word-list-1 to F-word-list-17; nothing in the code moved at the
read.** Four are the prose pass (F-1 to F-4); one is a bug with an obvious
fix, confirmed by a planted test (F-5); six are shape or behavior with a
decision in them (F-6 to F-11); one is the stylesheet's literals (F-12); one
is tests (F-13); two are what the callers showed, read with Joel's refactor
question in mind (F-14, F-15); one is a `@@` call listed so it is not passed
over (F-16); one is a doc outside the folder (F-17).

**The prose pass is NOT started.** It is the next step: `doc.md`'s intro and
Details, the marker pass, the docstrings shrunk to the caller, the stale
claims — F-1 to F-4 as one commit — and only then a finding at a time.

## The roster

`src/common/word-list/` — every file `cs-audited-word-list`:

- `WordList.tsx` — the readout itself: the heading's tallies, the bordered
  list, and the two row kinds (a found word with its finder's dot, an unfound
  one the reveal adds)
- `WordList.module.css` · `WordList.test.tsx`
- `useWordListFilter.tsx` — the two-axis filter in the header, and the empty
  line that names whichever axis emptied the list
- `useWordListFilter.test.tsx`
- `useRecentlyFound.ts` — which words arrived just now
- `useRecentlyFound.test.ts`
- `doc.md` (a three-line lede; the `## Intro to area` is owed, and
  `common/word-list` is the one `common/` row left on `INTROS_OWED` in
  `src/guards/folderDocs.test.ts`) · `todo.md` (every section empty — no
  earlier area handed this one anything)

Evidence, read and left `cs-unmet` — **and read with a refactor in mind**
(Joel at the opening: examine them "in case they're useful for any potential
refactoring of word-list"), since what the four callers have to build before
they can call is where a better seam would show:

- `src/boggle/components/InfoCol.tsx` and `src/boggle/lib/displayRows.ts`
- `src/spellingbee/components/InfoCol.tsx`
- `src/wordwheel/components/InfoCol.tsx`
- `src/shared/word-hunt/foundWordsDisplayRows.ts` — the shared row builder
  behind three of those four

Read as evidence beyond the agreed four, because the InfoCols only place the
list and the rows are built one level up: the three games' `PlayArea.tsx`, at
the `wordRows` line and inside `actPrintBoard`. Left `cs-unmet`.

NOT on the roster, ruled at the opening:

- `e2e/spellingbee-mobile.e2e.ts` (Joel: no), though it asserts this
  component's desktop-only `· Longest: N` clause at both viewports.
- `common/pdf/wordListBody.ts` · `wordColumns.ts` — a word list on paper, read
  and blessed by `pdf`.

## Findings

*(`F-word-list-1 · slug · title`, one heading each; a status prefix when it has
one, no prefix means OPEN)*

### The audit's findings — 2026-09-20

What the folder IS, for the record: one component and two hooks. `<WordList>`
takes rows it did not build — one per word, alphabetized, `found` with a
finder or `unfound` from the terminal reveal — and draws them as a
column-major grid inside the shared info-panel frame, a heading over it that
tallies whatever is currently shown. `useWordListFilter` is the pair of
selects in that heading (KIND: Legal · Required · Bonus; WHO: All · Found ·
Missed · each player) and the empty line that names whichever axis emptied
the list; `useRecentlyFound` is the set of words that arrived since the last
change, so a just-found word can wear its finder's underline for five seconds.
The code held up: the filter's gating is right and thoroughly pinned, the
tally reads the filtered list as designed, the dedup and shadowing rules live
in the builder where they belong. What has drifted is the prose — three
docstrings carrying the folder's design (and one carrying its history), a
member note on every field, and a dozen claims about column counts, callers,
paths and a fade that the code stopped matching between July and September.
And one bug the reading found and a plant confirmed: after a restart, a word
found again does not flash.

### F-word-list-1 · `doc-md` · The design lives three times, and none of them is `doc.md`

`doc.md` is the H1 and a lede; `common/word-list` is the last `common/` row
on `INTROS_OWED`. The folder's design — why two selects and not one, why WHO
is one axis, which axis is gated and why, why the filter hook is called inside
the component, why the heading tallies the filtered list, why `finderIds`
exists — is written out in full in THREE places today: the `WordList`
docstring (30 lines), the `useWordListFilter` docstring (30 lines), and
`docs/playarea.md → Word list` (a hundred lines, the two docstrings nearly
verbatim). The area's harvest writes the `## Intro to area` and `## Details`
(with the render tree: the three games' InfoCols → `<WordList>` →
`useWordListFilter` → `<FilterSelect>`, `<Dot>`, `<DefinableWord>`), and that
is where the design should have one home.

The decision is what happens to `docs/playarea.md → Word list` once `doc.md`
owns the design:

1. **`playarea.md` keeps the placement and cites the folder** — the way
   `event-log/doc.md` and `playarea.md → Event log` divide it (the doc says
   where the panel sits on the page; the folder says what it is). The
   hundred lines shrink to a paragraph and a link. **Recommended:** the pdf
   precedent (docs/pdf.md collapsed into the folder) and "no restating a
   canonical doc" both point here.
2. **`playarea.md` stays the canonical home and `doc.md` cites it** — the
   folder's Details stay short. Against: the event log already went the other
   way, and a `docs/` page describing one folder's internals is the shape the
   folder docs exist to end.
3. Leave both. Against: it is the drift this sprint exists to stop; the two
   copies already disagree (F-4).

**RULED (1), and Joel drew the whole split rather than just picking, 2026-09-21.
Three homes, by what a reader is doing:**

- **`doc.md` — orienting.** A high-level outline of the area, **a component
  diagram**, and whatever else helps a reader place themselves in it. The
  diagram is a deliverable, not a nicety: it is the thing that answers "what
  talks to what" before any prose does.
- **The docstrings — calling.** How to call the component and what it hands
  back. That is their whole job, which is what lets F-3 cut the design and the
  rationale out of them without losing anything.
- **`docs/playarea.md` — placement, and *very little*.** In Joel's words, that
  the word list is **one of two things that often appear in the info column,
  the other being the event log**. Not a paragraph of design with a link — a
  placement sentence naming the pair.

So the hundred lines do not move to `doc.md` wholesale. Most of them describe
the calling contract and belong in docstrings; the orientation and the diagram
are what `doc.md` is owed; and the reveal's two paragraphs still go to
`shared/word-hunt` per F-17.

### F-word-list-2 · `docstring-markers` · Every member note wears `/**`

The marker pass has not reached this folder. `WordListRow`'s `userId`,
`finderIds` and `points`; every one of `Props`' eight members; the three
annotated members of `useWordListFilter`'s parameter object; and
`WordListFilter`'s three members all wear `/**`. A props block is the case
the pass keeps missing (plan §4 → The docstring marker); each becomes `//`.
`RECENT_MS` keeps its `/**` — a module constant is a declaration.

### F-word-list-3 · `docstrings-carry-design` · Three docstrings carry the design, the rationale and the history; one test file has none

`WordList` (30 lines) and `useWordListFilter` (30 lines) are the design
written twice (F-1); a caller wants the ~10 lines that say what it draws, what
the rows are, and what the two selects do. `useRecentlyFound` (20 lines) is
the other kind of overflow: its "two subtleties" are why the implementation
is what it is — the timers in a ref, the bootstrap from the first `found` —
and belong on the lines they defend, inside the hook. Then the archaeology,
which durable prose bans: "Lifted to common from the per-game copies
spellingbee + boggle shared verbatim (originally a TS port of
`~/spellingbee-ws/…`)", "matching the event log's picker (settled
2026-08-02)", the stylesheet's "Modeled on spellingbee's", and `.list`'s
"(≈ the old box/5)". `WordListRow`'s own docstring is sound at 17 lines but
carries F-4's stale caller pointer.

`useRecentlyFound.test.ts` is the one spec of the three with no header
docstring saying what it pins.

### F-word-list-4 · `stale-claims` · A dozen claims the code stopped matching

Anchored by what the code IS, not where it sits:

- **"(spellingbee, boggle)"** — the games this component serves, written
  before wordwheel existed: the `WordList` docstring, the stylesheet header,
  `docs/playarea.md:356`, `docs/ui.md:1487` ("spellingbee / boggle
  `<WordList>`"), `docs/games/spellingbee.md:477`. Three games; name the
  condition (the word-hunt games that keep a found-words list) or all three.
- **"three columns show and the rest scroll"** (the `WordList` docstring) and
  **"three columns show at a time"** (`.list`'s comment) — from 2026-06-29,
  when the column was one width. Since 2026-07-23 the column is
  `clamp(22rem, …, 53rem)`; at 10.5rem a column plus a 16px gap that is
  roughly four full columns at the ceiling and one or two at the floor
  (arithmetic, not measured). The honest sentence has no number: as many
  columns as the column's width admits, the rest scroll horizontally.
  Sibling: `docs/games/spellingbee.md:71` "horizontal scroll past 3 columns".
- **"at a FIXED height"** (`.list`) — the box is `flex: 1; min-height: 0` in
  `infoPanel.box`: the height is whatever the column gives it, definite but
  not fixed.
- **"see each game's `lib/displayRows`"** (`WordListRow`'s docstring) and
  **"built by the game's `buildDisplayRows`"** (`Props.rows`) — only boggle
  has a `lib/displayRows`; spellingbee and wordwheel call
  `shared/word-hunt/foundWordsDisplayRows.ts`, and boggle's copy is already
  slated to go (`boggle/todo.md`).
- **"click-to-define via the shared `DefinitionPopover`"** (the `WordList`
  docstring; also `docs/games/boggle.md:517`) — what the list renders is
  `<DefinableWord>`; the popover is the host's business.
- **"the pointer cursor, hover underline, and focus ring all scope to this
  span"** (`.word`'s comment) — there is no focus ring: a definable word is
  pointer-only by `definitions`' ruling, and `.definable` says so at length.
- **"The card heading … (The live 'X / Y words' count belongs in the
  info-column state line, not here — it would duplicate it.)"** — the first
  of two comment blocks stacked over `.box`. The heading has carried
  `Words: N · Score: M · Longest: L` since 2026-08-07, and the heading's rule
  is `infoPanel.heading`, not in this file at all. The block goes.
- **"a finder-color underline that fades after 5s"** (`WordList` docstring)
  and **"fades after 5s"** (stylesheet header) — nothing fades; there is no
  transition. The class drops and the underline is gone.
- **Pre-reorg paths** — `docs/playarea.md:498`
  (`common/components/game/lists/WordList.tsx`),
  `docs/games/spellingbee.md:477, 482, 655` and `docs/games/boggle.md:514–518`
  (`common/components/game/lists/…`, `common/hooks/game/…`,
  `common/lib/game/…`).
- **"Players list is small (<10 in realistic clubs) so a Map+get rather than
  .find on each row"** — a small list is the argument for `.find`; the Map
  is for the rows, which can be a hundred. Say that.
- **`players` — "Club members"** (`Props`) — they are the game's players
  (`GamePlayer[]` at every caller).
- **"the set of words that arrived in `found` since the last render"** and
  **"Bootstrapping from the constructor argument"** (`useRecentlyFound`) —
  since the last CHANGE of `found` (a re-render with the same array is a
  no-op, and a test pins it); and a hook has no constructor — the first
  render's argument.
- **"a game/layout can override it"** (`--wl-col-width`) — nothing does
  (grep). It is a custom property so the row arithmetic can read it, which
  is the sentence worth keeping.

### F-word-list-5 · `restart-flash` · A word found again after a restart never flashes

`useRecentlyFound` re-syncs `knownFoundRef` only when something fresh
arrived (`if (fresh.length === 0) return` comes first). A restart
(`replay_board`, spellingbee's and boggle's alike) deletes the game's
`found_words` and keeps the game id, so nothing remounts: `found` goes to
`[]`, nothing is fresh, and the ref still holds every pre-restart word. Find
one of them again and it is "known" — no underline. Confirmed 2026-09-20 with
a planted spec (`['bead']` → `[]` → `['bead']`, expecting `has('bead')`):
**red**. The fix is one line moved above the early return — sync the ref to
`found` on every change — plus that spec kept in `useRecentlyFound.test.ts`.
No decision in it; waiting for the word.

**CLOSED 2026-09-21, NO CHANGE — the finding's premise is false.** *"How would
this remember anything, since we now remount the component after restart?"*
(Joel). Verified end to end: all three word-hunt games' `replay_board` calls
`common.reset_game`, which bumps `common.games.restarts`; `GamePage` renders
`<PlayArea key={commonGame.restarts}>`, so a restart unmounts the surface and
every ref in it. The hook cannot carry its memory across one.

**The planted spec was red for a reason that is not a bug.** It drove the hook
with `renderHook` — a word, an empty list, the same word again — with no unmount
between, which is a sequence the app cannot produce, because the only thing that
empties the list also remounts the hook. A property of the hook in isolation was
reported as a defect in the app.

The key landed 2026-09-15 (`24664a0a`), five days BEFORE this audit read, so the
finding was already false when filed rather than overtaken. What remains true and
is not worth acting on: the hook does not re-sync its memory when `found` shrinks.
Nothing can reach it. The process fix is in [app-audit.md](../app-audit.md) §4 —
[A restart REMOUNTS](../app-audit.md#a-restart-remounts--assume-nothing-in-a-game-still-has-to-clear-itself),
and the opening step that reads what moved under an area.

### F-word-list-18 · `terminal-default` · The list opens on the answer at game over

**RAISED AND RULED BY JOEL, 2026-09-21**, out of F-6: *"i've been thinking about
whether we should show all missed words automatically at game end, or whether we
should get that behind a 'reveal-solution', as we do for most other games."*

The missed words fold into the rows the moment the game ends, and the WHO filter
defaulted to All — so a finished game opened on what you missed before you had
read what you got. Eleven games gate their answer behind a reveal control; these
three do not.

**Ruled: keep the automatic fold, and make the WHO filter's terminal default
`Found`.** Not a Reveal button, for the reason all three games already had
written down and which this finding only confirms — the WHO axis IS that control
for these games, and a button beside it would be two ways to switch the same two
lists. The code's own note predicted the shape of the fix: *"If we ever wanted
the answer withheld at the end, the change is the filter's DEFAULT, not a new
control."* The trade taken knowingly: a default of Found gives the beat but
announces nothing, so discovery rests on the select being visible.

Gated on `hasMissed` as well as `isTerminal`, since Found is not offered until a
missed row exists and a default outside the option set would strand the list.

**It made one empty line reachable that never was.** At terminal with Found
selected and nothing found, the plain line read "No words yet" — "yet" being a
lie on a finished game. There is a `Found` branch now: "Nothing found."

**Six specs changed, and the two that matter are the games'.** spellingbee's and
wordwheel's terminal smoke tests asserted a missed word was on screen; they now
assert it is NOT, and that it appears after picking Missed — both halves, so
neither the fold nor the hold can regress silently. The rest were tests that had
leaned on the old default while testing something else (the KIND axis, the
heading tally); each now picks All explicitly, which is what it always meant.

**F-6 is unblocked by this.** The fold is still exactly `isTerminal`, so `reveal`
is still that same value under a second name.

### F-word-list-6 · `reveal-prop` · `reveal` is `isTerminal` at every caller

The prop exists to suppress the flash when the terminal refetch lands every
peer row at once. spellingbee and wordwheel pass `reveal={isTerminal}`;
boggle passes `reveal={revealWords !== null}`, and `revealWords` is
`isTerminal ? … : null`. The component already takes `isTerminal`, so every
call carries one value under two names, and the default `false` is a default
no caller reaches.

1. **Drop `reveal`; gate the flash on `isTerminal`** — three call sites lose a
   line, `Props` loses a member, and the docstring's "mid-game only" becomes
   literally what the code says. **Recommended.**
2. Keep it, and document that it is the same value — for a game that might
   one day reveal before terminal. Against: no such game; a default is a
   decision, and this one is never taken.
3. Derive it from the rows (`rows.some(r => r.kind === 'unfound')`). Against:
   a compete table that found everything has no unfound row and still gets
   the bulk refetch.

### F-word-list-7 · `heading-prop` · A knob no caller turns

`heading?: string`, default `'Words'`. None of the three callers passes it.
The `pdf` area's rule: six knobs no caller turned are gone. Remove it, or say
who it is for.

**WORKED 2026-09-21 — removed**, on Joel's condition that the heading keep
rendering exactly `Words: 7 · Score: 10 · Longest: 5`. It does, byte for byte:
no game supplies any part of that line, so the prop could not have changed it.
The guarantee is now a spec of its own asserting the WHOLE string rather than
the three substring matches that were there — the line three `e2e` files pin by
content, and `'Words'` is a literal in the component now.

**Folded in, from Joel's question "why does only hasPoints use useMemo?":
because of nothing, and the memo never even fired.** It was keyed on `rows`,
which every caller builds fresh in its render body, so the dependency differed
every time and the `.some()` re-ran regardless — overhead plus a false signal
that something expensive was being avoided. Its two neighbors could not be
memoized even deliberately: they read `shown`, a `.filter` result, new by
construction. All three are plain expressions now, with one comment saying why
none of them is memoized so nobody re-adds one.

`foundWordsOnly`'s memo STAYS and is now marked as the one that is
load-bearing: `useRecentlyFound`'s effect depends on that array's identity, so
a fresh one per render would re-run it every render. That distinction — an
optimization that cannot hit versus a memo that is correctness — is the useful
half of this finding.

### F-word-list-8 · `empty-line-period` · One empty line of six has no period

`emptyTextFor` returns `No bonus words yet.`, `No required words from moth
yet.`, `Nothing from moth yet.`, `Nothing missed.`, `No bonus words missed.` —
and `No words yet`. The event log's own is `Hidden until game ends.` The
default line is the one most players see. Both specs match by substring, so
either way passes; pick one.

### F-word-list-9 · `word-hover-drift` · `.word` re-declares what `.definable` already gives it

`<DefinableWord>` wears `.definable` (`core-css/utilities.css`), which sets
`cursor: pointer` and the hover underline for every definable word in the
app. `.word` sets `cursor: pointer` again and `.word:hover` sets
`text-decoration: underline` again; what is genuinely this list's is
`text-underline-offset: 2px` and the hover's `thickness: 1px`. Two rules
saying one thing is the drift `definitions` closed to end.

1. **Drop the duplicates; keep the offset and thickness with a comment that
   says they tune `.definable`'s underline for a 17px row.** **Recommended.**
2. Move the offset up into `.definable` if every definable word wants it —
   a two-line conformance edit in a closed area — and drop `.word:hover`
   entirely. Needs a look at the event logs' words first.

### F-word-list-10 · `kind-who-types` · KIND is a closed set typed as `string`

`LEGAL` / `REQUIRED` / `BONUS` are the whole KIND axis, but `kindChosen` is
`useState<string | null>`, `matchesKind` compares a `string`, and
`emptyTextFor(kind: string, …)`. WHO is genuinely open (it holds user ids), so
`string` is honest there. A `type Kind = typeof LEGAL | …` costs four
annotations and lets the compiler read `kind === BONUS`. Small; leave or take.

### F-word-list-11 · `row-type-home` · The row type lives in the component file

`WordListRow` is exported from `WordList.tsx`, and the code that BUILDS rows
imports it from there: `shared/word-hunt/foundWordsDisplayRows.ts` and
`boggle/lib/displayRows.ts` (`import type`, so nothing runs). The folder
rule is that the name states the kind, and a lib file importing a type from
a component reads as the wrong direction. A `wordListRow.ts` beside the
component would hold the type and its docstring; the component would import
it like everyone else. Take it with F-15's seam or leave it.

**CLOSED 2026-09-21, NO CHANGE — leave it** (Joel). Two reasons, and the second
is the one that settles it.

The finding reads the import as the wrong DIRECTION, and on that the
import-direction guard has already ruled the opposite way, in its own docstring:
*"shared may reach up into common (a family's row builder taking its row type
from `word-list` is exactly right)"*. What that guard forbids is `common`
reaching DOWN into a family. These builders reach up, which is the sanctioned
direction — so the direction half of the finding is answered, and answered
against it.

What remains is a within-folder taste question the guard has no opinion on: a
type living in a component file rather than beside it. A file whose only content
is one exported type buys a shorter import path and little else, and the type's
docstring is already read where the component is. The finding's own closing
words were *"take it with F-15's seam or leave it"*, and that seam shipped
without it — doing it now would be tidiness justified by nothing the seam needs.
Three importers (the shared builder, boggle's copy, and `wordListRows.ts`) is
not a number that changes that.

### F-word-list-12 · `css-literals` · The values Joel decides

Every rule in the file is `@@`. The literals, by what the a/b/c rule asks of
each:

- **Straight conversions**: `.wrapper { gap: 0.5rem }` and `.box { padding:
  0.5rem … }` are `--spacer-4` exactly; `column-gap: 16px` is `--spacer-2`
  (1rem) exactly. On the `vocabularies.test.ts` pending row for this file as
  `'0.5rem', '16px'`.
- **Near-misses, each a decision**: `.box`'s horizontal `0.6rem` (between
  `--spacer-4` and `--spacer-3`, the same 0.6 `lists/todo.md` parks); `.row
  { font-size: 17px }` (1.0625rem; `--font-size-1` is 1rem) and
  `letter-spacing: 0.02em` (`--letter-spacing-label` is 0.03em) — both
  pending; `.dot { margin-right: 7px }` — pending.
- **Bespoke on their face**: `--wl-row-height: 26px`, `--wl-col-width:
  10.5rem`, `--dot-size: 0.6em`, and the underline metrics (`1px` / `2px`
  hover, `2px` / `3px` recent).
- **px in a rem column**: `26px`, `16px`, `7px`, `17px` sit in a list whose
  width is `10.5rem` inside a column whose own rule is "a rem, never a pixel
  lock". Whether the row height is a px decision or a rem one is the same
  question the info column already answered for itself.

**WORKED 2026-09-21** (Joel took the recommendation). Four converted, three
recorded as bespoke with the reason beside the value:

- `.wrapper`'s `gap` and the list's `column-gap` are `--spacer-4` and
  `--spacer-2`. **Both of `.box`'s paddings stay literals** (Joel: *"we don't
  use --spacer for padding"*) — the ramp is the space BETWEEN boxes, and whether
  the room inside one belongs on it is parked in `core-css/todo.md`. The first
  pass converted the vertical one and was wrong to.
- **`17px` → `--font-size-1`**, the one with a visible result: every word in
  the list is a pixel smaller. Nothing moves — the row's height is
  `--wl-row-height` and its `line-height` reads that — and a smaller word only
  gains room in a fixed-width column.
- **Bespoke, each now saying so in the file**: the card's horizontal `0.6rem`
  (tuned to the column grid; the same 0.6 `lists/todo.md` parks), the row's
  `0.02em` (`--letter-spacing-label` is 0.03em, which is the ramp for a LABEL,
  and these are words to read), and the dot's `7px` (a marker's breath, with no
  token near it).

**The guard said the padding rule out loud and the first pass still missed it.**
It reported `0.5rem` and `16px` as excused-but-no-longer-written, naming what the
pending row owed; then, when the row was rewritten to record `0.6rem` as bespoke,
it rejected that too, because **padding is deliberately absent from the spacer
vocabulary**. That is the same fact that makes converting `.box`'s vertical
padding wrong, and it was read as a scope note about the pending list rather than
as the rule it is — Joel caught the conversion. Only `7px` is on the pending row;
the `17px` row is deleted outright.

The px-in-a-rem-column question is NOT answered by this: `26px` and `10.5rem`
are untouched, and whether a row's height is a px decision or a rem one is still
open.

### F-word-list-13 · `rows-untested` · The spec pins the heading and nothing below it

`WordList.test.tsx` is four tests of the tally. Nothing asserts a row: the
finder's color on the found dot, the hollow gray ring on an unfound row, the
bonus `•` on both kinds, pangram bold, the recent underline in the finder's
color and its suppression at terminal, the empty line rendering the hook's
text. The row kinds are the component's whole job and the filter tests reach
them only through `filter()`. One file — it is one unit — grows a `describe`
per row kind and one for the flash; F-5's restart spec goes in
`useRecentlyFound.test.ts`.

### F-word-list-14 · `points-by-word` · Three print sites look up a score the row already carries

In spellingbee's, wordwheel's and boggle's `actPrintBoard`, each print row's
score comes from a `pointsByWord` map built from `foundWords`, with the
comment "the shared row type carries finder/bonus/pangram, not score" (from
2026-07-03). `points` joined `WordListRow` on 2026-08-07 for the heading's
tally, and `buildDisplayRows` fills it on both row kinds. The map is dead
work and the sentence is false in three files.

1. **Fix now from this area** — `r.points ?? 0`, the map and the sentence
   gone, in three `PlayArea.tsx` files. A conformance edit where this area
   owns the row type. **Recommended.**
2. Fold into F-15's seam, which rewrites those lines anyway.
3. A line in each game's `todo.md`.

### F-word-list-15 · `rows-seam` · What the callers build before they can call

Joel's question at the opening. Each of the three games, before `<WordList>`
can be placed, does the same four things: computes `hasBonus` from its own
setup (`legal !== required`; boggle's `legal_band !== band`, named
`hasBonusDifficulty`); calls `buildRevealWords(required, hasBonus ? bonus :
[], found)` gated on `isTerminal`; feeds that to `buildDisplayRows(found,
reveal)`; and passes `reveal={isTerminal}`. And each does the reveal + rows
step TWICE — once for `wordRows` and once more inside `actPrintBoard`, which
builds at click time — so the shape is written six times across the three
files, identically. The `<WordList>` call is then seven props, identical in
the three InfoCols, four of them booleans about the game (`isCompete`,
`isTerminal`, `hasBonus`, `reveal`), one redundant (F-6).

The seam that shows: **one function in `shared/word-hunt` that turns a game's
found words, its two lists, `hasBonus` and `isTerminal` into `WordListRow[]`**
— the reveal and the merge composed once — read by the screen and by the
print alike. Six sites become three, the print's row mapping reads
`r.points` (F-14), and `hasBonus` stays each game's own comparison, which is
the only line that genuinely differs. NOT on the seam: the InfoCol prop group
(`info-sheet/todo.md` → emerge a shared `<InfoCol>`) and boggle's private
builder (`boggle/todo.md` → adopt the shared modules), both already owed
elsewhere.

1. **Record it in `shared/word-hunt/todo.md` (empty today) and build it when
   that area opens** — the function is that folder's, its two ingredients
   already live there, and the folder is on `INTROS_OWED` with nothing read.
   This area does F-6 and F-14, which stand on their own. **Recommended.**
2. Build it now from this area. Against: it is `shared/word-hunt`'s file and
   its `doc.md` is owed too; a second area's work in one commit.
3. Leave it; the six sites are each three lines.

**RULED (2) — build it now and here** (Joel, 2026-09-21), against the
recommendation. The seam is real and the six sites are in front of us; deferring
it to an area with nothing read yet would mean re-deriving the finding to act on
it. `shared/word-hunt` gains the function and a `todo.md` line is NOT what this
becomes. Its `doc.md` intro stays owed — writing the function does not oblige
this area to read that folder.

### F-word-list-16 · `hollow-ring-token` · The unfound ring reads the divider token by hand

`.dotUnfound { --dot-ring: var(--page-divider-color) }` — the "nobody" ring
in the list is the divider gray, chosen so it reads as a marker beside the
muted word. `<Dot hollow>`'s own default ring is body text. It is a per-site
override the disc invites ("override with `--dot-ring` on a className"), so
the question is only whether the divider color is the decision or a stand-in:
the same value draws the box's border two rules up. A `@@` call, listed so it
is not passed over.

### F-word-list-17 · `playarea-doc` · `docs/playarea.md → Word list` restates the folder

Named in F-1 for the decision; listed apart because it is the one thing
outside the folder that changes shape. Its "Sizing, measured against the local
dictionary" paragraph and the "When a board has no real bonus list" paragraph
are the two things in it NOT in a docstring today — they are the reveal's
design and belong with `buildRevealWords` in `shared/word-hunt`, not here.
Whatever F-1 rules, those two paragraphs move to that folder's doc, not to
this one's.

**Per F-1's ruling this section becomes a placement sentence**: the word list
is one of the two panels that often appear in the info column, the other being
the event log. Everything else in it goes — to docstrings if it is the calling
contract, to `doc.md` if it is orientation, to `shared/word-hunt` if it is the
reveal's.

## Notes

- **boggle's `lib/displayRows.ts` is a line-for-line copy of the shared
  builder minus `isPangram`**, which the shared type already makes optional.
  Already recorded in `boggle/todo.md` ("Adopt the two shared found-words
  modules"); not a finding here.
- **`e2e/spellingbee-mobile.e2e.ts` is the guard on "one string at every
  viewport"** — it reads the heading's `innerText` on desktop and both
  `innerText` and `textContent` in the sheet. `solved-reveal.e2e.ts` and
  `strands.e2e.ts` also match `Words:`, but that is strands' own readout, not
  this list.
- **The responsive column** (`playArea.module.css → .responsiveInfoCol`,
  22rem–53rem) is the reason "three columns" stopped being true. That
  stylesheet is `game-page`'s, closed; the claim in this folder is this
  area's to fix.
- **`infoPanel.headerRow` vs `.heading-with-controls`** was ruled 2026-09-18
  in `info-sheet`; this list wears the ruling and adds nothing to it.
- **`.definable` is `definitions`' (closed).** F-9's option 2 would edit it;
  option 1 does not.
- **`useBoundAction` reads `run` through a ref**, so a print action that read
  `wordRows` from the render instead of rebuilding would still snapshot at
  click time — relevant to F-15's shape, not decided here.
- **Column count is arithmetic, not a measurement** (F-4): 168px + 16px per
  column against a 22rem–53rem column less padding and border. The fix drops
  the number rather than replacing it, so no headless measurement was taken.

## Predicted test breaks

- `src/common/word-list/*.test.*` — none red at the read; F-8 passes either
  way (substring match).
- **F-6** removes a prop: `tsc -b` fails until the three `InfoCol.tsx` and
  `PlayArea.tsx` pairs drop `reveal`.
- **F-14 / F-15** touch the print rows: run `e2e/spellingbee-print.e2e.ts`,
  `e2e/wordwheel-print.e2e.ts`, `e2e/boggle-print.e2e.ts` after (ASK first).
- **F-1 / F-17**: `src/guards/docLinks.test.ts` on any anchor
  `docs/playarea.md#word-list` loses; `src/guards/folderDocs.test.ts` once
  `common/word-list` comes off `INTROS_OWED`.
- `e2e/spellingbee-mobile.e2e.ts` only if the heading's string changes
  (nothing above changes it).

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design written; its row off `INTROS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
