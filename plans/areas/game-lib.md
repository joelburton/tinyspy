# Area: game-lib

An area of app-audit's step 7. The process is [app-audit.md](../app-audit.md)
§21; **the plan holds the order** (§7 → "The areas, in order"), this file holds
everything else.

**What it is.** The non-visual half of the game shell — the registry, the
manifest contract, and the game logic every game shares, none of which belongs to
any one game: `src/common/lib/game/`, `src/common/lib/gameManifest.ts` + its test, and
`src/gametypes.ts`.

**Created 2026-09-03** by Joel, during `utils`'s opening. Two of its four groups
of files were on no area's roster at all: `deep` listed them out as "names every
game" (`deep.md:160`, `:161`) and nothing picked them up — the identical gap that
created `utils` one folder over.

**Status: OPEN.** Opened 2026-09-03 by listing the files and stopping (§21); Joel
agreed the list — *"that matches the files i'd expect"* — and then asked for it
in groups, *"so we don't have to do them all as one big audit"*, the way `deep`
ran in passes. The six groups are below.

**Where the stamps stand (2026-09-04)** — 37 files: **25 `cs-blessed-game-lib`**
(groups A–D), **8 `cs-audited-game-lib`** (group E — audited, and 8 of its 12
findings settled; it reaches `cs-fixed` when the last four do), and **4
`cs-met-game-lib`**, which is all of group F and the whole of what is unread.

## Why it runs where it runs

Two reasons, and they point the same way.

**The first game area must not open onto unread scaffolding.** Joel, 2026-09-03:
*"i don't want the first game area to have 200 dependencies just because its the
first game, and brings all the game scaffolding in at once."* The shared game
scaffolding is **155 files, 15,715 lines** across four places; §7's paragraph on
this area has the table. `psychicnum` is the control game so that what it settles
is about the *shape of a game area* rather than about a game, and it cannot do
that while §21's "dependencies are listed and left" turns its opening into a list
of 155 files.

**The split below touches 233 files.** `common/lib/gameManifest.ts` is imported across
every area in the sprint. Split it late and it edits files that are already
`cs-blessed`; split it early and every area after this one reads the settled
shape. Hence its slot near the front, ahead of the other two scaffolding areas
rather than beside them — §7 holds where, as it holds every area's position.

## The roster — 34 files, 3,240 lines

Agreed with Joel 2026-09-03 before anything was read, and stamped
**`cs-met-game-lib`**. Measured at the opening, not guessed:

| | files | lines |
|---|---|---|
| `src/common/lib/game/` | 31 | 2,181 |
| `src/common/lib/gameManifest.ts` + `gameManifest.test.ts` | 2 | 959 |
| `src/gametypes.ts` — the manifest list, the one file allowed to import each game | 1 | 100 |

**The shell's own numbers were wrong in two of three rows** and are corrected
above: it had the `gameManifest.ts` pair at 1,003 (it is 959) and `src/gametypes.ts` at 56
(it is 100). `lib/game/` was right. This is §21's rule earning itself again — *a
shell's guessed roster is a note, never a count* — and the reason to re-measure
at every opening. The split table under "Already waiting for this area" carried
the same drift (909 lines, 236 files, 361 imports) and has been corrected to the
measured 908 / 233 / 364.

**Not this area's**, and named so the boundary is visible: `common/components/game/`
is `shared-game-chrome`, and `common/hooks/game/` is a question `hooks` answers at
its own opening (§7 row 4). Adding this area deliberately does not preempt that.

**SIX FILES LEFT THIS AREA on 2026-09-04** for the new `feedback` area
([feedback.md](feedback.md)), which runs immediately after this one: the roster is
now **28 files**. `genericFeedback.ts`, `terminalCopy.ts`, `localPills.ts` +
test and `genericPills.ts` + test are one vocabulary with the feedback hooks,
`turnCopy.tsx` and `GenericFeedbackPill` — and no area's roster had ever named
that last file, which is why nobody could see the whole. Two of the six were
blessed here and two more were audited here; that work is recorded in
`feedback.md` and stands. What stayed is `feedbackTiming.ts`, whose name says
feedback but whose contents are BOARD-mark durations.

**Where the count has moved since, and why it is 37 today** — the roster above
is the measurement at the opening and stays as written; this is what has
happened to it:

| | files |
|---|---|
| agreed at the opening, 2026-09-03 | 34 |
| **left** for `feedback`, 2026-09-04 | **−6** |
| **written** here: 7 by group A (six from the split, plus `terminalOutcomeVerb.test.ts` — `F-game-lib-9`), 1 by group B (`revealWords.test.ts` — `F-game-lib-17`), 1 by group E (`gameMenu.test.ts` — `F-game-lib-37`) | **+9** |
| | **= 37** |

`genericFeedback.ts` is in both middle rows: group A's split created it and the
`feedback` move took it, six days later in file terms and one in real ones.
That is the only row where a file is counted twice, and it nets to zero.

**Reconciled against the stamps, not against this column** — `grep -rl
"cs-.*-game-lib" src` returns 37, which is the number to trust here and at
close: 27 in `lib/game/`, 4 in `lib/members/`, 3 at the `lib/` root, one each in
`lib/menu/` and `lib/setup/`, and `src/gametypes.ts`.

**A rename moves no number.** `peers.ts` → `lib/members/memberList.ts`
(`F-game-lib-34`) is the same file at a better name — still this area's, and
part of why `lib/members/` holds four today.

## The six groups

Joel asked for the area in groups rather than one audit (2026-09-03), which is
how `deep` ran — its six passes are the model. **Every file is in exactly one
group** and the counts sum to the roster: a file that belongs to two groups means
the grouping is wrong, not that the file is special.

Order is **A first**, on the same reasoning that put this area early in §7: A
holds the split, and reading B–F after it means reading them in the settled shape
instead of re-reading them once the sweep has moved five vocabularies. The
counter-argument was put and rejected — that B–F would teach what the registry
serves before restructuring it — because it trades a re-read of 29 files against
a better-informed read of 5.

### A · The registry and the manifest contract — 5 files, 1,182 lines

| file | lines |
|---|---|
| `common/lib/gameManifest.ts` | 908 |
| `common/lib/gameManifest.test.ts` | 51 |
| `src/gametypes.ts` | 100 |
| `common/lib/game/manifestRpcs.ts` | 63 |
| `common/lib/game/manifestRpcs.test.ts` | 60 |

The area's center of gravity, and the group carrying the **233-file split**
(below). `manifestRpcs` is here rather than with the live-session files because
it is the dispatcher half of the contract `GameManifest` declares — reading the
declaration without its dispatchers is how the two drift.

### B · The found-words family — 7 files, 561 lines

| file | lines |
|---|---|
| `foundWords.ts` | 54 |
| `foundWordsDisplayRows.ts` + `.test.ts` | 71 + 130 |
| `foundWordsLeaderboard.ts` | 28 |
| `rankLadder.ts` + `.test.ts` | 72 + 163 |
| `revealWords.ts` | 43 |

The most self-contained group here. Every one was extracted from byte-identical
spellingbee/wordwheel copies (`revealWords` adds boggle), so it reads as one
subsystem because it is one: the rank-ladder word-hunt model.

### C · What a game says about itself — 6 files, 439 lines

| file | lines |
|---|---|
| `setupRows.ts` | 172 |
| `difficulty.ts` | 96 |
| `statusLabel.ts` | 93 |
| `terminalCopy.ts` | 33 |
| `timerLabel.ts` + `.test.ts` | 24 + 21 |

Strings a game renders about its own configuration or its own ending — the setup
recap, the club-page status line, the terminal verdict. Three docs govern this
group ([game-status-labels.md](../../docs/game-status-labels.md),
[pdf.md](../../docs/pdf.md), [win-lose.md](../../docs/win-lose.md)), which is the
argument for reading it in one sitting.

### D · The feedback pills — 5 files, 277 lines → **1 file, 25 lines**

**Audited 2026-09-03; FOUR OF ITS FIVE FILES LEFT THE AREA 2026-09-04.**
`localPills.ts` + test and `genericPills.ts` + test went to `feedback`
([feedback.md](feedback.md)) — the audit is what showed they were one vocabulary
with six hooks, `turnCopy.tsx` and a component no roster owned.

What remains in this group is **`feedbackTiming.ts` (25 lines)**, which was only
ever here because of its name: it holds the durations of BOARD marks — the
attention wash, the your-turn frame — and answers to tile-feedback, not to
pills. Its finding (`F-game-lib-29`) stays with it.

### E · The live session — 7 files, 532 lines in → **8 files, 680 lines out** — **audited + fixed 2026-09-04**

| file | lines in | lines now |
|---|---|---|
| `gameMenu.ts` | 128 | 129 |
| `gameMenu.test.ts` | — | **122** — written by `F-game-lib-37` |
| `gameInvites.ts` + `.test.ts` | 113 + 73 | 115 + 73 |
| `pause.ts` + `.test.ts` | 35 + 90 | 43 + 90 |
| `infoSheetStore.ts` | 57 | 57 |
| `peers.ts` → **`lib/members/memberList.ts`** | 36 | 51 — moved by `F-game-lib-34`, still this area's |

Six files in `lib/game/`, plus the test one of them earned and the one that left
the folder. The growth is all docstrings and one test file; no behavior changed
anywhere in the group.

A game in progress: who is seated, who is connected, what the menu offers, which
mobile page is showing. **The loosest of the six** on the way in — `gameMenu.ts`
and `infoSheetStore.ts` are chrome-adjacent, talking to `shared-game-chrome`'s
components, so the seam that bothers anyone bothers them here. It was offered a
redraw into presence/seating + the two chrome stores and **did not need one**:
the audit found the loose file was `peers.ts`, which was not about this seam or
any other in `lib/game/`, and moving it out left the rest coherent. It stays
this area's file at its new path.

### F · The two pure algorithms — 4 files, 249 lines

| file | lines |
|---|---|
| `trie.ts` + `.test.ts` | 93 + 58 |
| `gridCursor.ts` + `.test.ts` | 47 + 51 |

Pure math shared by exactly two games each (`trie`: boggle + scrabble;
`gridCursor`: bananagrams + scrabble), both fully tested, neither touching the
shell. The group whose position in the order matters least.

## Group A — the registry and the manifest contract, read 2026-09-03

Five files, 1,182 lines, all five read in full. **No logic bug.** The shipped
behavior is correct everywhere; all nine findings are about what the files SAY.
Three more were raised later: `F-game-lib-10` and `F-game-lib-12` (group A's,
both resolved), and `F-game-lib-11` (**group B's**, filed here rather than
fixed).

**Fourteen resolved 2026-09-03** — `F-game-lib-1` (the split, which Joel authorized
after the audit), with `F-game-lib-2`, `F-game-lib-4` and `F-game-lib-10` as its
consequences, then `F-game-lib-3`, `F-game-lib-5` and `F-game-lib-6` on their
own, `F-game-lib-12` after Joel found the two `games.ts` files, and
`F-game-lib-7`, `F-game-lib-8` and `F-game-lib-9`; then, over the twelve
files once they were done, `F-game-lib-13` (a comments pass) and
`F-game-lib-14` (the `terminalOutcomeVerb` rename). **Group A is CLOSED.** **One open elsewhere:**
`F-game-lib-11`, which group B resolves.

**Three of the six resolved turned out bigger than filed**, all the same way:
the audit caught a wrong number, and fixing it meant re-reading the file, where
the neighboring sentences were wrong about something that mattered more.
`F-game-lib-3` was filed as one stale count and was four false claims;
`F-game-lib-5` was filed as a stale max and turned up a bound that four games
enforce only on the client; `F-game-lib-10` did not exist until `F-game-lib-1`
moved the declaration it sits on. **A counted claim is a good smoke detector for
a docstring nobody has re-read** — worth remembering when groups B–F turn up the
next one.
which in a file 233 others import is the product, because nobody reads
`games.ts` to learn what it does, they read it to learn what they may rely on.

**The recurring fault is a counted claim that stopped being true.** Four of the
nine are a number the file states and the tree contradicts — ten games, fifteen
games, one player-count max, one status consumer. This is `F-deep-27`
(`fifteen-games`) again, and it is worth naming as a pattern rather than fixing
four times quietly: **a count in a docstring is a claim with an expiry date, and
nothing in the repo checks one.** Every instance here is in the file the whole
app imports, so each wrong number is read by the most people possible.

### The split's own numbers, re-measured

Group A's work is the `games.ts` split, so its sizing was re-counted before
anything else. The shell's figures were close but not right, and the corrected
ones are used from here on:

| | shell said | measured 2026-09-03 |
|---|---|---|
| files importing `common/lib/games` | 236 | **233** |
| named imports across them | 361 | **364** |

Counted by resolving every `from '…games'` specifier to an absolute path, which
is what the earlier count missed: `from '../../../games'` from a component folder
is `src/games`, the REGISTRY, not this file. Eleven files import that one, and
they are not part of the split.

**The split table's own rows were right all along** — every per-name figure
re-verified exactly, and its five subtotals (129 · 97 · 80 · 44 · 14) sum to
**364**, the measured number. Only the sentence above the table said 361. So the
work the table represents stands; it was the summary line that drifted, which is
the same fault as `F-game-lib-3` through `F-game-lib-6` and in the same document
that is finding them.

One row could not be verified because its count is zero — `playerOutcome`, listed
without a number. See `F-game-lib-9`.

## Findings

*(IDs are `F-game-lib-1`, `F-game-lib-2`, … — §21 → Areas. Every heading states
its status; no status prefix means OPEN.)*

**Citations name a SYMBOL, not just a line** (Joel, 2026-09-03, on finding
`F-game-lib-7` pointing at `games.ts:68` — a line the split had moved 40 rows and
which by then landed in the middle of a docstring it had nothing to do with).
This area moved 233 files in one commit, so every bare line number in it went
stale at once. Write `gamePageCtx.ts:55 — GamePageCtx.timer`: the number is the
convenience and the symbol is what survives the next sweep.

**An OPEN finding's citation points at the code now; a RESOLVED one's points at
where the fault WAS.** Those are different claims and both are wanted — the
second is the record of what was found, and updating it to a line that no longer
holds anything would erase that. Resolved findings whose lines have since moved
say so at the top of the finding.

### RESOLVED 2026-09-03 — F-game-lib-1 · `registry-has-no-header` · The file 233 others import opens with no docstring

`games.ts` is 908 lines holding five unrelated vocabularies, and **there is no
module docstring**. The first `/**` in the file is line 11, and it belongs to
`MODE_LABEL`. Nothing at the top says what the file is, why these five things
live together, or which of them a newcomer should expect to find here.

The only description that exists is `docs/common-folders.md:134` — *"the
GameManifest type + registry helpers"* — and the shell already records that as no
longer true. So the file's one-line summary lives in another document and is
wrong, which is the worst of both.

`GameManifest` is 22 of 364 named imports. The most-imported name in "the
registry file" is `Member`, at 103, which names no game.

