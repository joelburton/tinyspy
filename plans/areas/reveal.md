# Area: reveal

The folders it reads: `reveal`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN — audited 2026-09-18; the prose pass done 2026-09-18 (F-1 to
F-7); F-8 and F-9 await a decision, F-10 is ruled and unworked.** Roster agreed
2026-09-18 (Joel: *"this is a tiny section, just do the audit"*) and the two
code files stamped `cs-audited-reveal`. Taken in order after `terminal` (row
44); this is row 45.

## The roster

`src/common/reveal/` — showing the answer once a game has ended. Two files
`cs-audited-reveal`, plus the folder's own two docs (not stamped; the script's
scope is files with a first-line comment):

- `useSolutionReveal.ts` — the hook, and `solvedByMe`, the predicate for its
  one option
- `useSolutionReveal.test.ts`
- `doc.md` · `todo.md`

**Left off the roster on purpose:** the ten PlayAreas that call the hook are
consumers, each its own game's area. `act-reveal` and its two icons are
`actions`' and `icons`' (both closed). `docs/common.md → Revealing the
solution` and `docs/ui.md → Terminal results` are read as evidence and fixed
where they are wrong, as any doc is.

**`todo.md` handed the area nothing** — empty in all four sections.

## The state, simply — AS FOUND

One hook, one predicate, and a design that has already shipped and is
documented in `docs/common.md → Revealing the solution` (2026-08-15) and
`docs/ui.md → Terminal results` (the clear-win default, 2026-08-15, corrected
for coop 2026-08-16). The plan's row 45 said the area "has to build" this
taxonomy; it was built three weeks before the row was written (F-7).

```
<PlayArea>                              ten of sixteen games
└── useSolutionReveal({ impliedBy? })    LOCAL, per-player, unpersisted: { revealed, toggle, hide, reset, impliedBySolve }
     ├── impliedBy: solvedByMe({ isCompete, playState, mine })   the six clear-win games
     └── act-reveal's describe()          impliedBySolve → disabled "Solution already shown"
                                          revealed → "Hide …" + IconHideSolution
                                          else → "Reveal …", disabled until isTerminal
```

(`reset` and `hide` are on the interface and nothing calls either — F-10.)

| game | passes `impliedBy` | its Reveal/Hide labels |
|---|---|---|
| connections · psychicnum · stackdown · strands · waffle · wordle | `solvedByMe(...)` — compete asks my own solved bit, coop asks `playState === 'won'` | stackdown: *solution*; strands, waffle, wordle: *answer*; connections: *categories*; psychicnum: *secrets* |
| codenamesduet · crosswords · letterboxed · wordiply | nothing — no clear win | crosswords, letterboxed: *solution*; codenamesduet: *partner's key*; wordiply: *best word* |
| boggle · spellingbee · wordwheel | — | no reveal control: the word list's found/missed filter is it |
| bananagrams · scrabble · setgame | — | no answer to reveal |

The hook is 9 lines of code under 52 lines of docstring. State is one
`useState<boolean | null>` — `null` is "no opinion, follow `impliedBy`" — and
`revealed` is derived each render, which is what lets a solve that lands after
mount still start shown. The folder's tests are green (1 file, 7 tests); the
`describe()` blocks in the six clear-win games are near-identical copies.

## Findings

*(`F-reveal-1 · slug · title`, one heading each, with its status after it when
it has one; no status means OPEN. F-1 to F-6 are prose; F-7 is the plan's own
row; F-8 and F-9 wait for a decision; F-10 is Joel's, a deletion.)*

### F-reveal-1 · `interface-members-wear-docstrings` · `SolutionReveal`'s five members carry `/**` — WORKED

`revealed`, `toggle`, `hide`, `reset`, `impliedBySolve` each open with `/**`.
§4 → The docstring marker: the interface is one declaration, a note on one
member is `//`, and the docstring that answers *should I read this* is the
interface's own (which exists: *"What `useSolutionReveal` hands back — see the
hook"*). The notes themselves are right and stay as `//`. `solvedByMe`'s
`mine` parameter has the same `/**`.

`revealed`'s note also quotes the two faces as *"Reveal solution" or "Hide
solution"* — three games say *answer* (waffle, wordle, strands); the words are
each game's (F-9), so the note says the binding wears two faces and names
neither.

### F-reveal-2 · `hook-docstring-is-the-design` · `useSolutionReveal`'s docstring is the folder's design, its history, two censuses and a link to a memory file — WORKED

Fifty-two lines over nine of code. What is in it that is not for a caller:

- *"each is a deliberate answer to how this used to work (one shared
  `common.games.solution_revealed` column, flipped by an RPC)"*, *"one
  impatient click used to end it for the whole table"*, *"stop destroying the
  record"* — archaeology; the three properties are stated as reversals of a
  design that is gone rather than as what IS.
