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
ran in passes. The six groups are below; all 34 files are `cs-met-game-lib`.

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

### D · The feedback pills — 5 files, 277 lines

| file | lines |
|---|---|
| `localPills.ts` + `.test.ts` | 92 + 32 |
| `genericPills.ts` + `.test.ts` | 55 + 73 |
| `feedbackTiming.ts` | 25 |

One vocabulary. The two pill files already argue in their docstrings about which
is which — `genericPills` opens by explaining why it is not `localPills` — so
they get read together or the distinction gets re-derived. `feedbackTiming` holds
the durations that vocabulary uses.

### E · The live session — 7 files, 532 lines

| file | lines |
|---|---|
| `gameMenu.ts` | 128 |
| `gameInvites.ts` + `.test.ts` | 113 + 73 |
| `pause.ts` + `.test.ts` | 35 + 90 |
| `infoSheetStore.ts` | 57 |
| `peers.ts` | 36 |

A game in progress: who is seated, who is connected, what the menu offers, which
mobile page is showing. **The loosest of the six**, and the one to redraw first if
any needs it — `gameMenu.ts` and `infoSheetStore.ts` are chrome-adjacent, talking
to `shared-game-chrome`'s components, so the seam that bothers anyone bothers
them here. If it splits, it splits into presence/seating and the two chrome
stores.

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

**Nine resolved 2026-09-03** — `F-game-lib-1` (the split, which Joel authorized
after the audit), with `F-game-lib-2`, `F-game-lib-4` and `F-game-lib-10` as its
consequences, then `F-game-lib-3`, `F-game-lib-5` and `F-game-lib-6` on their
own, `F-game-lib-12` after Joel found the two `games.ts` files, and
`F-game-lib-7`. **Two open
in group A:** `F-game-lib-8` and `F-game-lib-9`. **One open elsewhere:**
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

### F-game-lib-8 · `player-count-short-untested` · Three sibling formatters, two tested

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

### F-game-lib-9 · `player-outcome-exported-unread` · An exported function with no importer, and four docstrings that name it

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

Whether it stays exported is a real question rather than an obvious deletion:
`'won' | 'quit' | 'lost'` is the vocabulary and `'Won' | 'Quit' | 'Lost'` is one
presentation of it, so a second presentation would want the first. **Not resolved
here** — it needs the `lib/members/` split to be decided anyway, and the four
game docstrings are in four other areas' files.

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

### GROUP B — F-game-lib-11 · `leaderboard-read-written-five-ways` · The shared read for `status.leaderboard` has two callers and four reimplementations

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

**Scope note.** The helper is group B's. The four inline reads live in each
game's `PlayArea`, so changing them belongs to `boggle`, `letterboxed`, `setgame`
and `wordiply` when those areas open — §21's "focused scope: leave others". Group
B can widen the helper without touching a single game; the call sites convert
per area, which is the same shape as `F-utils-7`'s handoff to `floating-panels`.

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

**Final:** Vitest **2556/2556** in 269 files, `tsc -b` clean, `vite build` clean.
ESLint reports one pre-existing warning in `hooks/game/useWordSubmit.ts:264`
(`react-hooks/exhaustive-deps`, an unnecessary `clearLocalFeedback` dependency);
this area's only edit to that file was its import path, so the warning predates
the split and belongs to `hooks`. Described, not fixed.