This finding is the argument for the split rather than a request for a header:
a docstring honest about today's contents would have to say "five vocabularies
that share a file for historical reasons," and writing that sentence is what
makes the split obviously right. **Resolve it by splitting**, not by describing.

#### Resolved by doing the split, 2026-09-03

Joel: *"do it"*, on the recommendation to split now rather than plan it first,
in the order smallest-first so the codemod was proven on 14 call sites before it
ran on 129. **`games.ts` 908 → 487 lines**, and what is left is one subject: the
manifest a game declares and the ctx the shell hands back. It now opens with the
header this finding asked for, whose last section is the list of what moved.

| moved | to | imports |
|---|---|---|
| `MenuSection` `MenuApi` `MenuItem` `MenuHeader` `MenuAction` `MenuSubmenu` `MenuItemBase` `isSubmenu` | `lib/menu/menu.ts` | 14 |
| `GenericFeedbackMsg` `GenericFeedbackApi` | `lib/feedback/genericFeedback.ts` | 44 |
| `SetupOf` `SetupSetter` `SetupBodyProps` `GameSetupForm` | `lib/setup/setupForm.ts` | 80 |
| `Member` `GamePlayer` | `lib/members/member.ts` — **types only** | 121 |
| `playerOutcome` `outcomeVerb` | `lib/members/playerOutcome.ts` | 7 |
| `RichMessage` → `RichMessageType` | `components/text/RichMessage.tsx` | 1 |

Stayed, each for its own recorded reason: `GameManifest`, `GamePageCtx`,
`CommonGameListRow`, `TimerMode`, `GameStopResult`, `MODE_LABEL`, the three
`playerCount*` helpers, and `CreatedGame` — the one that reads like setup and
stays anyway, beside the interface it satisfies.

**Three things the split turned out to do beyond its own scope:**

1. **`games.ts` no longer imports from `components/`.** The `FormErrors` import
   that made the registry depend upward went with `SetupBodyProps`. The seam is
   not fixed — `lib/setup/setupForm.ts` has it now — but it is no longer on the
   file 233 others import. Still `forms`'.
2. **`members/member.ts` is types-only, and that is enforced by having nowhere
   else to put a value.** `playerOutcome` and `outcomeVerb` went to a sibling
   module precisely so the 121-importer module has no runtime half. `games.ts:5`'s
   standing cycle warning is now about a much smaller file.
3. **`F-game-lib-2` and `F-game-lib-4` fell out of it** — see their entries.

**Verified:** `tsc -b` clean, `vite build` clean (599ms, chunking unchanged),
**Vitest 2556/2556 in 269 files**. The build matters more than usual here: it is
the only check that resolves every import in the project.

### RESOLVED 2026-09-03 — F-game-lib-2 · `two-orphaned-docstrings` · Two stacked docstrings, both allowlisted to this area

*(Line numbers below are where these WERE, at the audit. Both are resolved and
the declarations have since moved — see the resolution note.)*

`games.ts:414` and `games.ts:588` are the stacked-docstring fault that
`src/guards/orphanedDocstrings.test.ts` exists for, and both sit on that guard's
`KNOWN` list (lines 66–67) awaiting this area:

- **`:402-413`** documents `SetupBodyProps` — *"Props the per-game setup-form body
  receives from the common `SetupGameModal` wrapper…"* — and is followed
  immediately by `:414-425`'s docstring for `SetupOf`. `SetupOf` gets documented
  twice over; `SetupBodyProps`, declared 36 lines later at `:450`, reads as
  undocumented.
- **`:582-587`** documents `GameManifest` — *"Manifest exported by each game's
  `manifest.ts`…"* — and is followed by `:588-592`'s docstring for
  `GameStopResult`. `GameManifest`, declared at `:595`, reads as undocumented.

Both stranded docstrings are correct prose about the right thing, merely attached
to their neighbor — the guard's own description of the fault. The guard says the
area that opens the file removes its lines, *"never add one to quiet a new
failure"*, so **the fix includes deleting `orphanedDocstrings.test.ts:66-67`** and
the shrinking allowlist gets two entries shorter.

#### Resolved 2026-09-03, and the first one fixed ITSELF

`F-game-lib-1`'s split resolved the `SetupBodyProps` orphan without anyone
aiming at it: the prose traveled to `lib/setup/setupForm.ts` attached to the
declaration it describes, because moving a docstring means deciding what it is
about. **That is the argument for splitting a file rather than annotating one**,
in one instance — the orphan existed only because the two declarations were
neighbors, and they stopped being neighbors.

The `GameManifest` one had to be fixed by hand (it and `GameStopResult` both
stayed), and it was: the two declarations swapped places, so each sits under its
own prose. Both allowlist lines are deleted.

**The guard then caught the sweep, which is worth recording.** Its allowlist is
keyed `path:line`, and rewriting imports in eight OTHER areas' files moved their
orphans by one to four lines — so ten entries failed at once, two because they
were fixed and eight because they had drifted. The eight were re-anchored, not
resolved; they are still their own areas' to fix. **Any future import sweep will
do this again**, and the guard's failure message ("fixed, or moved") is the only
thing that tells the two apart.

### RESOLVED 2026-09-03 — F-game-lib-3 · `dispatcher-says-ten-games` · "all ten games" is sixteen

*(Line numbers in this finding are where things WERE, at the audit; it is
resolved and the file has since been rewritten.)*

`manifestRpcs.ts:43`: *"Collapses the byte-identical `submitTimeout` / `endGame`
wrappers across all ten games."*

`makeRpcDispatcher` has **16** callers — one per game folder, every one of them:

```
bananagrams boggle codenamesduet connections crosswords letterboxed psychicnum
scrabble setgame spellingbee stackdown strands waffle wordiply wordle wordwheel
```

The number matters more than usual here because the file's own test docstring
argues from it: *"it is ONE frontend path over sixteen SQL definitions, so a
regression here breaks every game at once."* The test says sixteen and the source
says ten, in a two-file group, about the same fact.

Fold in while there: the file ends with **three trailing blank lines**
(`manifestRpcs.ts:61-64`), the residue of the deleted start-game adapters. ESLint
does not flag it.

#### Resolved 2026-09-03 — and the count was one of FOUR false claims

Fixing the number meant re-reading the file, which is the standing rule after
any count fix, and the other three were worse than the one that was filed.
**Three of the four are residue from the envelope conversion** — this file's own
docstring boasts about having survived that conversion while three of its
sentences still describe the shape from before it.

