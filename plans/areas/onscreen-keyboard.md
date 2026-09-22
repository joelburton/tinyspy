# Area: onscreen-keyboard

The folders it reads: `shared/onscreen-keyboard`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN** (2026-09-22).

## The roster

Agreed with Joel 2026-09-22, `cs-met-onscreen-keyboard`:

| file | what it is |
|---|---|
| `src/shared/onscreen-keyboard/GuessKeyboard.tsx` | the QWERTY caps, their tones, and the two command keys |
| `src/shared/onscreen-keyboard/GuessKeyboard.module.css` | its stylesheet |

`doc.md` and `todo.md` are on the roster and carry no stamp, markdown having
nowhere to put one. **The folder has no spec of its own** — what coverage
exists is at the consumers.

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

## Notes

*(things worth remembering about this area that are neither a finding nor
owed work — a forward-fix made from another area, a question for the opening,
a dependency listed and left. Anything durable goes to the folder's `doc.md`
or `todo.md` instead; a note here never stands in for either)*

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design written; its row off `INTROS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
