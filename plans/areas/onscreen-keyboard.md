# Area: onscreen-keyboard

The folders it reads: `shared/onscreen-keyboard`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: CLOSED 2026-09-22, blessed** (Joel: *"bless the files in the area,
then close and commit"*). All three roster files read
`cs-blessed-onscreen-keyboard`.

## The roster

Agreed with Joel 2026-09-22, `cs-met-onscreen-keyboard`:

| file | what it is |
|---|---|
| `src/shared/onscreen-keyboard/GuessKeyboard.tsx` | the QWERTY caps, their tones, and the two command keys |
| `src/shared/onscreen-keyboard/GuessKeyboard.module.css` | its stylesheet |
| `src/shared/onscreen-keyboard/GuessKeyboard.test.tsx` | **written by this area** (F-8) — the component's own contract |

`doc.md` and `todo.md` are on the roster and carry no stamp, markdown having
nowhere to put one. The folder had no spec of its own at the opening; F-8 wrote
one, and a created file joins the roster.

### What is NOT on it

- **`src/guards/vocabularies.test.ts`** (Joel, 2026-09-22: *"no"*). It holds
  five pending rows for this stylesheet — `4px`, `0.4rem`, `1.2rem`/`0.85rem`,
  `0.6`, `80ms`. Converting them means editing the guard; the guard does not
  join the roster, the way `rank-ladder` took its eleven rows down without
  stamping it.
- **`common/keyboard`** — its own area, closed 2026-09-10. Joel, 2026-09-22:
  *"has nothing to do with this, other than it captures letters — you can read
  it for investigation."* Evidence.
- **`src/wordle/components/BoardCol.tsx` and `src/wordiply/components/BoardCol.tsx`**
  — the two consumers, and they differ: wordle passes `keyStates` and does the
  `KeyTone` narrowing, wordiply passes none, so the tone half has one caller.
  **Evidence, and fix forward** (Joel, 2026-09-22) — a change there ships with
  this area and is NOT blessed.

## Findings

*(`F-onscreen-keyboard-1 · slug · title`, one heading each; a status prefix when it has
one, no prefix means OPEN)*

### The audit's findings — 2026-09-22

**Eight findings, F-onscreen-keyboard-1 to -8; nothing in the code moved at the
read.** Both roster files end to end, plus the evidence: both consumers'
`BoardCol.tsx` and their stylesheets, `common/keyboard` (read for investigation,
per Joel), `actionSurface`, the five `vocabularies` rows, and the tests that
reach the caps. Baseline `tsc -b` clean, 162 of 162 green across the two games.

**What the folder IS: one component and its stylesheet.** Three rows of caps,
with ⌫ and Enter flanking the bottom row. The two command caps are the GAME's
own `actSubmit` / `actDelete` bindings worn through `actionSurface`, so a cap
and the physical key can never disagree about whether the move is available —
including the empty-guess case, where both go gray. The 26 letters are
deliberately NOT actions: a letter cap is a key, not a command.

**It holds up, and two decisions in it are better than they look.** Deriving
`KeyTone` from `TileColor` rather than restating it is what stops a key and the
tile above it drifting into two vocabularies, and excluding `blank` is the whole
difference between them — a tile can be unjudged, an untried key just has no
tone. The caps already refuse click-focus with a `mousedown` cancel, for exactly
the reason the info column's disclosure now does.

**What has drifted is the prose and one consumer.** The stylesheet still tells
the story of a token layering it replaced; both files roster the two games that
use it; the props block wears the docstring marker on four members. And the one
prop that exists to stop the page moving has a single caller — the other game
unmounts the keyboard instead, which is the thing the stylesheet's own boxed
warning says never to do.

### F-onscreen-keyboard-1 · `doc-md` · The intro is owed

**SHIPPED, 2026-09-22.** Written, and `shared/onscreen-keyboard` is off
`INTROS_OWED`; planting a bolded opening paragraph fails `folderDocs`, so it is
in shape for the right reason.

**It needed a `## Details` to be in shape at all**, and that is the guard
earning its place: the first draft ran 27 lines of intro with nothing after it,
which the rule reads as detail hiding in narrative — correctly. The intro now
carries the one distinction a reader needs (letters are keys, ⌫ and Enter are
the game's bindings) and the five sharp facts moved under Details, which also
serves as this area's harvest: the tone type short by one value, the withdraw
rule, the focus refusal, the palette-by-name decision, and the `aria-label`
that is a test handle.

`src/shared/onscreen-keyboard/doc.md` is a title and two sentences; the folder
is on `INTROS_OWED` in `src/guards/folderDocs.test.ts`. Closing step 2.

What it needs beyond the intro is the split the component keeps making and the
docs do not state: the letters are input, the two command caps are the game's
bindings, and that is why one of them can be gray while letters are live.

### F-onscreen-keyboard-2 · `wordiply-drops-the-keyboard` · The prop that stops the page moving has one caller

**SUPERSEDED the same day.** Joel: the keyboard should be SHOWN at terminal —
its caps carry the colors of the letters used, which is the record of the game.
`gameOver`, `.gameOver` and the `visibility: hidden` are gone; both games now
show a disabled keyboard, the same look as not-your-turn. What this finding
fixed survives it: wordiply has one arrangement rather than a branch that
unmounted the column's bottom 12.4rem, which is the half that was never about
the prop. Everything below is the reading as it stood.

**SHIPPED, 2026-09-22** (Joel ruled it an oversight, not a deliberate second
arrangement). wordiply passes `gameOver={isTerminal}` and the branch is gone:
one arrangement, played or finished, with the keyboard withdrawn at terminal
instead of unmounted. `.verdictSlot` went with it — dead the moment the branch
did — and `.kbFeedback` now says it serves both pills, its floor being about one
pill's own height, which is the same reserve a mid-game soft-reject lands in.

A forward-fix in a game folder: not blessed.

**The test planted twice, and the first version was wrong.** Asserting the
keyboard is still in the document catches the old branch — but PASSES with
`gameOver` dropped entirely, which leaves the keyboard fully visible under a
finished game. The name said "withdrawn" and only "not removed" was pinned. It
now also asserts the withdraw class, and both plants bite. What the class DOES
is CSS, and vitest parses none, so that is as far as a unit test reaches.

**The headless measurement was not needed in the end.** It was owed to size the
jump before deciding; the ruling made the fix the same either way, and the fix
removes the swap rather than reserving space for it — there is now one subtree
in both states, differing by a `visibility`.

**The finding as read:** `gameOver` exists so a finished game
withdraws the keyboard while KEEPING its box — the stylesheet argues it inside a
drawn box, in capitals, ending *"layout must never move on a state change"*:

> DO NOT change this to `display: none`. It is `visibility: hidden` on purpose…
> `display: none` removes it from the flow, which yanks the whole column
> downward at the exact moment a player is reading their verdict.

wordle passes `gameOver`. **wordiply never passes it**, and instead branches on
`isTerminal` and unmounts the keyboard entirely
(`src/wordiply/components/BoardCol.tsx:131`), swapping in a `.verdictSlot`. Which
is `display: none` by another route.

The arithmetic, from the stylesheets rather than from a screenshot:

| wordiply, below the board | height |
|---|---|
| playing — `.kbFeedback` `min-height: 2rem` + three cap rows (`3 × 3.2rem` + `2 × 0.4rem`) | ≈ 12.4rem |
| terminal — `.verdictSlot` `min-height: 3.6rem` | 3.6rem |

Nothing reserves the difference. **Wants a headless measurement before the fix**
— the board is sized off `--avail-h` and could absorb some of it — but the
numbers say the column moves about 8.8rem at the frame the game ends.

`BoardCol.tsx` is a game file, so any change is evidence-and-fix-forward and is
not blessed. Whether wordiply should pass `gameOver` or keep a deliberately
different terminal layout is the decision in it.

### F-onscreen-keyboard-3 · `props-wear-the-marker` · Four props carry `/**`

**SHIPPED, 2026-09-22.** The props block takes `//` throughout. Two `/**`
remain in the file and both sit on a whole declaration — `KeyTone` and the
component.

`actSubmit`, `gameOver` and `keyStates` each carry a `/**` block, and
`actSubmit`'s runs nine lines. A props block is one declaration and a note on
one prop is a note on one of its members, so these are `//`. The docstring that
answers *how do I call this* is the component's own, which is already there and
good.

This is the case §4 says the marker pass keeps missing, and the reason is
visible here: the block reads as API surface, so the marker looks earned.

### F-onscreen-keyboard-4 · `game-roster-in-the-prose` · Both files name the two games that use it

**SHIPPED, 2026-09-22.** Three places named games; none does now. Each states
the CONDITION instead — a game with per-letter feedback passes `keyStates`, one
without passes none — which survives a third caller. The stylesheet's *"the only
other user"* went with them.

The component docstring: *"Shared by **wordle** (which tints keys with
per-letter feedback via `keyStates`) and **wordiply** (no tint)."* `KeyTone`'s
docstring names wordiply again. The stylesheet goes further and writes a count
into it — *"(wordiply, the only other user, tints no keys at all)"*.

A roster of games rots, and "the only other" rots faster. What is durable is the
CONDITION: a game that has per-letter feedback passes `keyStates`, one that does
not passes none and every cap stays neutral. That sentence survives a third
caller; this one does not.

### F-onscreen-keyboard-5 · `css-prose` · The stylesheet argues with a design it already replaced

**SHIPPED, 2026-09-22.** The two blocks above the tones are one, in the order a
reader needs: what the judged caps wear and why they name it, then why each
re-sets the hover token (with the specificity numbers kept — that is the part
that bites), then the untried cap's lightening, then the darker edge. The
seven-token story is gone. The shadow comment's *"does, though —"* is a sentence
again.

Three things in one file, all prose:

- **Archaeology.** *"this component used to read seven `--kbd-*` color tokens
  with fallbacks, which wordle then overrode with seven declarations that set
  each one to exactly the value its fallback already had"* — a defeated design
  described at length. What a reader needs is the rule that won: the judged caps
  wear the wordle palette directly and say so by name.
- **A sentence that did not survive its own edit.** *"and the hover deepens more
  than a tile's does, though — a keycap is small and packed against its
  neighbors"*.
- **Two blocks saying one thing.** The paragraph above `.wordleGreen` explaining
  the hover token, and the paragraph above that explaining the palette, are one
  subject split in two with the archaeology between them.

### F-onscreen-keyboard-6 · `css-literals` · Five pending rows in the vocabularies guard

**SHIPPED, 2026-09-22.** Three converted, three recorded — Joel ruled each.

| literal | outcome |
|---|---|
| `4px` radius | `--radius-sm`, the same value under its name |
| `80ms` transition | `--transition-duration-nudge` — a cap answering the pointer by moving a little, which is what that token is for |
| `0.6` disabled | **`--chrome-disabled-opacity`**, and it is a visible change: `0.75`, so a disabled key fades LESS than it used to |
| `0.4rem` row gap | recorded |
| `1.2rem` / `0.85rem` cap sizes | recorded |

The opacity is the one that moved the pixels, and it follows a decision the
file had already made one rule above: the cursor comment settles that a key is
a CONTROL when disabled — *"a refusal, not the key ceasing to be a key"* — and
this is the same call applied to the fade.

**Both recorded rows are PAIRS**, which is what the guard entries now say. The
two gaps are chosen against each other (0.4rem down, 0.3rem across, so the
keyboard runs tighter across than down) and the ramp has a step for neither;
moving one alone would break the pair. The two cap sizes likewise: 1.2rem is
deliberately bigger than a letter needs because the glyph is the cap's whole
content and it is what rescues ⌫, and 0.85rem is what "Enter" has to shrink to
so a WORD fits. **That 0.85rem equals `--font-size-2` is a coincidence of
arithmetic** (Joel, explicitly) — it was reached by fitting a word to a key and
would follow the key, not the ramp, if either moved.

Planted: a `5px` radius put back fails the guard.

`4px` (the cap radius), `0.4rem` (the row gap), `1.2rem` / `0.85rem` (the cap
and the Enter word), `0.6` (the disabled opacity) and `80ms` (the transition)
are all unconverted. `rank-ladder` took eleven such rows down to three, each
remaining one a recorded decision; the guard file itself is not on this roster
(Joel, 2026-09-22), so this is an edit to it, not a claim on it.

### F-onscreen-keyboard-7 · `two-prefixes-for-three-locals` · `--key-*` and `--kb-*` in one stylesheet

**SHIPPED, 2026-09-22** (Joel chose "pick one local prefix"). `--kb-gap` is
`--key-gap`; the three locals are one family, and the FILE now states the
boundary rather than leaving a reader to infer it:

> `--kbd-*` comes from the theme and a rule here may only READ it — except
> `--kbd-key-hover-fill-color`, which a tone re-sets on purpose. `--key-*` is
> this file's own arithmetic, declared here and read nowhere else in the app.

Collapsing all three into `--kbd-*` was the alternative and was rejected for
losing exactly that: this file's hover mechanism turns on knowing which token a
rule may re-set and which it may only read, and one family cannot say it.

Verified the locals really are private — nothing outside the folder reads
`--key-shadow`, `--key-hover-shadow` or the gap. **Planted a half-done rename**
(one `var(--kb-gap)` left behind) and `cssTokens` catches it as a phantom token,
so the rename cannot have left a dangling reader — which matters here, since an
undefined `var()` voids its whole declaration rather than failing loudly.

`--key-shadow` and `--key-hover-shadow` sit three lines above `--kb-gap`, all
three local to `.keyboard` and invented by this file. Two prefixes for one
component's private tokens, and neither matches the `--kbd-*` family the file
also reads from the theme. Cosmetic, but it is three declarations in one rule.

### F-onscreen-keyboard-8 · `no-spec-of-its-own` · Every test that reaches the caps is wordle's

**SHIPPED, 2026-09-22.** `GuessKeyboard.test.tsx`, eight cases, mounting the
component with `boundActionFixture` for the two commands.

**The gap it closes is the reason the component exists: nothing had ever tapped
a key.** The e2e locates caps by name to read their color, and every typing test
in both games drives PHYSICAL keys — so the whole suite would have stayed green
with `onKey` wired to the wrong letter. Planting exactly that (`onKey(ch)` →
`onKey(ch.toUpperCase())`) now fails two cases.

Four plants, all bite:

| planted | caught by |
|---|---|
| `onKey` hands back the wrong letter | the two typing cases |
| the command caps stop reading their binding | the gray-Enter-live-letters case |
| the caps stop refusing focus | the focus case |
| the tone class stops being applied | the tint case |

The second is the docstring's central claim, and was unasserted: a cap and its
physical key are one binding drawn twice, so Enter can be gray over an empty
guess while every letter beside it is pressable.

**What this file deliberately does NOT take from the consumers.** The computed
colors stay in `e2e/wordle-keyboard.e2e.ts`, where a browser can read a fill and
an ink; the withdraw stays pinned at both consumers, since it is about a game's
terminal frame rather than the component's own contract.

**Two slips in writing it, both caught by running it.** A case asserted an
inventory of 26 caps without rendering anything — it passed nothing and failed
on an empty `<body />`. And `getByRole`'s `name` matches a SUBSTRING, which for
one-character caps means `q` also matches nothing else by luck rather than by
rule; the helper anchors the name as a regex instead.

The folder has no test. What covers it is `e2e/wordle-keyboard.e2e.ts`,
`e2e/wordle-mobile.e2e.ts` and `src/wordle/components/PlayArea.test.tsx` — all
good, all one consumer's, and all reaching the component through a game.

So two behaviors this component owns are unpinned: **wordiply's mount**, which
passes a different set of props and is the caller that F-2 is about; and the
`gameOver` withdraw, whose whole point is that the box stays — a property no
wordle test asserts and that a unit test could hold cheaply.

## What checked out

Claims re-verified rather than taken from the prose, so the closing re-read does
not redo them:

- **`--avail-w` resolves.** `.keyboard`'s `width: min(var(--avail-w), 30rem)`
  would void the whole declaration if the token were absent; it is declared in
  `common/game-page/playArea.module.css`, twice, once per layout.
- **`aria-label="Keyboard"` is load-bearing** — an e2e locator
  (`[aria-label="Keyboard"] button`) and a unit `getByLabelText('Keyboard')`.
  Not to be tidied.
- **The caps already refuse focus.** `onMouseDown` is canceled on all three kinds
  of cap, with the reason written on the first — the same treatment
  `SetupDisclosure` took today, and the comment predates it.
- **The two command caps really are the game's bindings**, spread from
  `actionSurface`, with `aria-label` and `disabled` re-applied AFTER the spread
  so the cap keeps its own name and the game keeps its own gate.
- **`KeyTone` excludes `blank` deliberately**, and the keyboard's stylesheet
  defines the three judged classes and no `.blank` — which `wordle-style`'s
  palette guard now knows about by name.

### The closing re-read — 2026-09-22

**Three findings, F-onscreen-keyboard-9 to -11, all worked.** The whole area in
one sitting: all three roster files, `doc.md`, `todo.md`, and the evidence this
area changed — wordiply's `BoardCol.tsx`, its `PlayArea.module.css` and its
spec, plus the five `vocabularies` entries. The docstring-marker pass ran here
as well as at F-3; the props block stayed correct and the new spec's markers sit
on declarations.

**Two of the three are the day's own prose, which is the fourth area running.**

### F-onscreen-keyboard-9 · `spec-header-rosters-and-narrates` · The new spec's own header

**SHIPPED, 2026-09-22.** `GuessKeyboard.test.tsx`, written an hour earlier,
opened by listing the coverage it was joining — *"wordle's `PlayArea.test.tsx`
and two e2e specs, plus wordiply's terminal test"* — and then narrating the
state before it existed: *"nothing had ever tapped a key. Every test in the repo
would have stayed green…"*.

**That is F-4 and archaeology together, in the file this area wrote after fixing
F-4.** A roster of test files rots the moment coverage moves, and what came
before this file is not something its reader needs. It now says what it covers
and what it deliberately leaves to a browser — conditions, not a history.

### F-onscreen-keyboard-10 · `over-long-line-and-a-daylight-claim` · The shadow comment

**SHIPPED, 2026-09-22.** One line ran past 100 characters in a file that wraps
near 80, and it carried a claim true in one theme: *"with the cap going white
underneath"*. White is daylight's `--kbd-key-hover-fill-color`; midnight's is a
dark brown. It says "taking its hover fill" now, which is true in both and
shorter.

### F-onscreen-keyboard-11 · `doc-md-predates-three-findings` · The harvest

**SHIPPED, 2026-09-22.** `doc.md` was written at F-1, before F-6, F-7 and F-8
happened, so three durable things the area learned lived only in a stylesheet
comment, a guard entry, and a test file. Now in `## Details`: the two token
families and why the one exception is the hover mechanism; the two bespoke
sizes, each half of a pair, and why neither can take a ramp step; and where the
coverage lives and why it is split three ways.

The `aria-label` item stopped enumerating its users, which was a small roster of
the same kind F-4 and F-9 are about.

## Notes

*(things worth remembering about this area that are neither a finding nor
owed work — a forward-fix made from another area, a question for the opening,
a dependency listed and left. Anything durable goes to the folder's `doc.md`
or `todo.md` instead; a note here never stands in for either)*

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

## Closing

- [x] the whole area re-read in one sitting after the last group — 2026-09-22,
      three findings, all worked
- [x] the folder's `doc.md` intro written; `shared/onscreen-keyboard` off
      `INTROS_OWED` (F-1), and harvested at the re-read (F-11)
- [x] `todo.md` holds everything still owed — which is nothing: no finding was
      handed on, and nothing durable is left in this file
- [x] every file on the roster blessed — checked by reading each of the three
      first lines, not by counting stamps: `GuessKeyboard.tsx`, its stylesheet
      and its spec all say `cs-blessed-onscreen-keyboard`

## Closing summary

Moved here from `plans/app-audit.md` (its "Where to start" notes and its row in
the areas table) when that file was trimmed to the process, 2026-09-23.

**CLOSED 2026-09-22, blessed.** the on-screen QWERTY for a game whose letters land on the board. Three files `cs-blessed-onscreen-keyboard` — the component, its stylesheet, and the spec this area wrote; opened, read, worked and closed in one day. **Eleven findings in `plans/areas/onscreen-keyboard.md`, all worked** — eight from the read, three from the closing re-read. **What the folder turns on is that its caps are two different things**: the 26 letters are KEYS that hand back a character (an action apiece would be a registry entry per keycap), while ⌫ and Enter are the GAME's own bindings worn through `actionSurface` — one binding drawn twice, which is why Enter can sit gray over an empty guess while every letter beside it is live. **The finding with a consequence was a consumer's:** `gameOver` withdraws the keyboard while keeping its box, and the stylesheet argues inside a drawn box that layout must never move on a state change — but wordiply never passed it, branching on `isTerminal` and unmounting instead, which is `display: none` by another road and about 12.4rem of column gone on the frame a player starts reading their verdict. Fixed forward, and pinned: the first spec for it asserted the keyboard was still in the document, which PASSES with `gameOver` dropped entirely, so it asserts the withdraw class too. **The folder had no spec of its own, and the gap was the reason it exists** — the e2e locates caps to read their color and every typing test in both games drives PHYSICAL keys, so nothing had tapped one and `onKey` wired to the wrong letter would have left the suite green. Four plants against the new spec all bite. **Five pending `vocabularies` rows became three converted and two recorded**, both recorded ones being PAIRS chosen against each other — the two gaps, and the two cap sizes; that `0.85rem` equals `--font-size-2` is a coincidence of arithmetic (Joel), reached by fitting a word to a key. The disabled fade took `--chrome-disabled-opacity` and got lighter, following the decision the rule above had already made about a key being a control. **The closing re-read caught the day's own prose for the fourth area running:** the spec written an hour earlier opened by rostering the coverage it was joining and narrating what came before it — F-4's fault plus archaeology, in the file written after fixing F-4. **Handed on:** nothing — `todo.md` is empty