- *"Joel pressing Reveal doesn't open Moth's board"* — names, where the rule
  is "my looking opens nothing on a partner's screen".
- A `## impliedBy` markdown heading inside a docstring.
- The six-game and four-game rosters WITH per-game reasons (letterboxed's
  covering chain, crosswords' rebuses, wordiply's best word, codenamesduet's
  bystanders) — a census, and design prose; the reasons are good and belong in
  `doc.md`, where a game can be added without editing a hook.
- *"(the waffle loading-race lesson)"* — a lesson the reader cannot look up.
- *"see [[feedback_usestate_initializer_freezes_async_default]]"* — a wiki-link
  to Claude's memory directory, which nobody in the repo can open. The only
  such link in `src/`.

What the caller needs, ~10 lines: it is local, per-player, unpersisted state
for "am I looking at the answer"; `impliedBy` is "did I solve it" (pass
`solvedByMe`), starts the answer shown and makes `impliedBySolve` true until
the player chooses; `reset` on restart, not `hide`; a pointer at `doc.md` for
why. The *"derived, never a `useState` initializer"* paragraph defends the
`useState<boolean | null>` line and moves to it as `//` (which already carries
half of it).

### F-reveal-3 · `solvedByMe-narrates-the-ship` · `solvedByMe`'s docstring counts the games and dates a bug — WORKED

*"in the one shape all six clear-win games should use"* — a count with a
"should" in it; *"which is exactly how three of these shipped broken on
2026-08-16"* — archaeology with a date (and the date is the fix's, `09072b1e`;
the shipping was 2026-08-15). The three present-tense facts under it —
stackdown writes `players.solved` only in compete, strands' coop branch never
touches it, psychicnum counts per caller — are the REASON coop asks the game
and stay, stated as what the games do rather than as how they broke.

### F-reveal-4 · `test-headers-narrate` · Both test docstrings tell the shipping story — WORKED

`describe('solvedByMe')`: *"which is how this shipped broken"* and the same
three-game story as F-3. `describe('useSolutionReveal')`: fine. The two `/**`
blocks on `it` cases (the frozen initializer, the Restart trap) are the shape
blessed tests use (`Menu.test.tsx`, `FilterSelect.test.tsx`) and stay; the
first one's *"(the waffle loading-race lesson)"*-style aside is absent here,
so only the `describe` header changes.

### F-reveal-5 · `doc-md-one-line` · `doc.md` is one sentence — WORKED

*"Showing the answer once a game has ended."* Owed: the lede, an `## Intro to
area` (the reveal is a personal, temporary, unpersisted display choice; a game
you solved starts shown; the shield is the server's at `is_terminal` and is a
different question; who has a reveal, who has a word list instead, who has no
answer), and a `## Details` with the caller table above and the per-game
reasons F-2 moves out of the docstring. `common/reveal` then comes off
`INTROS_OWED`.

### F-reveal-6 · `docs-say-nothing-autoreveals` · Two docs say a win reveals nothing, one day before the clear-win default made six games start shown — WORKED, and it was in ten more places

- `docs/common.md → Revealing the solution`: *"**Nothing autoreveals**, a win
  included."* Written 2026-08-15 (`72d48d94`); the clear-win default landed
  the same day (`69c693b3`), after it.
- `docs/ui.md → Terminal results`: *"Ten games hide their answer until a player
  asks … and that includes **on a win**"* — and eight lines later, *"**A game
  you SOLVED starts revealed.**"* The paragraph contradicts itself. Same
  section: *"`common/hooks/game/useSolutionReveal.ts` holds all three"* — the
  path since 2026-09-04 is `common/reveal/`.

Both say what the code does: nothing reveals on a LOSS or a manual end, and a
player who produced the answer starts with it shown.