| claim | where | truth |
|---|---|---|
| *"across all ten games"* | `:43` | sixteen; every game folder, twice each |
| *"turn a `db.rpc(...)` into the **`{ error?: string }`** shape the GameManifest contract wants"* | file docstring | the contract wants `Promise<Envelope<GameStopResult>>`. There is no `{ error?: string }` anywhere in this path |
| *"Build the game-agnostic **`(gameId) => Promise<{ error? }>`** dispatcher"* | `:41` | same, on the function that returns it |
| *"generic … so a game whose schema lacks, say, `end_game` (**bananagrams**, which uses per-player concede) still satisfies `RpcClient<'submit_timeout'>`"* | `:28-30` | bananagrams has `end_game` — `supabase/sql/bananagrams.sql:1342` defines it and `src/bananagrams/manifest.ts:123` wires it. All sixteen game schemas define BOTH (measured; a seventeenth definer is `common.sql`'s own). It has per-player concede *as well as*, not *instead of* |
| *"We only need the `{ error }` off the awaited result"* | `:30` | both halves are needed — on a 2xx the envelope arrives in **`data`**, which is `runRpc`'s whole job, and `RpcClient` declares `data: unknown` for exactly that reason |

The generic over `F` is KEPT, with an honest reason replacing the false one: no
game needs the narrowing today, and it costs nothing to state the per-call
requirement rather than a module-wide one. **The mechanism was right and only
its justification was stale** — which is the trap in fixing a docstring by
deleting the sentence that turned out to be wrong.

The file docstring was also rewritten to open with what a caller wants (build
the two manifest members, here is the call) rather than with the history; the
adapters paragraph is kept, after it. Trailing blank lines trimmed.

**Checked and still true:** everything in `manifestRpcs.test.ts`. Its "ONE
frontend path over sixteen SQL definitions" was already right — the pair
disagreed, and the test was the half telling the truth. Its claim that
`runEdgeFn` is tested in `dbResult.test.ts` holds (14 references there).

**Verified:** `tsc -b` clean, ESLint clean, Vitest 263/263 across the file's own
spec plus all 23 guards.

### RESOLVED 2026-09-03 — F-game-lib-4 · `menu-icon-says-fifteen-games` · "all fifteen games" is sixteen

`MenuItemBase.icon`'s docstring — the one that calls itself
*"the icon language's legend"*: *"it reads in all fifteen games afterwards."*

Sixteen game folders, and `src/gametypes.ts` registers 30 gametypes across them. The
argument the docstring makes is unaffected; only its count is wrong.

#### Resolved in passing 2026-09-03, and flagged rather than done quietly

`F-game-lib-1`'s split moved this docstring to `lib/menu/menu.ts`, and the
number was corrected to sixteen on the way. **That is a content change inside a
shape change**, which the split was not supposed to make — but the alternative
was worse: copying a claim this file had just recorded as false into a brand-new
module, where the next reader has no reason to doubt it. Recorded here so the
deviation is visible rather than buried in a rename diff.

Nothing else moved with an edit. Every other docstring in the six new modules is
byte-identical to what it was in `games.ts`, except `SetupBodyProps`'s — see
`F-game-lib-10`.

### RESOLVED 2026-09-03 — F-game-lib-5 · `player-count-doc-names-one-max` · A stated max that four games don't use

`games.ts:324` — `GameManifest.numberOfPlayers`: *"For an 'any club' game,
pick a reasonable max — today we use 6 for all the open-N games (connections,
psychicnum, spellingbee) and `[2, 2]` for fixed-seat codenamesduet."*

Measured across all 16 manifests (30 entries):

| range | entries |
|---|---|
| `[1, 6]` | 12 |
| `[2, 6]` | 11 |
| `[1, 8]` | 2 |
| `[2, 8]` | 2 |
| `[1, 4]` | 2 |
| `[2, 2]` | 1 |

So "6 for all the open-N games" is false three ways: **four entries use 8, two use
4**, and the three games named as the examples are 3 of 16. The `[2, 2]`
codenamesduet half is still exactly right.

The advice the paragraph is giving — pick a bounded max, here is the house
default — is still good advice. It has just been overtaken by a roster that grew
from four games to sixteen and picked two other numbers on the way.

#### Resolved 2026-09-03 — the table went to the doc, not the docstring

Joel: *"for F5: make a table of games and their player counts."* It landed in
**[docs/features.md](../../docs/features.md) → Player counts**, a new dimension
section, and the docstring now states the RULE and points at it.

**Deliberately not in the docstring**, and the finding is its own argument: a
sixteen-row roster inside a `/**` is sixteen claims that go stale silently, which
is precisely how this one got here. What stays in `games.ts` is what does not
rot — both ends required, coop opens at 1 and compete at 2 because compete needs
an opposing PLAYER, six is the house max, and departing wants a reason (scrabble
seats an AI so its compete opens at 1; boggle and crosswords take 8 for a bigger
board; scrabble caps at 4 for the tile bag).

#### What building the table turned up: the compete minimum is client-only

The docstring's other claim was that `numberOfPlayers` *"MUST AGREE with the
member-count check in this gametype's `create_game` RPC … Drift fails loudly
(RPC rejects)."* Measured, that is true of one bound and false of another:

| bound | enforced by | holds? |
|---|---|---|
| at least 1 | `common.create_game_row` → **PN059** | every game |
| the max | `common.require_player_count_max(ids, cap)` → **PN041**, 15 games; codenamesduet's inline exactly-2 | **all sixteen agree with the manifest** — checked cap by cap, not assumed |
| compete's min of 2 | each `create_game`'s own `< 2` | **9 games.** `setgame`, `stackdown`, `waffle`, `wordle` declare `[2, 6]` and their servers accept 1. bananagrams and scrabble need none — their min IS 1 |

So for four games the FE is the only thing keeping a one-player compete game
from existing, and "drift fails loudly" is false there.

**Not filed as a defect, and not fixed.** It is unreachable through the app —
`playerCountFits` hides those Start buttons in a solo club — and a one-player
compete game is a friend confusing themselves, not an attack, which is exactly
what the trust model says to leave alone (CLAUDE.md → "if a server-authoritative
implementation would meaningfully complicate the code … prefer the simpler
path"). What was wrong was the DOCSTRING claiming a server check that four games
do not have, and that is corrected in both places.

**The better fix nobody asked for**, recorded rather than done: the max half is
paired by "cross-reference comments" between a manifest literal and a SQL
literal, which is the shape of every drift this sprint has found. A guard could
read both and assert they match — it is the same move `cssTokens.test.ts` makes
for tokens. It needs someone to decide whether `src/guards/` belongs to an area
first, which is `F-utils-11`'s open question one folder over.

### RESOLVED 2026-09-03 — F-game-lib-6 · `status-consumer-is-six-games` · "Today's primary consumer" is six games, and the future it defers to has arrived

`games.ts:140` — `GamePageCtx.status`: *"Today's primary consumer is
spellingbee's compete-mode OpponentStrip, which reads `status.leaderboard` for
the per-player rank summary. The same channel is open to any future game that
wants a live status field surfaced to the play surface."*

Six games read `status.leaderboard` today: **boggle, letterboxed, setgame,
spellingbee, wordiply, wordwheel** (plus `common/`). The sentence describes a
one-game special case with an open invitation; the field is in fact a general
mechanism that six games took up.

Worth fixing rather than deleting, because the docstring is doing real work — it
is where a seventh game learns the channel exists. It should say so as a rule
instead of as one game's example.

#### Resolved 2026-09-03 — one paragraph

The two sentences now say `status.leaderboard` is the settled convention, that
most compete games write and read it, and that anything changing how the field
is delivered affects them all. **The rule, not the roster** — naming the six
would be six claims that go stale, which is the fault this area keeps finding.

Checking who reads the field turned up a separate thing, which is
`F-game-lib-11` and not this.

### RESOLVED 2026-09-03 — F-game-lib-7 · `ctx-timer-undocumented-and-misindented` · The one non-obvious field in the render-prop contract has no docstring

`gamePageCtx.ts:55` — `GamePageCtx.timer` (it was `games.ts:68` at the audit,
then `games.ts:108`, and is here since `F-game-lib-12` — three moves in a day,
which is the convention's own argument):

```ts
  isTerminal: boolean
    timer: {
    displaySeconds: number
    expired: boolean
  }
  /** Turn-order gate for the opt-in turn-by-turn coop mode. … */
```

Two things at once, both on the field opener:

1. **It is indented four spaces** where every sibling in `GamePageCtx` is at two.
   The body lines and the closing `}` are correct; only the `timer:` line is
   wrong, which is why it reads as a stray rather than as a nested block.
2. **It has no docstring**, and it is the field that most needs one. `session`
   and `gameId` also carry none and do not need any — a `Session` named `session`
   explains itself. `timer` is a structured object whose two fields raise real
   questions the type does not answer: is `displaySeconds` counting up or down,
   and does `expired` mean "the countdown hit zero" or "the timeout RPC has
   landed"? Every other non-obvious field here is documented, several of them at
   length; this is the gap in an otherwise complete contract.

#### Resolved 2026-09-03 — and both questions had real answers

The indent is fixed and the field is documented. **The two questions the finding
posed were not rhetorical**; each has an answer worth writing down, and reading
`useGameTimer.ts:164-170` to get them is what the docstring saves the next
person:

- **`displaySeconds` counts UP for `countup` and DOWN for `countdown`** —
  `ticks` in one mode, `max(0, mode.seconds - ticks)` in the other, `0` for
  `none`. So it is the number to render either way, with no per-game arithmetic,
  and a countdown floors at zero rather than going negative. It also freezes
  while paused or terminal (`useGameTimer`'s `running` gate), which is why a
  finished game keeps showing its final value.
- **`expired` is the TRIGGER, not the outcome.** It is
  `mode.kind === 'countdown' && displaySeconds === 0`, so a count-up clock never
  expires — it is not counting toward anything. GamePage watches it and fires
  the manifest's `submitTimeout` (`GamePage.tsx:316-338`), which is what
  actually ends the game. **It therefore flips BEFORE the game is over**, and a
  PlayArea reading it as "the game ended" would be a step early; `isTerminal` is
  that question. That is the trap the missing docstring left open, and the one
  thing here that could have produced a real bug.

### RESOLVED 2026-09-03 — F-game-lib-8 · `player-count-short-untested` · Three sibling formatters, two tested

`gameManifest.test.ts` opens *"Pure-function tests for the player-count helpers"* —
plural, and it covers `playerCountFits` and `playerCountLabel`. `playerCountShort`
has no test.

It is not dead code: `StartGameRow.tsx:50` renders it on **every per-gametype
Start button in the club**, which is the most-seen string of the three. It carries
the same singular/plural branch `playerCountLabel` has a dedicated test for
(`'singularizes "member" when the exact count is 1'`), and that branch is
reachable — twelve entries are `[1, 6]`, so `playerCountShort([1, 1])` is one
manifest edit away from rendering.

The two that are tested drive an enable/disable decision and a tooltip; the
untested one is the one on screen in every club, every time.

#### Resolved 2026-09-03 — four cases, and they were planted before being believed

`gameManifest.test.ts` gains a `playerCountShort` block mirroring its sibling's:
the exact-match form, the singular branch, and the bounded form — the last
using the three shapes actually in the roster (`[1, 6]` the house default,
`[2, 8]` boggle/crosswords, `[1, 4]` scrabble) rather than invented ones.

**A fourth case has no sibling: the EN DASH.** Both helpers render a range with
`–` (U+2013), which is invisible in review and the obvious thing to "correct"
to a hyphen. They describe the same range on the same page — the tooltip on a
disabled Start button and the meta line on an enabled one — so a divergence
shows up as two spellings of one number in one club.

**Verified by planting**, per the standing rule that a test which cannot fail is
worse than none: removing the singular branch fails 1, and swapping the en dash
for a hyphen fails 2. Suite 2560 (was 2556); `gameManifest.ts` itself is
untouched, since this finding was a test gap and not a defect.

Fixed in passing: the file's docstring pointed at `src/common/lib/games.ts`,
which the `F-game-lib-12` rename had made a dead path. The blanket doc sweep
there only reached `docs/` and `plans/`, so source-comment references to the old
name survived it — worth knowing when the next rename lands.

### RESOLVED 2026-09-03 — F-game-lib-9 · `player-outcome-exported-unread` · An exported function with no importer, and four docstrings that name it

`playerOutcome` (`lib/members/playerOutcome.ts:27`, moved there by `F-game-lib-1`
— it was `games.ts:369` when this was written) is exported and **imported by
nothing**. Its only
caller is `outcomeVerb`, eighteen lines below it in the same file.

This is the one row of the split table that did not survive re-counting: the
identity row lists `playerOutcome` among the names moving to `lib/members/`,
without a count. The count is zero.

Three consequences, and the third is the one that matters:

1. Its own docstring describes a usage that does not exist — *"Games render it as
   e.g. `${playerOutcome(p)} at ${rankName}`."* No game does. The games render
   `${outcomeVerb(p)} at ${value}`, which is what `outcomeVerb`'s docstring
   correctly says.
2. `outcomeVerb`'s docstring says the two live together *"so the strip verbs stay
   in lockstep with its vocabulary"* — true, and an argument for keeping the
   function, not for exporting it.
3. **Four games' docstrings name `playerOutcome` as the thing that reads their
   data** — `wordwheel/components/InfoCol.tsx:79`,
   `spellingbee/components/InfoCol.tsx:79`, `boggle/components/InfoCol.tsx:71`,
   `scrabble/components/InfoCol.tsx:108`, each some form of *"per-player
   concede/result bits `playerOutcome` reads"*. All four are describing a path
   that actually runs through `outcomeVerb`. The mention count is four and the
   caller count is zero, which is the shape `feedback_count_the_callers` warns
   about — and it is how an unread export acquires the appearance of an API.

#### Resolved 2026-09-03 by MERGING the two, which nobody had proposed

I offered three options — fix the docstrings, un-export, or un-export and
rename — and Joel rejected all of them for a fourth: *"if no one calls
playerOutcome but outcomeVerb, why not combine them into one function? changing
them to 'lost'/'won'/etc only to immediate turn to 'Lost'/'Won' seems silly."*

He is right, and the reason I missed it is instructive. **I had been defending
the lowercase form as "the vocabulary"** — and it is not. The app's `Outcome`
vocabulary is the seven words in `lib/outcomes.ts`, and `quit` is not among
them. So `'won' | 'quit' | 'lost'` was never a vocabulary; it was an
intermediate that split three ways and then got re-split three ways to
capitalize. Nothing observed it. 29 lines became 5:

```ts
export function outcomeVerb(member: GamePlayer | undefined): 'Won' | 'Quit' | 'Lost' {
  if (member?.result?.won === true) return 'Won'
  if (member?.conceded) return 'Quit'
  return 'Lost'
}
```

**The module is renamed `outcomeVerb.ts`.** Seven files imported `outcomeVerb`
from a file named `playerOutcome.ts` — which is what taught four of them to name
the wrong function in their docstrings. Those four are corrected; leaving them
was not an option once `playerOutcome` ceased to exist.

**A test came with it, because a behavior-preserving merge without one is an
assertion.** Neither function had ever had a direct test. Six cases pin the
truth table, and were verified by planting three breaks a merge could plausibly
introduce:

| planted | caught |
|---|---|
| the two branches reordered (concede before won) | 1 failed |
| the `undefined` guard removed | 2 failed |
| `won: false` counted as a win | 1 failed |

The reorder is the one that matters: **win TRUMPS concede**, and it is
reachable — you can concede a race someone has already ended in your favor. That
precedence lives only in the branch order now, so it needed pinning.

Suite 2566 in 270 files, was 2560 in 269. Downstream: `docs/common.md`,
`docs/games/scrabble.md` and `docs/games/spellingbee.md` all described the
outcome through `playerOutcome`, and `member.ts` said "the two VALUES" next
door. One value now.

## Notes, to-dos and deferrals

Findings, notes, and the record of what the sprint did here — **all of it lives
in this file**. Add freely: a line costs nothing and is the alternative to losing
it.

**The one thing that goes elsewhere:** something this area turns up that is
genuinely OUT of the sprint's scope goes to `docs/deferred.md`, deliberately and
by name. That is the app's standing register; this file is the sprint's record of
the area.

### Already waiting for this area

**Split `common/lib/gameManifest.ts`.** Agreed with Joel 2026-09-03 (*"yes, split"*)
during `utils`'s opening, and assigned here rather than to `utils` on his call
that the game half waits: *"i don't want to dive into game-stuff yet."*

`games.ts` is **908 lines holding five unrelated vocabularies**, and
`docs/common-folders.md`'s one-line description of it ("the GameManifest type +
registry helpers") is no longer true. Its position at the root of `lib/` is a
recorded judgment call — *"it's THE registry, and a dead-obvious top-level path
beats one more level of nesting"* — and that is defensible for the registry.
What is not defensible is what rode in on the exemption. Counted across the 233
importing files, 364 named imports (re-measured at group A's read — see "The
split's own numbers, re-measured"):

| what | names | imports | destination |
|---|---|---|---|
| identity | `Member` 103 · `GamePlayer` 18 · `outcomeVerb` 7 · `playerOutcome` · `RichMessage` 1 | 129 | `lib/members/` (Joel, 2026-09-03) |
| the registry | `GamePageCtx` 32 · `GameManifest` 22 · `TimerMode` 21 · `CommonGameListRow` 7 · `GameStopResult` 5 · `MODE_LABEL` 5 · `playerCount*` 5 | 97 | stays in `lib/gameManifest.ts` |
| setup forms | `CreatedGame` 31 · `SetupBodyProps` 17 · `SetupSetter` 16 · `SetupOf` 16 · `GameSetupForm` | 80 | `lib/setup/` — except `CreatedGame`, below |
| feedback | `GenericFeedbackMsg` 39 · `GenericFeedbackApi` 5 | 44 | `lib/feedback/` |
| the menu | `MenuSection` 7 · `MenuApi` 2 · `MenuItem` 2 · `MenuHeader` · `isSubmenu` · `MenuSubmenu` 1 each · `MenuAction`, `MenuItemBase` | 14 | `lib/menu/` — the folder already exists |

**`GameManifest` is 22 of 364.** The most-imported name in the registry file is
`Member`, which names no game. The loose-file exemption was granted for the
file's smallest constituency, which is the whole finding.

The planned destinations, with the calls that are not obvious:

- **`lib/members/member.ts`** — `Member`, `GamePlayer`. **Types only, and that is
  load-bearing:** `Member` is the name 103 files import, so a pure-type module
  means those 103 imports erase at runtime and cannot close a cycle whatever else
  moves. `games.ts:5` already carries a warning about the cycle the current
  arrangement participates in.
- **`lib/members/playerOutcome.ts`** — `playerOutcome`, `outcomeVerb`. The two
  values, kept out of the 103-importer file for exactly that reason.
- **`lib/menu/menu.ts`** — the eight menu names. The folder exists already
  (`pageMenuStore.ts`).
- **`lib/feedback/genericFeedback.ts`** and **`lib/setup/setupForm.ts`** — the
  three-layer echo `docs/common-folders.md` states as a principle: both domains
  have a `components/` and (for feedback) a `hooks/` folder and no `lib/` half.
- **`CreatedGame` stays in `games.ts`** despite reading like setup. Its own
  docstring says why: *"Declared here, beside the interface it satisfies, so the
  two cannot drift"* — the interface being `GameManifest.startGameInClub`.
- **`RichMessage` is not a folder move.** The type has exactly one importer in the
  repo — `components/text/RichMessage.tsx`, which imports it back out of
  `lib/games` under an alias — so it goes *into* that file, beside its component.
  That is `common-folders.md`'s own recorded judgment call (*"`RichMessage` →
  `text/`"*) applied to the type as well as the component.

**What the split does NOT fix, and should not try to:** `SetupBodyProps` needs
`FormErrors` from `components/fields/formState`, so `lib/setup/` will import
upward into `components/` exactly as `games.ts` does today. Same seam, moved.
It belongs to `forms`.

**`docs/common-folders.md` gets updated as this lands**, not at step 12 — its
`lib/` block and its "Judgment calls" section both describe the pre-split file by
name, and 6c established that a doc already recording a decision is updated as
the work lands (§13).

### SETTLED — `outcomes.ts` went to `utils`

`src/common/lib/outcomes.ts`, the third loose file at the root of `lib/`, was the
open question here: not this area's (it names no game), with `utils` and
`corecss` as the candidate owners. **Joel ruled it into `utils` the same day**
(2026-09-03), on the membership rule it matches word for word — no page, no game,
no subsystem — and against `corecss`, which would only ever see its color half.
It was audited there with no findings and is now `cs-blessed-utils`. Kept as a
settled row rather than deleted, because the question will read as open again the
next time someone counts the loose files at that root.

### RESOLVED 2026-09-03 — F-game-lib-10 · `setup-body-doc-names-wrong-props` · The setup contract's docstring names two props it does not have

Raised while moving `SetupBodyProps` to `lib/setup/setupForm.ts` — the split
made it unavoidable, since attaching prose to a declaration means reading both.

Its docstring described a **controlled component with `value` and `onChange`**:

> *"state lives in the wrapper, the body renders `value` and signals edits via
> `onChange`. `value` and `onChange` are `unknown` here so `GameManifest` can
> stay non-generic … Each game's setup component starts with `value as MySetup`
> at the top."*

The type has neither. The props are **`values`** (plural) and **`set`**, and
have been for as long as `SetupSetter` has existed — `set` is a *field* writer,
not a whole-value `onChange`, which is a different contract, not a different
name. Every game's setup body already casts `values`, so nothing was broken;
the paragraph a form author reads first was describing a shape that never
shipped.

Corrected in the moved copy. It is `F-game-lib-1`'s doing in the same way the
orphan was: prose is checked against its declaration when — and only when —
someone has to decide which declaration it belongs to.

### RESOLVED 2026-09-04 — F-game-lib-11 · `leaderboard-read-written-five-ways` · The shared read for `status.leaderboard` has two callers and four reimplementations

Raised 2026-09-03 while checking `F-game-lib-6`'s claim about who reads
`status`. **Not group A's** — the helper is `lib/game/foundWordsLeaderboard.ts`,
which is group B — so it is filed here with an ID rather than resolved, and
group B does not have to rediscover it.

`readLeaderboard(status)` exists to be the defensive narrow-and-default for that
field: check the status blob, check the value is an array, return `[]` otherwise.
Six games read `status.leaderboard`; **two call the helper and four write it out
by hand**, identically:

| game | reads via |
|---|---|
| spellingbee · wordwheel | `readLeaderboard(status)` |
| boggle · letterboxed · setgame · wordiply | `(status?.leaderboard as LeaderRow[] \| undefined) ?? []` |

**The row shapes genuinely differ**, so this is a duplicated READ, not a
duplicated type — each game scores differently and its `LeaderRow` says so
(`sets_found`, `words_used` + `letters_covered`, `guesses_used` +
`length_score`…). What every one of them shares is `user_id: string`, and three
also carry `won?: boolean`. So the extractable thing is a generic
`readLeaderboard<T>(status): T[]`, not a shared `LeaderboardEntry`.

**One game is a closer call than the others.** boggle's `LeaderRow` is
`{ user_id, found_words_count, found_words_score }` — the existing shared
`LeaderboardEntry` minus `rank_idx` — and boggle is a word-hunt game, the family
`foundWordsLeaderboard.ts` was extracted for in the first place. Whether it
should be on the shared type or is deliberately apart is a question for boggle's
own area; group B only has to decide whether the READ generalizes.

**Scope note.** The helper is group B's. The inline reads belong to `boggle`,
`letterboxed`, `setgame` and `wordiply` when those areas open — §21's "focused
scope: leave others". Group B can widen the helper without touching a single
game; the call sites convert per area, which is the same shape as
`F-utils-7`'s handoff to `floating-panels`.

**Corrected 2026-09-04: there are EIGHT sites, not four, and half of them are on
a different screen.** This note said the reads "live in each game's `PlayArea`".
Each of letterboxed, setgame and wordiply has a second one in its `manifest.ts`,
inside `labelFor` — the club-page status line, not the play area — and boggle
has two in its PlayArea. Counted by grep at the handoff rather than by the
sentence that created it; whoever picked this up from the old wording would have
converted half of it and believed it done.

#### RESOLVED 2026-09-04 — everything that is this area's, and the handoff finally filed

Two halves, and only one was ever `game-lib`'s:

- **The common half shipped** under `F-game-lib-15`, which generalized the
  helper to `readLeaderboard<T = LeaderboardEntry>` — precisely what this
  finding asked for. Nothing else in `common/` is owed.
- **The per-game half is filed in the four game area files**, where the people
  who will act on it are reading: `boggle.md` (2026-09-03, with its
  displayRows item) and — **new, 2026-09-04** — `letterboxed.md`, `setgame.md`
  and `wordiply.md`.

**Three of the four notes had never been written**, which is the part worth
recording. The finding said "the call sites convert per area" and stopped there,
so the work existed only in this file — the one file nobody opening
`letterboxed` reads. A handoff is not made by naming the receiving area; it is
made by writing in the receiving area's file. This finding carried no status
either, which is how the gap survived: it read as still in flight.

**Each note carries what that game's own area has to decide**, which turned out
to be more than "adopt the helper". Every one of the three declares `LeaderRow`
**twice** — once in `manifest.ts`, once in `PlayArea.tsx` — and two of the
three disagree with themselves: letterboxed's manifest copy has no `won` (the
PlayArea copy documents it across four lines, for co-winners on a timeout), and
wordiply's PlayArea copy has a `letter_count` its manifest copy has never heard
of. One copy in each pair is wrong about what the server writes. Adopting the
shared read is what makes that visible, because both sites then name one type.

Also verified so no area is handed a surprise: all three `StatusBlob`s are
`type StatusBlob = Record<string, unknown>`, which is exactly
`readLeaderboard`'s parameter, so every site converts with no type friction.

### RESOLVED 2026-09-03 — F-game-lib-12 · `two-files-named-games` · Two very different files share one vague name, in a repo about games

Raised by Joel, 2026-09-03, after reading `F-game-lib-7`'s citation in the wrong
file: *"we have two files `games.ts`. i read the wrong one."*

```
src/games.ts               the LIST — 30 registered entries
src/common/lib/games.ts    the CONTRACT — what a game declares
```

**The near-miss is the evidence, and it is not the ordinary kind.** Sixteen files
are named `PlayArea.tsx` and nobody confuses them, because they mean the same
thing for different games. These two meant different things under one name — and
a name that is the repo's single most overloaded noun.

**Both names were also wrong by the glossary.** docs/naming.md defines a **game**
as *"a specific playing… one row in `<gametype>.games`, identified by a UUID."*
Neither file is about a playing. Its `gametype` entry even spells out what the
filename should have said: *"the registered entry… one row in `common.gametypes`,
one TS manifest in `src/games.ts`."* And `games` sits squarely in that same file's
**watch list of generic words** — the rule being that a wide-visibility name has
to be specific, and 233 importers is as wide as this repo gets.

| now | holds |
|---|---|
| `src/gametypes.ts` (export `gametypes`) | the registered entries — the glossary's own word, mirroring the `common.gametypes` table |
| `src/common/lib/gameManifest.ts` | what a game DECLARES |
| `src/common/lib/gamePageCtx.ts` | what a game is HANDED |

**The third file is a split, not a rename**, and it came out of Joel refusing the
first answer. Told the file should be named for its "primary export", he asked
whether that was even true. It was not — **53 files import that module and
exactly ONE imports both `GameManifest` and `GamePageCtx`**:

| | files | overlap |
|---|---|---|
| `GameManifest` | 22 — the 16 manifests, `gametypes.ts`, 4 club/setup surfaces | 1 |
| `GamePageCtx` | 32 — **all 32 are a game's own components** | 1 |

Two audiences at two moments: declaring a game, and playing one. `GamePageCtx`
was also 105 of the file's 542 lines. The unifying rule that DID hold — every
export is `GameManifest` or the type of one specific `GameManifest` member — is
still true of what remains, and is now the file's stated admission test.

**A pairing deliberately avoided:** `gametypes.ts` + `gametype.ts`. Tempting
symmetry, but two names differing by one `s` reproduces the exact failure this
finding is about.

**Two mechanical things nearly slipped**, both worth remembering for the next
rename:

- **`eslint.config.js` reads the registry BY PATH** and regexes
  `from './<name>/manifest'` out of it to build the game list for
  `no-restricted-imports`. Miss it and a game silently stops being guarded —
  which the file's own docstring warns about. Repointed and verified to still
  derive all sixteen.
- **The `vi.mock()` gotcha finally landed.** `useGameInvitations.test.ts` mocks
  the registry and its factory returned `{ games: [...] }`; the module now
  exports `gametypes`, so five tests failed. It is the ONLY `vi.mock` in the repo
  naming either file — which is why `F-game-lib-1`'s split could not reach it
  (that split moved only types, and nothing mocks a type). See "Predicted test
  breaks".

### RESOLVED 2026-09-03 — F-game-lib-13 · `group-a-comment-pass` · A comments audit of the twelve, after they were done

Joel, at group A's close: *"do a comments correctness and tidyness check for the
A set"*, then *"make sure you're also doing the docstring-vs-comment pass"*.

**Tidiness was clean.** No trailing whitespace, no doubled blank lines, every
file newline-terminated. One ragged docstring line was rewrapped.

**Correctness: seven wrong claims, and FIVE were mine, from the same day.**

| where | claimed | true |
|---|---|---|
| `gameManifest.ts` header | *"everything in this file is one of two halves"* | `GamePageCtx` had moved out hours earlier |
| same | *"The other FOUR moved out"* | five did |
| same | *"it is THE registry"* | the registry is `gametypes.ts`; its own line 16 said so |
| `member.ts` | `Member` imported by **103** files | **105** |
| `member.ts` | `GamePlayer` adds **the two** | **three** |
| `gamePageCtx.ts` | **32** importers, **all 32** a game's component | **33**, one is `gameManifest.ts` |
| `gameManifest.ts` | *"iterate `games`"* / *"StartGameButtons"* | `gametypes`; the component is `StartGameRow` |

**The sharpest version of `F-game-lib-3` yet.** Every one is a count, or a "this
file contains X" claim, that a LATER STEP IN THE SAME SESSION falsified. The
`gamePageCtx.ts` one is purest: its importer count IS the file's argument for
existing, and I broke it an hour later by importing the type back into
`gameManifest.ts`. **A counted claim has an expiry date, and it can be two
hours.** Fixed by stating the SHAPE rather than the tally.

**The docstring-vs-comment pass: 60 conversions.**
[docs/code-conventions.md](../../docs/code-conventions.md) is explicit — a note
about one field takes `//` — and names `dbLog.ts`'s `TransportFacts` as the
model, where the TYPE carries `/**` and every FIELD carries `//`. All 60
indented `/**` in these files were field notes and are now `//`; the top-level
docstrings are untouched.

**The converter flattened three bulleted lists** (`genericFeedback.ts`'s four
`mode` kinds, `gamePageCtx.ts`'s two `timer` fields, `gameManifest.ts`'s
`startGameInClub` parameters) because it stripped every line. Restored by hand.
**If groups B–F need the same pass, preserve indentation relative to the block
rather than flattening to zero** — that is the flaw to fix before reusing it.

**One cost, stated because it is real:** `//` does not render in editor hover,
so a game author implementing `GameManifest` loses its field notes as tooltips.
The convention weighs that against the signal `/**` loses when everything wears
it; `TransportFacts` already took the same trade.

### RESOLVED 2026-09-03 — F-game-lib-14 · `outcome-verb-not-just-any-outcome` · `outcomeVerb` renamed `terminalOutcomeVerb`

Joel: *"for the file outcomeVerb.ts, please rename this & the function it exports
to terminalOutcomeVerb"*. The verb is only ever asked for at game-over, and the
app has a separate `Outcome` vocabulary (`lib/outcomes.ts`) that is about
anything but — a move, a guess, a pill. `outcomeVerb` read as the verb for THAT.

`lib/members/outcomeVerb.ts` → `lib/members/terminalOutcomeVerb.ts` (with its
test), the export with it, and every reference across 17 files: the seven game
`InfoCol`s, `member.ts`, `gameManifest.ts`, `docs/common-folders.md`,
`docs/common.md`, `docs/games/scrabble.md`, `docs/games/spellingbee.md`.

**A word-boundary substitution was safe here and is not in general** — the name
is a distinctive compound appearing in no other symbol, unlike `games`. It was
NOT safe over `plans/`: run across this file it rewrote the historical record of
`F-game-lib-9`, including Joel's own quoted words, which is why the record above
still reads `outcomeVerb` wherever it describes what was true at the time.

## Files group A wrote

Per §21, a file an area creates is that area's and gets a roster row at close.
Group A's audit produced **seven**, six of them from `F-game-lib-1`'s split and
one test from `F-game-lib-9`:

```
 148  lib/gamePageCtx.ts                 F-game-lib-12 — what a game is handed
 189  lib/setup/setupForm.ts             the SetupGameModal contract
 146  lib/menu/menu.ts                   what a menu is made of
  78  lib/feedback/genericFeedback.ts    what a feedback pill is
  65  lib/members/member.ts              who someone is — types only
  42  lib/members/terminalOutcomeVerb.ts the terminal verb
  68  lib/members/terminalOutcomeVerb.test.ts   its truth table
```

With the five on the opening roster — `gameManifest.ts`, `gameManifest.test.ts`,
`gametypes.ts`, `manifestRpcs.ts`, `manifestRpcs.test.ts` — that is the twelve
files at `cs-audited-game-lib`. Two of the originals were renamed by
`F-game-lib-12`; none was deleted.

### RESOLVED 2026-09-03 — F-game-lib-15 · `boggle-is-the-third-hive-game` · Two shared modules widened for a game the extraction stopped short of

Raised at group B's opening, before its files were read, by Joel asking the
question the roster invites: *"are spellingbee + wordwheel the only users? does
boggle use any of these files (it's fairly similar to the other two)"*.

**It uses one of five** — `revealWords.ts`. Investigating the other four turned
up that boggle is a third member of this family, and that ONE of the reasons it
was left out is written down and false.

| module | boggle | verdict |
|---|---|---|
| `revealWords.ts` | already shares it | — |
| `foundWordsDisplayRows.ts` | its own 48-line copy | **same algorithm line for line**, differing only by `isPangram` |
| `foundWordsLeaderboard.ts` | two inline casts | its `LeaderRow` is `LeaderboardEntry` minus `rank_idx` |
| `foundWords.ts` (header type) | `board`/`n`/`min_word_length` | genuinely different game |
| `rankLadder.ts` | no ranks at all | genuinely inapplicable |

**The false note.** `foundWordsDisplayRows.ts` ended with *"boggle deliberately
keeps a different rule (per-player duplicates in compete) — it has its own
displayRows and must NOT use this one."* Boggle dedups by word to the earliest
finder identically, and its own tests assert it (*"each found word once"*,
*"dedups a word to its earliest finder"*). **There is no per-player-duplicates
rule anywhere in boggle.** Corrected — a false justification is worse than none,
because it is how a wrong decision survives by being cited. `revealWords`'s own
docstring cites the same premise, and was always the counter-example: it was
split out precisely so all THREE games could share it.

**Widened, both strictly additive, both leaving spellingbee and wordwheel
untouched:**

- `readLeaderboard<T = LeaderboardEntry>` — one line. The defensive read is the
  shared part; the row never was.
- `buildDisplayRows` takes STRUCTURAL parameters (`DisplayableFound` /
  `DisplayableReveal`, `is_pangram` optional) instead of the named types. The
  named types still satisfy them, and the body needed no edit at all since
  `WordListRow.isPangram` was already optional.

**Verified by compiling boggle's real types against both signatures**, not by
assuming: a temporary probe importing boggle's `FoundWordRow` and its
`LeaderRow` typechecked clean, then was removed.

**`makeFoundWordsGame` was considered and REJECTED.** 57% of boggle's `useGame`
is byte-identical to it (53 of 93 code lines, indentation normalized) — same
state, same two `readRows` chains, same failure-slot split — but boggle reads
`games` where the hive games read a `games_state` view, with different columns
and a different header type. Sharing it means parameterising the table, the
select list and the row→object mapping. Joel, 2026-09-03: *"i prefer clarity and
not over-generalizing … the third sounds like one i'd skip."*

**The call sites are boggle's**, noted in plans/areas/boggle.md → "Already
waiting for this area": adopting these deletes `boggle/lib/displayRows.ts` and
its test, and replaces two inline casts. Group B did all the widening without
touching a game — the same handoff shape as `F-utils-7` and `F-game-lib-11`.

**This also resolves `F-game-lib-11`'s common half**, which asked for exactly
the `readLeaderboard<T>` generalization; what remains of it is the four games'
inline casts, each that game's own area.

## Group B — the found-words family, read 2026-09-03

Seven files, 561 lines, all read in full. **No logic bug**, and the arithmetic
half is the best-tested code this area has seen — see "What checked out". Three
findings, all about the writing and the shape of the test files.

### RESOLVED 2026-09-03 — F-game-lib-16 · `reveal-words-cites-the-false-flavors` · The same false premise, in a second file

`revealWords.ts:7-9` explains its own existence with the claim `F-game-lib-15`
just proved false:

> *"Lives in its own module rather than beside `buildDisplayRows` because that
> one comes in **two deliberately different flavors** — the shared
> spellingbee/wordwheel copy and boggle's own — while this step is genuinely
> identical for all three."*

There are not two flavors. The two `buildDisplayRows` are the same algorithm
line for line, differing only in an optional `isPangram`, and boggle's own tests
assert the same set-semantics dedup the shared one uses.

**This file is the counter-example to its own claim**, which is what makes it
worth its own finding rather than a footnote to `F-game-lib-15`. It was split
out precisely so all THREE games could share it — it is the proof that the shape
was always three games, while its docstring cites the two-flavors story to
explain why it had to be separate. The reasoning is backwards: it is separate
because it is shareable, not because its neighbor isn't.

#### Resolved 2026-09-03 — the true reason was in the parenthesis all along

The paragraph is replaced, and what replaces it was already in the docstring's
own aside: **generic over the word, because `is_pangram` is the only thing the
three games disagree about.** That is the real explanation of the signature, and
it was parenthetical under a false headline.

The separateness is now stated as what it is — this is the step every word-hunt
game shares — with a pointer to `F-game-lib-15` and to boggle's adoption note,
so the next reader meets the CURRENT position rather than the superseded one.

Worth keeping in view: the sentence survived because it sounded like a decision.
"Two deliberately different flavors" reads as something weighed and settled, and
nobody re-derives a settled thing. It took reading boggle's copy line by line to
find there was no second flavor.

### RESOLVED 2026-09-03 — F-game-lib-17 · `reveal-words-has-no-test-file` · A unit tested inside another unit's file

`buildRevealWords` has **no `revealWords.test.ts`**. Its two cases live in
`foundWordsDisplayRows.test.ts` as a `describe('buildRevealWords')` block, which
also makes that file import a module it is not the test for.

It is the only unit in the group without its own test file — `rankLadder`,
`buildDisplayRows` and the leaderboard reader all have one or are covered where
they live. The two cases are good ones (*"returns every unfound word from both
lists, tagged by which list"*, *"an empty bonus list reveals only the required
half"*, the latter pinning exactly the boggle behavior the docstring describes);
they are simply in the wrong file, so a reader looking for the reveal's coverage
finds none where they look.

#### Resolved 2026-09-03 — and the move exposed a hole

`revealWords.test.ts` now exists, carrying the two cases and a docstring; the
display-rows test loses the block and the import it only needed for it.

**The move was worth more than the tidiness.** Planting a break to check the
moved tests still bit turned up one that they did NOT catch: making the bonus
half of the fold ignore the found set entirely
(`bonusWords.filter(() => true)`) left every case passing. The two filters are
separate expressions, so "already found" has to be applied twice, and no case
had a found word in the BONUS list — the one existing bonus word was never
found, so the filter was never asked to exclude anything.

The consequence was real, not theoretical: a player would be shown a word they
had already found, listed among the ones they missed. A third case now covers
it, and the same plant fails with it in place.

**That hole was invisible while the tests lived in the other file.** Nobody
counting the reveal's coverage would have gone looking there, which is the
argument for the move stated better than the finding stated it.

### RESOLVED 2026-09-03 — F-game-lib-18 · `two-tests-open-on-their-imports` · The group's two test files have no docstring

`foundWordsDisplayRows.test.ts` and `rankLadder.test.ts` both begin at their
import block. Every test file in group A carries a module docstring saying what
the file pins and why.

`rankLadder.test.ts` is the one that costs something: 163 lines and 21 cases,
and its last case — *"agrees with the integer-math formula used by each game's
`_rank_idx`"* — is a **FE/SQL lockstep guard**, the only thing standing between
this ladder and the two `submit_word` RPCs drifting apart. That is not obvious
from a list of `it(...)` names, and it is exactly what a docstring is for.

#### Resolved 2026-09-03 — both say what the file is DEFENDING, not what it covers

Neither docstring lists cases; a reader can see those. Each says the thing the
list of `it(...)` names hides.

`rankLadder.test.ts` leads with the reason most of it exists: **the ladder is
computed twice** — here and in each game's `_rank_idx` as integer SQL — and
nothing but these tests keeps the two agreeing, one drawing the bar and printing
"needs N points" while the other decides who wins a compete race. That is why
two cases compare against the SQL formula rather than against expected values,
and why float arithmetic gets a case of its own.

`foundWordsDisplayRows.test.ts` leads with the fact that **most of its cases are
about compete after the game ends** — the only time the input is interesting,
since RLS opens at terminal and every player's finds arrive at once. In coop
each rule it tests is a no-op, which is not visible from the case names and is
the first thing a reader needs in order to know why any of it matters.

All eight files in the group now carry one, `revealWords.test.ts` included.

### RESOLVED 2026-09-03 — F-game-lib-26 · `group-c-comment-pass` · A comments audit of the six, after they were done

Same pass as `F-game-lib-13` did for group A: re-read all six files end to end
once the findings were fixed, and check every comment and docstring against the
code rather than against the last reading of it. Seven corrections, in three
classes.

**One false claim about other games** — the class this area keeps producing.
`terminalCopy.ts:21` said the manual-end copy was *"Identical across games (the
`'ended'` branch led every `buildOver`)"*. Thirteen of sixteen games call
`endedCopy()`. The header now says most games call it and that it is **not** a
guarantee about what a player sees, and names MothCubes' deliberate divergence
(`Ended: 12/40` — a compete word hunt spends the pill's width on the tally, and
its own comment says so). The other two are unconverted rather than decided and
went to their areas:

- **RackAttack** hand-writes `{ verdict: 'Ended', message: 'Ended' }`, so the
  same event reads differently there than anywhere else — and `verdict` equals
  `message`, which is the one thing `TerminalCopy` exists to separate. Filed in
  [scrabble.md](scrabble.md).
- **MonkeyGrams** has no manual-end arm at all; its ternary appears to fall
  through and announce a winner for a game nobody won. Filed in
  [bananagrams.md](bananagrams.md) as a **suspected** bug needing a repro.

**Two British spellings the guard does not carry.** `parenthesised` and
`pluralise` (`statusLabel.ts`), `ellipsising` twice (`terminalCopy.ts`).
`guards/americanSpelling.test.ts` is an explicit word list with no `-ise` rule
by design — its own docstring explains why (`advertise`, `surprise` and two
dozen more are correct) — so none of these four failed anything. The repo
already spells both the American way elsewhere, which is how they were spotted.
**Three more instances sit outside this area** and were left there:
`scrabble/components/PlayArea.test.tsx` (`parenthesised`),
`wordiply/components/PlayArea.tsx` and `crosswords/components/PlayArea.tsx`
(`ellipsising`), plus `wordwheel`'s `ellipsises`.

**One more roster count**, `statusLabel.ts:7`: *"Thirteen games each wrote their
own strings"* — sixteen now, and the number was never the point. Reads "Every
game wrote its own strings" and says the same thing permanently.

**Two pointers that pointed at nothing.** `setupRows.ts`'s `SetupRow.key` cited
`setupRows.test.ts`, which does not exist — there is no sibling test; the guard
is `src/guards/setupRows.test.ts`, which the same file cites correctly forty
lines above. And `ROSTER_KEY`'s docstring read *"Row keys that aren't keys on a
game's setup object"* — plural, written to head both pseudo-key constants, but
attached to one of them, leaving `BOARD_KEY` looking like it had wandered in.

**What checked out**, verified rather than assumed: `coopRows`' *"everything
with a `<SetupCoopStyleSection>`"* (nine dialogs, the same nine recaps);
`dictLabel`'s named three (waffle, wordle, stackdown — exactly the three
manifests that import it); `timerRow`'s *"every game's dialog offers"* (all
sixteen, crosswords included); `difficulty.ts`'s `DictBandField`; and the
`outcome_won|lost|neutral` classes `TerminalCopy.tone` names.

### What checked out — verified, not assumed

The arithmetic in `rankLadder.ts` is unusually well-defended and every claim
about it holds:

- **The FE and SQL agree everywhere reachable.** Brute-forced `currentRankIndex`
  against the SQL's `least(6, (score * 60) / (total * 7))` over
  `total = 1..2000`, `score = 0..2×total`: **zero mismatches**. Worth doing
  because `rankPoints` was deliberately made integer-exact while
  `currentRankIndex` still compares floats — the divergence is plausible and
  simply is not there. (The file's own test already asserts this at `:151`.)
- **The float example is exact**: `i=5, total=108` really does give
  `63.00000000000001` in float and `63` in integer math.
- 7 tiers · `GENIUS_AT = 0.7` · a full clear at "~143% of GENIUS_AT" (1/0.7 =
  142.86%) · the quoted SQL formula, character for character.
- `readLeaderboard`'s *"two FE readers"* — four call sites, two per game.
- `revealWords`'s claim that boggle passes `[]` for bonus when its bands match:
  `boggle/components/PlayArea.tsx:271` is
  `hasBonusDifficulty ? game.bonus_words : []`, exactly as described.
- Both schemas do define the `games_state` view `foundWords.ts` names.

**Nothing in this group repeats group A's recurring fault.** There is not one
stale count in the seven files — the numbers are all small, structural and
tested, rather than tallies of a roster that grows.

## Group C — what a game says about itself, read 2026-09-03

Six files, 440 lines, all read. **Five findings**, all of them prose — every
defect this group turned up in the CODE belongs to a game.

**Two items left for `bananagrams`** and now live in
[bananagrams.md](bananagrams.md) → "Already waiting for this area": its setup
recap is written twice and has drifted, and its PDF inverts `dump_to_bag`. They
started as one finding with `F-game-lib-19` until Joel pointed out it was three
things — a false claim in THIS area's file, a migration one game skipped, and a
wrong string on that game's printout. Only the first is ours; nothing in
`common/` can make a game call a shared builder.

### RESOLVED 2026-09-03 — F-game-lib-19 · `setup-rows-claims-a-finished-migration` · The one claim here that is this file's own

**THIS AREA'S.** `setupRows.ts:16-18` states the migration it exists for as
done:

> *Each game now exports `setupRows()` from `<game>/lib/setupSummary.ts`… and
> **both consumers render that**.*

It is not done — bananagrams never converted its screen recap (left for that
area; see [bananagrams.md](bananagrams.md)). And the
sentence is load-bearing in the worst way: a reader of `setupRows.ts`, including
anyone later auditing that game, is told the two surfaces CANNOT drift, which is
exactly the sentence that stops them checking. The docstring goes on to name
psychicnum's old "different facts on paper than on screen" as the thing this
ended, while a live instance of it sits one game over.

Fixing this is one paragraph, and it does not depend on the game being fixed
first — the honest version says most games render the shared rows, names the
holdout, and stops promising.

**RESOLVED.** The header now counts (fourteen of sixteen), and names both games
that are not there with the reason each: bananagrams hand-writes its screen list
and has already drifted, crosswords never had a recap on either surface. It also
points at `guards/setupRows.test.ts` → `NO_RECAP`, which was the only place
crosswords' carve-out was written down — the wrong place for a reader of this
file to have to find it.

### RESOLVED 2026-09-03 — F-game-lib-20 · `timer-label-doc-names-the-old-call-site` · Its stated caller is the one game that shouldn't be doing that

`timerLabel.ts:8-9`: *"Every gametype renders it as
`<li>Timer: {timerLabel(setup.timer)}</li>`"*. Exactly one does —
**bananagrams**, and only because its screen recap was never converted (left
for that area; see [bananagrams.md](bananagrams.md)). Every other game reaches
it through `setupRows.ts:172`'s `timerRow()`. The docstring describes the call
pattern the recap unification replaced, so the one call site matching it is the
one that is wrong.

**Two more wrong claims in the same eleven lines, found while verifying it:**

1. *"The timer CHOOSER is a separate component, `<SetupTimerSection>`; this just
   formats what it produced."* The chooser calls `timerLabel` itself
   (`SetupTimerSection.tsx:111`) for its own section heading, so the string you
   pick by is the string the recap shows later. The sentence drew a line the
   code deliberately crosses, and hid the better fact.
2. *"all **9** timer-bearing PlayAreas held a byte-identical copy"* — a count,
   and the fault group A kept turning up. **This group has it too**; I had said
   it didn't, having checked only the other five files.

The count was also measuring the wrong thing. Fifteen games put a timer in a
recap; **sixteen offer one.** The odd one out is crosswords, which has the timer
section like everybody else (`SetupForm.tsx:83`) and simply has no recap to put
a row in — the same `NO_RECAP` carve-out as `F-game-lib-19`/`22`. So the stale
number invited the wrong conclusion, that crosswords has no timer.

Joel, 2026-09-03: *"stuff showing numbers like this just become pointlessly
stale."* **RESOLVED** with no number at all: the docstring now names the two real
call sites, attaches the "value stands alone after a label" reasoning to them
rather than to an `<li>` nobody writes, and says "every timer-bearing PlayArea
held a copy" — true however the roster moves.

Second claim in the same docstring: *"The timer CHOOSER is a separate component,
`<SetupTimerSection>`; this just formats what it produced."* True about the
separation, misleading about the direction — `SetupTimerSection.tsx:111` CALLS
`timerLabel` to build its own section label. The chooser is a consumer, not just
a producer.

### RESOLVED 2026-09-03 — F-game-lib-21 · `board-key-says-three-games` · Three named, four use it

`setupRows.ts:32-33`: *"The letter games that BUILD a board from letters —
freebee, MooseWheel, MothCubes"*. **Four** games import `BOARD_KEY`:
spellingbee, wordwheel, boggle **and letterboxed**.

The nice part: `letterboxed/lib/setupSummary.ts:28-29` says *"the board-identity
exception the three OTHER board-from-letters games take"* — counting correctly
from its own side. The caller knows there are four; the shared file says three.

Also `freebee` is written lowercase where docs/naming.md gives the brand as
**FreeBee**.

**Two more claims wrong in the same two docstrings, found while verifying:**

1. *"each print a **`Letters`** row"*. SnakeBox labels its row **`Board`**, and
   MothCubes uses both — `Letters` for the tiles, `Board` for the dice set. What
   is shared is the **key**, which is the entire point of the constant, and the
   next docstring down already said so (*"each still FORMATS its own value"*).
   Line 44 contradicted line 90 about the one thing `BOARD_KEY` exists to fix.
2. **There are two routes to the key and nothing said so.** FreeBee and
   MooseWheel never write `BOARD_KEY` — they call `centerLettersRow()`, which
   supplies it. MothCubes and SnakeBox import the constant and build their own
   row, their boards being neither a center nor an outer ring.

**RESOLVED**, both docstrings, with no count in either: the games are named
rather than tallied, the KEY is stated as the shared thing against the label and
value that aren't, the two routes are given, and FreeBee is capitalized — in the
three places it appeared lowercase, not just the one this finding named.

**Also fixes a count I had just written.** `F-game-lib-19`'s new header opened
*"Fourteen of the sixteen games are there"*, which is the same fault one commit
later; it now says "two games are not there yet" and names them, which is the
part that was ever load-bearing. Joel, 2026-09-03: *"stuff showing numbers like
this just become pointlessly stale."*

**Nothing would have caught letterboxed joining.** `guards/setupRows.test.ts:59`
mentions `BOARD_KEY` in a comment but asserts nothing about who uses it, so the
fourth game arrived silently — and its own docstring counted correctly (*"the
three OTHER board-from-letters games"*) while the shared file it was joining did
not. Same shape as the un-caught drift left for bananagrams. Not fixed here: a
guard over an opt-in exception list is a design question, not a comment fix.

### RESOLVED 2026-09-03 — F-game-lib-22 · `each-game-exports-setup-rows` · Fifteen of sixteen, and the exception lives elsewhere

`setupRows.ts:16-18`: *"Each game now exports `setupRows()` from
`<game>/lib/setupSummary.ts`… and both consumers render that."* Fifteen games
do; **crosswords has no `setupSummary.ts` at all**.

That is deliberate and written down — `guards/setupRows.test.ts:37-42` carries a
`NO_RECAP` entry saying crosswords *"never had a recap on either surface… adding
one would be new UI, not the unification this rule is about"*. But a reader of
`setupRows.ts` is told "each game", learns something false, and has no reason to
go looking in the guard for the carve-out.

**RESOLVED by `F-game-lib-19`'s paragraph** — the same sentence was wrong twice
over, once about crosswords (no module) and once about bananagrams (a module it
half-renders), so one rewrite fixed both. The new header names crosswords with
its reason and points at `NO_RECAP`, which is where the carve-out is enforced
but was not where a reader of this file would find it. Filed separately because
they were found separately and either could have been true without the other.

### RESOLVED 2026-09-03 — F-game-lib-23 · `timer-label-test-has-no-docstring` · The group's one test opens on its imports

`timerLabel.test.ts` begins at its import block. Same class as `F-game-lib-18`,
and the smallest instance of it — four cases, one of which pins the zero-padding
that makes `0:05` rather than `0:5`.

**RESOLVED.** A docstring, and nothing else — no case added, no code touched.
It names the one assertion that isn't self-evident (`0:05`: an unpadded seconds
field only shows on a countdown under a minute, and `padStart(2, '0')` reads as
removable), and records why asserting `'none'` isn't a restatement of the
implementation — the value is always printed after a "Timer:" label, by
`timerRow()` and by `<SetupTimerSection>`, which is the fact `F-game-lib-20`
established.

Unlike `F-game-lib-17`, writing this turned up no missing case: the four
assertions cover all three arms of `TimerMode`, sub-minute padding, and
(via `600 → 10:00`) two-digit minutes.

### What checked out — verified, not assumed

`difficulty.ts` is the surprise: its docstring disclaims the sample words as
*"illustrative only — NOT a validated word list"*, and **every one of them is
valid**. Checked all 114 `(word, band)` pairs against `common.words`: **0
missing, 0 at a different band.** The structural claims hold too — `SAMPLES_3PLUS`
is exactly `SAMPLES_OPEN` minus its 2-letter entries band by band, `SAMPLES_2` is
all 2-letter words and `SAMPLES_5` all 5-letter, and all five arrays have six
rows. (The disclaimer is still right about the thing it actually says: a game may
reject a word for its own length rules.)

`statusLabel.ts`: `dictLabel`'s *"waffle, wordle, stackdown"* is exactly the
three callers. *"Thirteen games each wrote their own strings"* is past tense and
correct as history; all sixteen use the shared vocabulary now.

`terminalCopy.ts`: clean — nothing asserted that could be wrong.

## Group D — the feedback pills, read 2026-09-03

Five files, 277 lines, all read. **Three findings**, all this area's at the
time. One is about a seam that doesn't work, one is a duplicated type, one is an
unguarded hand-maintained pair. No defect belonged to a game, which made it the
first group where everything found was fixable from here.

**Then two of the three left the area.** Reading these five together is what
showed that the pill vocabulary is one system spread across six areas, with its
final component (`GenericFeedbackPill`) owned by none of them — so `feedback`
was created 2026-09-04 and took four of the five files with it.
`F-game-lib-27` and `F-game-lib-28` are **MOVED, not resolved**: they are open as
`F-feedback-1` and `F-feedback-2`. `F-game-lib-29` stays, with
`feedbackTiming.ts`.

The audit below is kept as written, because it is the evidence the new area
starts from — and because `F-game-lib-27` is the finding that made the case for
the area existing.

The comment pass ran BEFORE the audit (as with group B) and is recorded at the
end of this section, because two of its corrections are what made the first
finding visible.

### MOVED 2026-09-04 to `feedback` — F-game-lib-27 · `sticky-pill-and-not-ok-dont-compose` · The builder that claims every own-move message has 29 of 81

`localPills.ts`'s `stickyPill` is documented as *"The one builder for every
'here's what your last action did' message."* Counted:

| | |
|---|---|
| `stickyPill(…)` calls | **29** |
| hand-built `mode: { kind: 'sticky' }` | **52** |
| — of those, `{ ...getNotOkFeedback(res), mode: { kind: 'sticky' } }` | **40** |

**Those 40 are not rogue call sites.** `genericPills.ts`'s own docstring prints
that line as the contract, and it is the right contract: the envelope decides
tone and text, the surface decides permanence.

The finding is that **the two shared helpers of one vocabulary cannot
compose.** `getNotOkFeedback` returns `{tone, text}`; `stickyPill(tone, text)`
takes positional arguments. A caller holding the envelope's half has no way to
hand it to the builder, so it spreads and writes the mode itself.

The consequence is exactly what `localPills.ts` warns about one paragraph
earlier — that the mode is a one-word decision with nothing at runtime to catch
a wrong one. It is written out by hand at 52 sites, on the most common path in
the app, while the builders cover the 12 cases that were easy anyway.

**Not fixed here.** The shape is small — a builder taking the pair, or
`stickyPill` accepting an object — but it changes a call pattern that is
documented and used across sixteen games, which is a decision rather than a
comment fix. Recommendation: make `getNotOkFeedback`'s result passable to a
builder, so the mode is chosen by picking a function everywhere and not just
where the text happens to be a literal.

### MOVED 2026-09-04 to `feedback` — F-game-lib-28 · `outcome-tone-union-spelled-twice` · A type that names what it duplicates

`localPills.ts:38`:

```ts
/** A game's terminal outcome tone (`TerminalCopy.tone` / `over.tone`). */
type OutcomeTone = 'won' | 'lost' | 'neutral'
```

It cites the type it is copying, then copies it. `terminalCopy.ts:16` declares
the same union as `TerminalCopy.tone`, one file away in the same folder, and
`terminalPill` exists to be handed `over.tone` — so the parameter should be
`TerminalCopy['tone']` and the local type should go.

The union is spelled out in **eight more places** across the game areas, all as
`gameOver` props. Those are not this area's and are not filed; they are worth
knowing about if this one is ever centralized.

### CLOSED 2026-09-04, no change — F-game-lib-29 · `flash-durations-unguarded` · "Change both" is a request, not a rule

`feedbackTiming.ts` documents a hand-maintained pair:

| JS | CSS (`base.css:285-286`) |
|---|---|
| `ATTENTION_FLASH_MS = 700` | `--mark-attention-flash-duration: 0.7s` |
| `YOUR_TURN_FLASH_MS = 1200` | `--mark-yourTurn-flash-duration: 1.1s` |

The JS value removes the class and the CSS value runs the animation, so **the JS
one must be at least the CSS one** or the class is pulled mid-fade. The
docstring says "change both" and nothing checks.

Cheap to guard: each twin has exactly one consumer
(`PlayArea.module.css:733` and `:749`), so a test that reads `base.css`, parses
the two durations and asserts `ms >= s * 1000` would hold the pair without
anyone remembering. This is the same argument the repo already accepted for
`cssTokens` — a vocabulary is guarded, not just named.

**CLOSED, no change.** Joel, 2026-09-04: *"it's fine. no guard needed."* The
pair is two numbers with one consumer each and a stated rule; the guard was
worth offering and is not worth its file. Recorded rather than deleted so the
next person to change a flash duration finds the reasoning already done —
including that the two pairs differ deliberately (attention is exactly equal,
your-turn keeps 100ms of slack).

### What checked out — verified, not assumed

- **Every severity IS mapped**, as `genericPills.ts` claims. `SEVERITY_TO_OUTCOME`
  is typed `Record<Severity, Outcome>`, so the compiler enforces it; the
  docstring's "fault included" is not a convention.
- **The fill/outline language is accurate.** Neither builder sets a variant, and
  they shouldn't: `GenericFeedbackPill:65` derives `outline` from
  `kind !== 'permanent'`.
- **`psychicnum/BoardCol.tsx:253`** calls `stickyPill(res.outcome, res.message)`,
  which looked like it bypassed `notOkOutcome`'s severity mapping. It is an `ok`
  branch, and its comment asserts `outcome` is non-null there. Not a bug.
- **Both CSS twins exist**, with one consumer each, and all constants are used.
- **`feedbackTiming`'s "every game that raises one of these marks"** holds: four
  importers, and no game hardcodes a flash duration of its own.

### Two notes for other areas — FILED THERE 2026-09-03

Neither is fixable from here, and neither is this area's finding. Both are now
written up where they will be read, with their evidence:

- **[shared-game-chrome.md](shared-game-chrome.md)** — `GenericFeedbackPill.tsx:49`
  documents a `msg.variant` property that does not exist; the axis is derived
  from `mode.kind` twelve lines below the sentence claiming otherwise. Filed
  with a roster caveat: the file is `cs-unmet` and no area's roster names it.
- **[strands.md](strands.md)** — `PlayArea.tsx:787` passes `variant: 'outline'`
  on a feedback message. Dead, and harmless, but it is the one call site that
  believed the docstring above, which is the argument for fixing that docstring
  and not only this line.

### The comment pass, done before the audit

Every `/**` in the five files already attached to a file, type, const or
function, so no marker conversions were needed and the work was content.

**Two contradictions in `localPills.ts`, and the audit's first finding is
downstream of removing what hid them.** The file documented `outOfRacePill` as
STICKY twice — in the priority list, and in its own docstring ("A neutral
`stickyPill`") — while the code builds it `permanent`, and the paragraph above
the list says permanent means "the game's over, or you're out of the race". The
file disagreed with itself and with the code, as a leftover of the very fix the
archaeology beneath it was narrating.

**Archaeology, five passages**, per CLAUDE.md's "how it used to work is not
useful": the 2026-08-10 incident and the "~25 copies-by-convention across the
ten games" paragraph; `stickyPill`'s list of the per-game copies it replaced;
`terminalPill`'s "since the pill vocabulary took the outcome names in 2026-08";
`localPills.test.ts`'s "This is the thing that was wrong…"; and
`genericPills.test.ts`'s "The flag itself is gone now (2026-09-01)".

Also **two roster counts** ("Fifteen boards", twice), **two British spellings**
(`miscategorised`, `ellipsises`), and **one plan citation** —
`feedbackTiming.ts` ended *"See plans/tile-feedback.md"*, and plans are deleted
when their work ships.

## Group E — the live session, read 2026-09-04

Seven files, 532 lines, all seven read in full. **No crash-class defect.** The
one behavior question — a conceded player can still End the whole table — went
to Joel and came back as **shipped-is-correct** (`F-game-lib-36`, closed the
same day, no change). The rest is accuracy — five docstrings that describe
something the code does not do, and a folder name that stopped being true when
group A's split created `lib/members/`.

**Twelve findings; eight settled the same day.** The comment pass and the audit
were one read here, and everything it turned up was filed rather than swept,
including the mechanical items (markers, archaeology) — because two of them sat
next to a decision that had to be settled before anyone rewrote the paragraph
around them. Both were: `F-game-lib-36`'s rule (**closed, no change**) and
`F-game-lib-34`'s folder (**done** — `peers.ts` is now
`lib/members/memberList.ts`).

| status | findings |
|---|---|
| RESOLVED | `F-game-lib-30`, `-31`, `-32`, `-33`, `-34`, `-35`, `-37` |
| CLOSED, no change | `F-game-lib-36` — Joel's ruling |
| **open** | `F-game-lib-38` (the split's stale doc citations), `-39` (test file docstrings), `-40` (eight field markers), `-41` (the empty-section rule) |

**One behavior change in the group: none.** Six of the seven resolutions are
prose; the seventh is a `git mv` plus a test file. `gameMenu.ts` is
byte-identical to what shipped, verified after both of `F-game-lib-37`'s
planted failures were reverted.

**The group held.** Its own roster paragraph called it "the loosest of the six"
and offered to redraw it into presence/seating + the two chrome stores. Read
together, the seven do sit at one seam — the game as a live session — and the
split that actually wanted making was not inside the group: it was `peers.ts`
leaving `lib/game/` altogether (`F-game-lib-34`, done). No redraw. **Six files
in `lib/game/` now**, and the seam is cleaner for having lost the one that never
belonged to it.

### RESOLVED 2026-09-04 — F-game-lib-30 · `menu-doc-omits-the-chat-row` · "The three framing items" are four

`gameMenu.ts:8-12` opens: *"the three framing items are identical everywhere, so
this builds them once: **Help** at the top, the game's own `extra` sections in
the middle, and a **End game / Concede game** + **Back to club** tail."*

The builder emits **four**. The top section is Help **and Chat** — a labeled
twin of the header bubble, and the only place in the app the `/` shortcut is
written down (`gameMenu.ts:86-96`). It is not a stray: crosswords' own test
asserts the full order and leads with it —
`['help', 'chat', …]` (`crosswords/components/PlayArea.test.tsx:251-259`).

**The same omission is in the doc.** `docs/ui.md:732`'s ASCII sketch shows a
Help row alone in the top section, and `:741`'s paragraph says *"a **Help**
section at the top"*. So a reader who checks the doc against the docstring finds
them agreeing with each other and not with the code.

Also, grammar, in the same sentence: *"a **End game**"*.

#### Resolved 2026-09-04 — description only, in the two places that disagreed with the code

**Four, named.** The docstring now reads *"the four framing items … **Help** +
**Open chat** at the top"*, and `an End game`. `docs/ui.md`'s sketch grows the
row it was missing (with its `/` in the shortcut column, where the menu itself
puts it), and `:741`'s paragraph names Chat and says why the row exists beside a
header bubble that already opens the panel: it is the labeled twin every other
action has, and the shortcut column is the only place in the app `/` is written
down.

**"Four" rather than "three plus a Chat row."** The audit offered both. What
settles it is that the builder puts Chat in Help's own section, unconditionally,
for every game — so a reader counting what `buildGameMenu` guarantees counts
four. The reason Chat is *there* rather than framing in the shell sense is worth
a clause, which is what the doc paragraph now carries.

**No behavior changed** — two docstrings and one sketch. Verified anyway,
because a docstring edit is exactly what moves the line numbers the
orphaned-docstring guard reads (`F-game-lib-2`): **vitest 2567/2567 in 271
files**, `tsc -b` clean.

### RESOLVED 2026-09-04 — F-game-lib-31 · `pause-cites-a-game-doc-for-common-machinery` · Both of this file's citations are wrong, and the second one points away from the canonical doc

`pause.ts` ends *"See docs/games/connections.md → 'Pause on disconnect' for the
wider pattern"*, and `:15` sends "suspended" to *"docs/common.md → three-state
lifecycle"*.

| citation | what is there |
|---|---|
| connections.md → "Pause on disconnect" | **No such heading.** The real one is `### Pause (presence-driven + manual)` (`connections.md:643`) |
| common.md → "three-state lifecycle" | **No such section**, in that file or any other (`grep -ri "three-state" docs/` finds crosswords' chrome strip and a `naming.md` aside) |

And the first citation is wrong in a second way, which is the more useful half:
connections.md's pause section exists to say *this is not ours* — *"Pause is
common machinery … documented once in [states.md → paused]"*, followed by two
connections-specific notes. So the shared file points at a game doc for the
wider pattern, and the game doc points back past it to `docs/states.md`, which
is where the vocabulary actually lives (CLAUDE.md's doc table says so too:
`states.md` = *suspend / current / pause*). Both citations should read
`docs/states.md → paused`.

#### Resolved 2026-09-04 — one citation where there were two

Both wrong pointers are gone and **one** replaces them, at the end of the
docstring: *"Both words — paused, suspended — are defined once in
docs/states.md → paused, which also holds the wider pattern: the two trigger
sources, the overlay and its two escapes, and why a paused game and a suspended
one can never be the same game."* The "suspended" sentence keeps its one-line
gloss and loses its own dead link, because the same citation now covers it.

**Each clause of that sentence was checked against the section it advertises**,
rather than trusting the heading: the two trigger sources are `states.md:26-27`,
the two escapes (Suspend-and-return, End game) are `:29`, and the never-both
rule is `:33` — *"a suspended game isn't being looked at by anyone, so there's
no Presence channel to pause it."* A citation that promises more than the target
delivers is the same defect one level down.

**The connections link was not kept alongside.** What remains in that section
after its own opening sentence is two notes about connections' tile selections —
nothing a reader of this file needs, and the reason the pointer was misleading
rather than merely stale.

vitest **2567/2567 in 271 files**, `tsc -b` clean.

### RESOLVED 2026-09-04 — F-game-lib-32 · `pause-input-is-the-game-not-the-club` · The docstring names the club's roster; the caller passes the game's players

`pause.ts:6-8` — *"given the set of currently-connected user_ids … and the
expected member list (**from the club's roster**), is the game paused?"* —
repeated in the test's own docstring (`pause.test.ts:20-21`, *"the club's
expected member list"*).

**The one caller passes neither.** `useCommonGame.ts:677-681` passes
`activePlayers` — `players` (which the hook builds from `common.game_players ⨯
profiles`, `:150`) filtered to `!p.conceded`.

This is not pedantry, because **the two lists genuinely differ and the
difference is the feature**: `SetupGameModal` lets a subset of a club start a
game (`naming.md:130`), and `GamePage.tsx:501-503` keeps a *separate*
`clubMembers` for chat with the comment *"The FULL club roster (not just this
game's players)"*. A pause derived from the club roster would fire for every
member who simply isn't in the game.

The `conceded` filter is documented too — at the call site, in nine lines. What
the shared function's own docstring should say is what it is handed: **the
players expected to be present**, which is the game's non-conceded roster.

#### Resolved 2026-09-04 — and the sentence says why, not just what

The opening line now reads *"the players expected to be present"*, followed by
the part that makes it stick: *"Expected means THIS GAME's roster, not the
club's — a club of five can be running a two-player game, so the club list would
report three people missing forever."* Naming the failure is what stops the
wrong list being passed by someone who reads only this file; "not the club's"
alone is a rule with no teeth.

**The `conceded` filter is named here and argued at the call site**, which is
the split that was already right: this docstring says the hook passes
`common.game_players` minus anyone who conceded, and points at
`useCommonGame` for why a conceder stops counting. That reasoning belongs beside
the roster it filters, not in a pure function that never sees a concede.

**The test's docstring said the same wrong thing and now matches.** Three of its
rule lines named a parameter called `members` that does not exist — the
parameter is `players` — as did the mid-load comment (`members=[]`, where
`useCommonGame`'s state is `players`) and one spec title. Corrected together,
because the naming rule they were drifting from is a real one:
[naming.md](../../docs/naming.md) makes the *variable* carry the context, club
versus game, for exactly this reason.

vitest **2567/2567 in 271 files**, `tsc -b` clean.

### RESOLVED 2026-09-04 — F-game-lib-33 · `invite-example-names-a-codename` · The two examples in this file show a string the app never renders

`gameInvites.ts` opens on *"the data + pure logic behind the 'Moth added you to
a new **spellingbee** game' popup"*, and its `gameName` field reads
*"Display name from the manifest registry (e.g. **"spellingbee (coop)"**)"*.

Neither is what the value holds. `gameName` is
`gametypes.find(…)!.name` (`useGameInvitations.ts:124`), and a manifest's `name`
is the **brand**: `spellingbee/manifest.ts:102` sets `const BRAND = 'FreeBee'`
and both siblings set `name: BRAND`. The toast reads *"Moth added you to a new
**FreeBee** game"* (`GameInvitations.tsx:42-45`).

So the example is wrong twice over — a codename where the UI shows a brand, and
a mode that isn't in the string at all, from two sibling manifests that share
one name. This is the rule CLAUDE.md keeps in `docs/games/*` (brand lives in
`manifest.BRAND`) landing on a docstring.

**And "popup" is not what this is.** `docs/ui.md:179` defines the surface — a
**toast**, bottom-right, stacking, with one optional action button *("e.g.
'Join'")* — and `:193` names `useGameInvitations` as one of the three consumers.
The word appears twice in this file.

#### Resolved 2026-09-04 — the brand, the word, and one field marker taken in passing

Both examples read **FreeBee**, both surfaces read **toast**. The `gameName`
note now says *why* the value looks the way it does rather than showing a
sample: it is the manifest's `name`, which is the game's brand, and sibling
manifests share one — so a coop and a compete invitation read identically there.
An example that has to be kept true is worse than the rule it illustrates.

**`useGameInvitations.ts` was left alone.** It calls the surface a "popup" in
two more places, and it is `hooks`'s file — §21's focused scope. The note
already filed there stands, and the word dies in that area's pass.

**One `F-game-lib-40` site went with this.** Rewriting `gameName`'s note meant
writing it in the right form, so it became a `//` comment; `inviterName` beside
it followed, because one field marked `/**` and its neighbor `//` inside a
four-field type is a worse artifact than either. **`F-game-lib-40` is now
`gameMenu.ts` only** — recorded in both places rather than left for whoever
opens that finding to discover the count has moved.

vitest **2567/2567 in 271 files**, `tsc -b` clean.

### RESOLVED 2026-09-04 — F-game-lib-34 · `peers-is-not-about-peers` · Two member-list helpers, named for presence, sitting in the wrong folder since the split

`peers.ts` holds `orderSelfFirst` (you first, then everyone alphabetically) and
`memberById` (the `user_id` → member lookup). Neither touches presence,
Broadcast, or a channel. What they touch is a member list — and **group A
created `lib/members/` for exactly that**, with the rule already worked out:
`member.ts` is types only so its 103 importers erase at runtime, and the one
value that reads them lives beside it as its own module
(`terminalOutcomeVerb.ts`).

**Nineteen files import from `lib/game/peers`**, and the two halves are used
very differently: `memberById` is called 19 times across 16 files — 15 games and
`useChatFeedback` — while `orderSelfFirst` has exactly **three** call sites,
every one of them in `common/` (`OpponentStrip`, `useTurnLogPlayerPicker`,
`useWordListFilter`). So the file is not small enough to be beneath the
question, and `lib/members/` is not a folder that has to be invented for it.

Two more things in the same 36 lines:

- **Archaeology, and a citation to a document that is gone.** *"This was
  copy-pasted — comment and all — into four games' opponent strips before it
  landed here; the duplication was **review item 4.2**."* CLAUDE.md: how it used
  to work is not useful. The review it names is finished and deleted, so the
  number resolves to nothing.
- **The stated consumer is one of three.** *"the stable 'You, then peers' order
  every in-game progress strip wants (see `OpponentStrip`)"* — the other two
  callers are `useTurnLogPlayerPicker` (a filter dropdown) and
  `useWordListFilter` (a word-list filter), neither of them a progress strip.
  Same shape as `F-game-lib-6`. **This entry first said four callers, counting
  `scrabble/InfoCol.tsx:227` — which only NAMES the function in a comment about
  seat order.** Corrected by listing the call sites; a mention is not a caller.

**Recommendation:** move the two to `lib/members/`, under a name that says what
they do to a member list. That leaves `lib/game/` holding game logic and
`lib/members/` holding identity, which is the split group A already argued for
and stopped one file short of.

#### Resolved 2026-09-04 — three calls put to Joel, all three taken

The recommendation carried three open choices; Joel took the recommended answer
on each (*"i'll go with your recs. do it."*):

| choice | taken |
|---|---|
| the name | **rename**, not just a folder move — `lib/members/memberList.ts`. "Peers" is the word that made this hard to find |
| one file or two | **keep them together.** Group A's reason for splitting `terminalOutcomeVerb.ts` off `member.ts` was runtime erasure, and it does not apply: both of these are values |
| does `orderSelfFirst` move too | **yes.** Its three callers are all `common/` components, which was the one argument for leaving it — but what it operates on is still a member list |

**`git mv` + 19 import rewrites**, no call site otherwise touched. Clean at
`npx tsc -b`, and **vitest 2567/2567 in 271 files**. No test named the old path:
nothing mocks it, because it is two pure functions with nothing to stand in for
— the same reason `F-game-lib-1`'s much larger split broke no mock.

**The docstrings did not just move — they were rewritten on the way**, which is
where the rest of the finding went:

- The archaeology is gone — the copy-paste history and `review item 4.2`, a
  number that no longer resolves to anything.
- `orderSelfFirst` now names **all three** of its callers and says what the
  order is FOR (the viewer first, then a list that does not reorder itself as
  scores move), instead of naming one and generalizing from it.
- A short file docstring says why the pair sits in `members/` and, explicitly,
  why it is not IN `member.ts`: that module is types-only so its 103 imports
  erase at runtime, and a value module cannot promise that.

`docs/common-folders.md` updated as the work landed (§13's 6c rule): `peers`
leaves the `lib/game/` line, and the `members/` block now reads "the values that
read them" — the terminal verb, and the two operations on a list.

**The file keeps its `cs-audited-game-lib` stamp.** A rename is not a creation:
this is the same file, at a name that describes it.

### RESOLVED 2026-09-04 — F-game-lib-35 · `info-sheet-says-thirteen-games` · Thirteen is sixteen, and the count should go rather than be corrected

`infoSheetStore.ts:14` — *"Threading a flag down would mean adding it to
`GamePageCtx` and touching **all thirteen games**."* Sixteen.

Fourth of its kind here (`F-game-lib-3`, `-4`, `-21`), and the standing answer
applies: **a tally of the roster always rots, so name the condition instead** —
"every game", which is what the sentence means and what stays true when the
seventeenth arrives.

Everything else in this file's long docstring **checked out** — see below.

#### Resolved 2026-09-04 — "every game"

*"touching all thirteen games"* → *"touching every game"*. The sentence is an
argument about **reach**, not about arithmetic: what makes threading the flag
through `GamePageCtx` expensive is that it lands on all of them, whichever
number that is this month. Naming the condition says the same thing and cannot
go stale, which is the fourth time this area has reached that answer.

**Checking that claim turned up that this area has answered the question both
ways, and one of them is blessed.** `manifestRpcs.ts:13` and `:54` still carry a
tally — *"the sixteen games would otherwise write the same closure"*, *"across
all sixteen games"* — because `F-game-lib-3` fixed its "ten" by **correcting the
number**, not by removing it. Both are true today.

A defense exists: there the number is the point (how much duplication the helper
absorbs), where here it was incidental to an argument about reach. It is thin,
because both rot on the same schedule. **Not changed** — `manifestRpcs.ts` is
`cs-blessed`, and re-opening a resolved finding in a blessed file to apply a
rule the other way is Joel's call, not a tidy-up. Recorded so the next person to
notice the two files disagree finds the reason rather than the discrepancy.

vitest **2567/2567 in 271 files**, `tsc -b` clean.

### CLOSED 2026-09-04, no change — F-game-lib-36 · `conceder-can-still-end-the-table` · A player who quit the race keeps an enabled control that ends it for everyone

**CLOSED, no change.** Joel, 2026-09-04: *"the conceder should be able to end a
game. ending is something players talk about and choosing it is freely open."*
The shipped behavior is the intended one; `conceded` gates Concede alone on
purpose. The audit below is kept because the question will look open again to
the next reader who notices the two `disabled` expressions differ.

**What the ruling settles, beyond this line:** ending is not a privilege that
tracks your standing in the race. It is the group's decision, taken out loud,
and any player at the table may be the one who clicks it — which is why no
condition on the *player* belongs on that item. Only `isTerminal` does, because
that is a fact about the game rather than about who is asking.

```ts
const endItem     = { …, disabled: isTerminal }
const concedeItem = { …, disabled: isTerminal || !!conceded }
```

`conceded` gates Concede and nothing else. In a compete game that also offers
End (`offerEndInCompete`), a player who has conceded still sees **End game**
enabled — and `end_game` is the whole-table stop, so one quitter can end the
race for the people still playing it.

**Bananagrams is the only game this reaches** (`PlayArea.tsx:494`, the sole
`offerEndInCompete: true`), and its own concede model is what makes the question
sharp: `useCommonGame.ts:670-676` deliberately drops conceders from the
presence-pause roster so that *"a conceder has willfully quit the race, so their
leaving the tab must NOT wedge everyone else"*. The menu grants the same player
a bigger stop than the pause system will let them cause by leaving.

The counter-argument is in this file's own docstring, and it is a real one:
ending is *"the group agreeing there's no result"*, and we are friends on a call
— someone who conceded is still in the conversation, and may be the one who says
"let's just stop". **Nothing was changed either way pending a ruling**; the
one-word version put to Joel was whether `endItem` should also take
`|| !!conceded`. It should not — see the closure at the top of this finding, and
`gameMenu.test.ts` now holds that answer as a case (`F-game-lib-37`).

### RESOLVED 2026-09-04 — F-game-lib-37 · `offer-end-in-compete-untested` · The one branch with a single user is the one nothing pins

`buildGameMenu`'s output is well covered *through the games*: ten PlayArea tests
name End/Concede, and crosswords asserts the whole id order plus the ⌥⌫ and ⇧<
hints. **The exception is the compete-with-both shape.** bananagrams is its only
caller, and `bananagrams/components/PlayArea.test.tsx:90` hands
`setGameSections: vi.fn()` and never reads the mock — so nothing anywhere
asserts that this branch emits `[concede, end-game]` in that order, and nothing
pins the rule the order encodes: **⌥⌫ follows the mode's primary exit**, which
only works because `GamePage.tsx:491-493` takes the *first* matching id and
Concede is written first.

Same shape as `F-game-lib-8` — the sibling that reads as obviously fine is the
one that has no test — and cheap here: `buildGameMenu` is a pure function of its
options, so the missing coverage is one `gameMenu.test.ts` with three cases
(coop, compete, compete-with-both), not a render test.

#### Resolved 2026-09-04 — `gameMenu.test.ts`, seven cases, and BOTH load-bearing ones were planted first

The three shapes proposed, plus four the same file gets for nothing:

| case | what it holds |
|---|---|
| coop | `[help, chat, end-game, back]`; End carries ⌥⌫, Back carries ⇧< |
| compete | `[help, chat, concede, back]` — Concede *instead of* End, carrying ⌥⌫ |
| **compete + both** | `[help, chat, concede, end-game, back]` — **by position**, Concede's ⌥⌫, End's absent shortcut, and the shell's own first-match dispatch reproduced, landing on `concede` |
| conceded | Concede disabled, **End still enabled** — `F-game-lib-36`'s ruling, pinned |
| terminal | both exits disabled |
| `extra` | a game's own section lands between the two framing halves |
| `header` | a header-only section sits above everything, with `items: []` |

**Both assertions that matter were broken on purpose before being believed** —
the repo's rule that a check which cannot fail is worse than none:

- **reordering the exits** to `[end, concede]` failed the compete-with-both case
  (*expected `['help','chat','end-game',…]` to deeply equal
  `['help','chat','concede',…]`*), which is the point of asserting position: that
  edit moves ⌥⌫ onto the wrong act and breaks nothing else;
- **adding `|| !!conceded` to `endItem`** — the exact one-word change
  `F-game-lib-36` considered and Joel declined — failed the conceder case.

Both plants reverted; `git diff` on `gameMenu.ts` is empty, so the file is
byte-identical to what shipped.

**The file docstring says why order is behavior**, not what the cases are: ⌥⌫
takes the FIRST id in `END_OR_CONCEDE_IDS`, so "the shortcut follows the mode's
primary exit" is implemented entirely by Concede being written before End.

**Test-only.** No source touched. vitest **2574/2574 in 272 files** (from
2567/271 — the seven new cases), `tsc -b` clean.

### RESOLVED 2026-09-04 — F-game-lib-38 · `split-left-six-stale-doc-citations` · The split updated one doc; four others still point at the old home

Raised while checking `gameMenu.ts`'s doc citation, so it is not group E's file
— but it is **this area's own doing** and nothing else will catch it.
`F-game-lib-1`/`F-game-lib-12` moved five vocabularies out of `gameManifest.ts`
and updated `docs/common-folders.md`, which the plan named in advance. The other
docs were not swept.

Ten places outside `common-folders.md` cite `src/common/lib/gameManifest.ts`.
**Six of them are now wrong:**

| doc | names | lives at |
|---|---|---|
| `code-conventions.md:654` | `Member` | `lib/members/member.ts` |
| `naming.md:132` | `Member` | `lib/members/member.ts` |
| `common.md:236` | `GamePlayer` | `lib/members/member.ts` |
| `common.md:583` | `GamePageCtx` | `lib/gamePageCtx.ts` |
| `ui.md:780` | `MenuSubmenu` | `lib/menu/menu.ts` |
| `ui.md:1566` | `MenuItem.icon` | `lib/menu/menu.ts` |

The four that are right (`common.md:33` `playerCount*`, `common.md:608`
`GameManifest`, `ui.md:1341` `MODE_LABEL`) are right because those names stayed.
`common.md:236` is the one to look at first: the same sentence cites the moved
`terminalOutcomeVerb` at its **new** path and `GamePlayer` at its old one, so
the sweep reached that line and stopped inside it.

Three more, found in the same pass:

- **`code-conventions.md:667` and `:671`** are code samples reading
  `import type { Member } from '../../common/lib/games'` — a path that is **two
  renames stale** (`games.ts` → `gameManifest.ts` → the name moving out
  entirely). All three games shown import from `lib/members/member` today.
- **`naming.md:320`** glosses `SetupMember` — *"the TS type for a club member in
  a setup-flow context"* — and `grep -rn SetupMember src` returns **nothing**.
  A glossary row for a type the repo does not have.
- **`ui.md:754-761`**'s API sketch has `MenuItem` as a plain object with
  `{id, label, onClick, disabled?, shortcut?}` and `MenuSection = { items }`.
  Today `MenuItem` is a union with `MenuSubmenu`, carries `icon`, and a section
  carries `header`. Same file's prose (`:780`) describes the submenu shape it
  omits.

#### Resolved 2026-09-04 — six paths, two samples, a deleted row, and a sketch replaced by a pointer

| what | done |
|---|---|
| six wrong citations | `Member` ×2 (`code-conventions.md`, `naming.md`) and `GamePlayer` (`common.md`) → `lib/members/member.ts`; `GamePageCtx` → `lib/gamePageCtx.ts`; `MenuSubmenu` + `MenuItem.icon` (`ui.md`) → `lib/menu/menu.ts` |
| two code samples | both `'../../common/lib/games'` → `'../../common/lib/members/member'`, which is what all three games shown actually import |
| `SetupMember` glossary row | **deleted** |
| `ui.md`'s type sketch | **replaced by a pointer** to `lib/menu/menu.ts`, with a sentence on what a section and an item are |

**Deleting the `SetupMember` row loses nothing, and keeping it taught the
opposite of the rule.** The setup flow uses plain `Member` today
(`setupForm.ts:60`, `SetupGameModal.tsx:28`), and a type-level
`SetupMember` would contradict the convention two hundred lines above it in the
same file: one canonical `Member`, with the **variable name** carrying club-vs-game
context. The row documented a decision the repo went the other way on.

**The sketch went rather than being corrected**, on Joel's call. It was a copy of
two type literals, and being a copy is precisely why it fell behind them — it
still showed a `MenuItem` with no `icon` and no submenu arm long after both
shipped, twenty lines above prose describing the submenu. The `menu:` API block
stays (that is `GamePageCtx`'s own shape, not a copy of someone else's), and the
types are now cited where they are declared and documented.

**Verifying the fix found a seventh site the audit missed.** `naming.md:265`
also named `SetupMember`, as an example of *"the common types and hooks that
force consistency"* — an argument for shared naming, illustrated with a name
that no longer exists. Now `Member`. It survived the audit because the finding
grepped for the *path*, and this mention carries only the type name; the fix
grepped for the name, which is the check that should have run first.

**And the finding's own line numbers had already drifted** — `F-game-lib-30`
added the Chat row to `ui.md` and pushed everything below it down one. Re-grepped
at fix time rather than trusted. Both are the same lesson at two scales: a
citation is only as good as the moment it was taken.

Docs only, no source. Guards **261/261 in 23 files**; full suite **2574/2574 in
272 files**.

### F-game-lib-39 · `group-e-tests-have-no-file-docstring` · Both test files open on their imports

Third time (`F-game-lib-18` for group B, `F-game-lib-23` for group C).
`gameInvites.test.ts` and `pause.test.ts` both start stamp → imports. Both then
have good prose *inside* — `pause.test.ts:18-36` is a four-rule matrix and
`gameInvites.test.ts:50-54` explains why the age bound is tested apart from the
filter — it just sits above a `describe` instead of above the file, so the
question "what does this file defend?" is answered on the second read.

`gameInvites.test.ts` has the extra wrinkle that its two describes are two
subjects (the filter, the cutoff), which is what the missing file docstring
would say.

**The group's third test file arrived with one.** `gameMenu.test.ts`
(`F-game-lib-37`, 2026-09-04) opens on what it defends — that order is behavior,
because ⌥⌫ takes the first matching id — so this finding still names exactly the
two files it named at the audit, and the pattern it is asking for now has a
worked example one directory over.

### F-game-lib-40 · `menu-opts-fields-use-docstring-markers` · Eight field notes written as docstrings, in a file whose neighbors were converted

§21's docstring-marker pass, applied per area. Group A's own outputs already
follow it — `menu.ts:110` and `gameManifest.ts:111` note their fields with `//`
— but group E was not swept:

- **`gameMenu.ts:21-46`** — all eight `opts` fields carry `/**`, including the
  four-line `onEndGame` note and the five-line `offerEndInCompete` one, which
  are exactly the "rationale that belongs on the line it defends" case.
- ~~**`gameInvites.ts:34, 37`**~~ — `GameInvite.gameName` and `.inviterName`,
  **done 2026-09-04 under `F-game-lib-33`**, which rewrote `gameName`'s note for
  other reasons and could hardly write it back in the wrong form; `inviterName`
  beside it followed rather than leave one field in each style inside one type.
  This finding **opened at ten sites and is down to eight**, all in one file.

The type-level and function-level `/**` in both files are correct and stay.

### F-game-lib-41 · `empty-section-rule-omits-the-header` · A stated rule that would delete the feature the next field describes

`menu.ts:106-107` (group A's file, `cs-blessed`): *"Sections are separated by a
thin divider. **Empty sections drop out** — no leading or trailing dividers
around them."* Six lines later, the `header` field: *"A section may be
header-only (no `items`)."*

Read in order, the first sentence deletes the second — and `gameMenu.ts:76`
depends on the second, emitting `{ header, items: [] }` for crosswords' puzzle
credits. The renderer has it right and says so in code:
`Menu.tsx:474` is `if (section.items.length === 0 && !section.header) return`.

One clause fixes it: a section drops out when it has **neither items nor a
header**. **`Menu.tsx:59-61` repeats the incomplete version** in its own props
docstring — that file is `shared-game-chrome`'s and is noted there, not fixed
here.

### What checked out — verified, not assumed

- **All sixteen games call `buildGameMenu`**, so *"every game owns its own menu
  now"* is exactly true — not fifteen-and-an-exception, which is how the last
  three of these counts went (`F-game-lib-22`).
- **`/` really is written down only in the menu row.** The chat bubble's tooltip
  is the bare word "Chat" (`ChatButton.tsx:35`), so the claim in `gameMenu.ts:88-90`
  holds **for the app**; `docs/keyboard-shortcuts.md:57` documents the key, and a
  doc is not an affordance.
- **⌥⌫ and `+` do inherit `disabled`**, as `NEW_GAME_ID`'s docstring promises:
  `GamePage.tsx:469` and `:494` are both `if (item && !item.disabled)`.
- **The `find`-the-first-id dispatch is safe today.** `extra` sections are
  inserted *before* the exits, so a game shipping its own `end-game`/`concede`
  id would win the shortcut — no game does; the ids appear only where
  `buildGameMenu` writes them.
- **`infoSheetStore`'s structural argument is sound in every part.** `GamePage`
  is keyed by game id (`App.tsx:154`), its reset effect is keyed to match
  (`GamePage.tsx:354-356`), and the desktop no-op is real —
  `InfoSheet.module.css:10` is `display: contents`.
- **A module-level store is NOT the untested sibling here.** The obvious finding
  — `chatOpenStore` has a test and `infoSheetStore` doesn't — dies on the
  roster: `scratchpadOpenStore`, `pageMenuStore` and `toastStore` have none
  either, so `chatOpenStore.test.ts` is the exception and this file is the rule.
  Not filed.
- **`markInviteSeen`'s cap keeps the right 200.** `loadSeenInvites` rebuilds the
  Set from the stored array, so insertion order survives a reload and
  `slice(-SEEN_CAP)` really does drop the oldest, as the comment claims.
- **The invite query matches `InviteCandidate` exactly** — `id, gametype,
  club_handle, created_by` (`useGameInvitations.ts:81`) — and the age bound
  rides on the query, not on `newInviteCandidates`, which is what both
  docstrings say.
- **No British spelling and no roster count** in the seven files, beyond
  `F-game-lib-35`'s thirteen.

### Two notes for other areas — not filed there yet

- **`shared-game-chrome`** — `Menu.tsx:59-61` carries `F-game-lib-41`'s
  incomplete rule ("Empty sections drop out") in its own props docstring.
- **`hooks`** — `useGameInvitations.ts:31, 50` calls the invitation surface a
  "popup" too (`F-game-lib-33`), and `docs/ui.md:193` calls that hook "now
  headless", which is the doc agreeing that the component is the toast.

### One note for the plan

**`src/common/components/icons.ts` is on no area's roster** — `cs-unmet`, and
`grep -rn "components/icons" plans/` finds nothing. It is the only file at the
root of `common/components/`, and `gameMenu.ts` imports five values from it.
Third instance of the gap that created `utils` and `feedback`; §7's coverage is
the plan's business, not this file's.

### One seam, recorded rather than filed

**`gameMenu.ts` is the only `lib/` file that imports a runtime VALUE from
`components/`.** The other three lib→components edges are `import type`
(`setupForm.ts:4`, `foundWordsDisplayRows.ts:3`, `setupRows.ts:3`) and erase at
build. This one is five icon constants, and it cannot close a cycle today
because `components/icons.ts` is a pure re-export of `lucide-react` with no
imports of its own. Same seam group A recorded for `SetupBodyProps` and handed
to `forms` — noted here so the two are counted together if anyone ever draws the
layer line.

## Files group E wrote, and the one it moved

Per §21, a file an area creates is that area's and gets a roster row at close.
Group E made one of each:

```
 122  lib/game/gameMenu.test.ts          F-game-lib-37 — the framing, by position
   -  lib/game/peers.ts → lib/members/memberList.ts    F-game-lib-34 — renamed, not created
```

Both carry `cs-audited-game-lib`. The rename is **not** a roster addition: it is
group E's own file at a name that describes it, and it leaves the group at six.

## Predicted test breaks

*(written when the area starts changing things, per §21's test-break rule:
predict them, name the specs, leave them)*

**Predicted: ~50 specs failing with "real module ran."** The split is a rename
sweep, so §21's "renaming is the point, not a risk" applies — but
`docs/common-folders.md` records the gotcha from the last reorg:
**`vi.mock('…relative…')` path arguments are not `import` statements**, so an
import-rewriting codemod misses them and the mocks silently stop intercepting.

**What happened: nothing, and the reason is worth keeping.** The repo contains
exactly ONE `vi.mock` naming anything called `games` —
`hooks/game/useGameInvitations.test.ts:46`, and it mocks **`src/games`, the
registry**, which this split does not touch. Nothing mocks `common/lib/games`,
because it is almost entirely types: there is no runtime behavior to stand in
for. **The gotcha is real but it is about VALUE modules**, and the doc does not
say so — a reorg that moves components or hooks will meet it, this one could
not.

**What did break: the orphaned-docstring guard**, two tests, from line drift
rather than from anything being wrong. Recorded under `F-game-lib-2`.

**After the split:** Vitest **2556/2556** in 269 files, `tsc -b` clean,
`vite build` clean. ESLint reports one pre-existing warning in
`hooks/game/useWordSubmit.ts:264` (`react-hooks/exhaustive-deps`, an unnecessary
`clearLocalFeedback` dependency); this area's only edit to that file was its
import path, so the warning predates the split and belongs to `hooks`.
Described, not fixed.

### Group E's rename — predicted, and what happened

**Predicted: nothing, for the reason the split had already proved.** Moving
`peers.ts` to `lib/members/memberList.ts` rewrites 19 import lines, and the
`vi.mock` gotcha above cannot bite a module that is two pure functions: there is
no runtime behavior to stand in for, so nothing mocks it.

**That held.** No spec named the old path, and no test broke.

**Where the area's suite stands now:** Vitest **2574/2574 in 272 files** — the
seven cases `F-game-lib-37` added, on top of the 2567/271 that the group E
prose fixes ran against. `tsc -b` clean; ESLint clean on every file this group
touched, with the `useWordSubmit` warning above still standing and still
`hooks`'s. **`vite build` has not been re-run since the split** — say so rather
than inherit its result, since nothing group E did could plausibly move it.