**The same claim was in ten more places, every one of them false for its own
game** — found by grepping `autoreveal|a win included|never on its own` once
the two named docs were fixed. Six games say it, and each of the six passes
`impliedBy`: `docs/games/waffle.md` ("Nothing autoreveals, a win included"),
`docs/games/stackdown.md` ("never automatically, not even on a win"),
`docs/games/wordle.md` ("hidden at every terminal until this viewer asks, a win
included" + "Nothing autoreveals"), `docs/games/strands.md` ("nothing
autorevealed"), `docs/games/connections.md` ("nothing autoreveals"),
`docs/games/psychicnum.md` ("never on its own, a win included"), and four in
code — `stackdown/InfoCol.tsx`, `stackdown/PlayArea.test.tsx`,
`wordle/InfoCol.tsx`, `strands/InfoCol.tsx` — plus `strands/PlayArea.tsx`,
which says "Never automatically, a win included" six lines above the paragraph
explaining that a solver is the exception. All corrected here, as conformance
edits on a rule this area owns; no game's area is opened by them.

letterboxed's three and codenamesduet's one are TRUE and untouched — neither
passes `impliedBy`, so for those two games nothing does autoreveal.

### F-reveal-7 · `plan-row-says-build-the-taxonomy` · Row 45 says the area "has to build" a taxonomy that shipped 2026-08-15, and links to a `deferred.md` section that does not exist — WORKED at the audit

Written 2026-09-04 (`77653b5c`), three weeks after the work. The only reveal
item in `deferred.md` is struck through and points at `common.md`. The row is
the plan's, not durable: it now says what the area is.

### F-reveal-8 · `six-copies-of-describe` · The six clear-win games each write the same `describe()` for `act-reveal`

Every one:

```ts
if (impliedBySolve) return { state: 'disabled', label: 'Solution already shown' }
if (solutionShown) return { state: 'active', label: 'Hide solution', icon: IconHideSolution }
// Named in the inert case too: the registry's bare "Reveal" would make the
// row change its words as the game ended, which is not what it says.
return isTerminal
  ? { state: 'active', label: 'Reveal solution' }
  : { state: 'disabled', label: 'Reveal solution', tooltip: "Can't reveal until all end" }
```

Same three branches, same comment, same tooltip, in six files (and the four
no-clear-win games write the last two branches). What varies is the noun
(F-9) and the guard's name.

**Decision:**

- **(a) leave it** — a `describe()` is the game's, written beside its other
  actions, and six copies of six lines is the cost of that.
- **(b) the hook hands back the describe** — `useSolutionReveal` takes the
  noun (`'solution' | 'answer'`) and `isTerminal` and returns
  `describeReveal`, so a game writes `useBoundAction('act-reveal', {
  describe: reveal.describe, run: reveal.toggle })`. The three branches and
  the tooltip live once, beside the state they read. Ten call sites change,
  each in its own area.
- **(c) a helper in `reveal/`, not on the hook** — `describeReveal({ reveal,
  isTerminal, noun })`, the same single copy without widening the hook's
  return. Recommended: the hook stays state, the words stay a function, and a
  game that wants a different face writes its own.

### F-reveal-9 · `solution-or-answer` · The same control is "Reveal solution" in three games, "Reveal answer" in three, and the thing's own name in four

stackdown, crosswords, letterboxed: *solution*. waffle, wordle, strands:
*answer*. And four name the THING instead: connections *categories*, psychicnum
*secrets*, codenamesduet *partner's key*, wordiply *best word* — so the split is
not two nouns but three habits, and the ten sites agree only on the verb. One
control, one action id, one icon pair — the drift the UI-consistency prior is
about, with no rule choosing. The registry's own label is the bare *Reveal*.
(The inert face is *"Solution already shown"* in all six clear-win games,
`categories` and `secrets` included, which is the one place the noun is already
uniform — and in two of them it disagrees with the game's own live label.)

**Decision:**

- **(a) one word everywhere** — *solution* (the icon is `IconRevealSolution`,
  the tooltip says "reveal", ui.md's section is "Revealing the solution"), or
  *answer* (what wordle and waffle call the thing they hide). Ten sites, each
  its own area; this area records the choice and each game's `todo.md` gets
  the line. It costs the most at the four games that name the thing — "Reveal
  solution" at connections is a worse label than "Reveal categories", which is
  the argument against.
- **(b) one word for the six that hide an ANSWER, the thing's name where the
  game has one** — the drift that has no defense is stackdown vs wordle, both
  hiding the same kind of thing under two words; connections naming its
  categories is not drift. Six sites move, four stay.
- **(c) each game's word** — a crossword has a solution, wordle has an answer;
  the noun is the game's, like the title of its celebration. Then F-8's
  helper takes the noun as an argument, and no doc claims one word.

Whichever way it goes, the inert face has to follow it: "Solution already
shown" is hard-coded in all six clear-win games and contradicts two of them.

### F-reveal-10 · `reset-and-hide-have-no-caller` · `reset` and `hide` are dead since the restart key, and the docstring argues a distinction nothing uses

Joel's question at the audit: *"i suspect the 'reset' prop in SolutionReveal
is no longer needed, since restart now is a re-render, right?"* Right. Since
`24664a0a` (2026-09-15) `GamePage` keys the play surface on
`common.games.restarts`, so a restart unmounts the PlayArea and the hook's one
`useState` goes with it — the new run starts at `null`, which is "follow
`impliedBy`", which is what `reset()` did by hand. No game calls `reset()` or
`hide()`; `grep -rn '\.reset()\|\.hide()' src --include='*.tsx'` finds no
reveal caller. So two of `SolutionReveal`'s five members have no reader, the
docstring's *"Restart calls `reset()`, not `hide()`"* paragraph and the
`reset` member's note defend a case that cannot arise, and the test *"reset
hands control back to impliedBy; hide would not"* pins it.

Outside the folder, the same story: `docs/ui.md → Terminal results` says each
game *"does still owe … dropping the local reveal in its `onRestarted`"* — no
`onRestarted` exists in `src/common`; and psychicnum's PlayArea carries *"No
reveal-flag reset here: `common.reset_game` clears solution_revealed"*, a
column dropped 2026-08-15 (psychicnum's area; noted under Notes).

The fix: `reset` and `hide` leave the interface, the hook, the docstring and
the test; `SolutionReveal` is `{ revealed, toggle, impliedBySolve }`; ui.md's
sentence says a restart mounts a new surface and the reveal goes with it.

## Notes

- **psychicnum, handed on:** the *"No reveal-flag reset here"* comment (F-10)
  names a column that no longer exists. Its own area.
- **`onRestarted` survives in five sentences and nothing else** — no such
  callback exists anywhere in `src`. `docs/ui.md` ("what each game does still
  owe is dropping the local reveal in its `onRestarted`"), `docs/games/wordle.md`
  and `docs/games/psychicnum.md`, `wordle/PlayArea.tsx`'s restart comment and
  `wordle/PlayArea.test.tsx`'s. Left standing on purpose: they are F-10's, and
  F-10 is ruled but unworked. `docs/games/stackdown.md`'s went with the sentence
  F-6 rewrote around it.
- The `[[…]]` memory link in the hook (F-2) is the only one in `src/`;
  `grep -rn '\[\[' src` finds no other.
- The six per-game `// impliedBy is the exception: …` comments beside the
  hook calls (stackdown, waffle, wordle, connections, strands, psychicnum) each
  restate why that game has a clear win — the same reasons the hook's docstring
  lists and F-5 moves to `doc.md`. Consumers; noted for their areas, since once
  `doc.md` carries the reasons a call site needs one clause and a pointer.
- Dates in this file come from `git log`: the local toggle `be19d18f`
  2026-08-15; the clear-win default `69c693b3` 2026-08-15; the coop fix
  `09072b1e` 2026-08-16; the docs' "nothing autoreveals" `72d48d94`
  2026-08-15; the folder move `c2f9baf2` 2026-09-04; row 45 `77653b5c`
  2026-09-04.

## Predicted test breaks

- F-10: `useSolutionReveal.test.ts` loses its `reset`/`hide` case; nothing
  outside the folder references either.
- F-1 to F-7: none — prose, a plan row, and a guard list entry
  (`folderDocs.test.ts` `INTROS_OWED` loses `common/reveal`; the guard then
  requires the intro F-5 writes). Confirmed: `tsc -b` clean and the three games
  the sweep touched green, 385 tests.
- F-8 (b) or (c): the ten PlayArea tests that assert the labels
  (`'Reveal answer'`, `'Hide solution'`, `'Solution already shown'`) keep
  passing if the words do not change; F-9 (a) changes the words and so those
  assertions, in whichever games change.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [x] the folder's `doc.md` written (lede + `## Intro to area` + `## Details`
      with the caller table); its row off `INTROS_OWED` — 2026-09-18
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
