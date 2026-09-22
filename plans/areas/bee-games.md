# Area: bee-games

The folder it reads: `shared/bee-games`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in the folder's `todo.md`, not here.

**Status: OPEN — opened 2026-09-21**, roster agreed the same day (Joel: *"the
roster is fine"*). Four files `cs-met-bee-games` plus the two markdown ones,
which carry no stamp.

**The audit READ is DONE (2026-09-21).** Every roster file read end to end —
the factory and its spec, the board stylesheet, the leaderboard row type,
`doc.md` and `todo.md` — and the evidence beside them: both games'
`hooks/useGame.ts` (the factory's only two callers), both `BoardCol.tsx` (which
compose `bee.boardCol` and `bee.mobileStatus`), both `PlayArea.module.css` (the
four coordinate numbers `.boardCol` reads), both `PlayArea.tsx`'s two
`readLeaderboard<LeaderboardEntry>` sites, `common/game-page/readLeaderboard`,
`GamePage.tsx`'s `key={commonGame.restarts}`, `GamePageGate`'s three-way
`exists`, `useGameInvitations`, `e2e/board-geometry.e2e.ts`,
`docs/common-folders.md` and the two game docs. Nothing has landed under the
folder since it was created (§4's shell-commit check is empty). Baseline at the
read: `tsc -b` clean, lint clean, 7 of 7 green in the folder. **Seven findings,
F-bee-games-1 to -7; nothing in the code moved at the read.** One is the prose
pass (F-1); one is the effect-name convention (F-2); two are docstrings that
describe history or repeat a ruling (F-3, F-4); one is a spec gap confirmed by
planting (F-5); one is a count and an imprecise reader (F-6); **and one is a
reachable BUG (F-7)** whose cause is upstream of this folder.

## The roster

`src/shared/bee-games/` — every code file `cs-met-bee-games`:

- `makeBeeGame.ts` · `makeBeeGame.test.ts` — the `useGame` factory the two games
  bind to a schema, the immutable `BeeGame` header it returns, and the two data
  lifecycles (a once-only header read, a realtime-refetched found list)
- `beeBoard.module.css` — the coordinate-unit board geometry: `--u`,
  `--board-width`, and the mobile status block's content width
- `beeLeaderboard.ts` — the compete leaderboard row on `common.games.status`.
  No spec, and nothing to pin: it is a type declaration
- `doc.md` (a lede; the `## Intro to area` is OWED — `shared/bee-games` is one
  of the rows on `INTROS_OWED` in `src/guards/folderDocs.test.ts`) · `todo.md`
  (every heading, no items)

**Six files were deleted at the opening, before the roster was agreed** —
`letterMask.ts` + its spec in both games, and spellingbee's `pangram.ts` + its
spec (`ade3a835`). They were proposed for this roster and investigated instead:
`git log -S` over the whole history shows no component ever imported either
module, in either game. The durable half of that is now a comment at the board
builders' own mask helpers, which is where a reader meets the question.

Evidence, to be read but NOT on the roster: both games' `hooks/useGame.ts` are
`cs-unmet` and belong to the game areas — they are four lines of binding and
three type aliases each, and the seam this folder's docstrings tell a future
forker to use.

## Findings

*(`F-bee-games-1 · slug · title`, one heading each; a status prefix when it has
one, no prefix means OPEN)*

### The audit's findings — 2026-09-21

What the folder IS, for the record: one hook factory, one stylesheet, one type.
`makeBeeGame(schema)` returns the `useGame` both bee games export, and owns the
two lifecycles their data has — the header at `<schema>.games_state` is
immutable during play so it is read ONCE, while `found_words` refetches through
`useRealtimeRefetch` on every event. `beeBoard.module.css` defines `--u`, one
board coordinate unit, as the smallest of the width beside the info column, the
height above the input row, and the game's own cap — and publishes
`--board-width` from it, which is the name the family's shared `.belowBoard`
reads. `beeLeaderboard.ts` is the compete rank payload's row.

The code held up, and two of its decisions are better than they look. The TWO
failure slots are right: the header is fetched once and never retried, so its
failure is permanent, while the found list refetches on every event and its
failure should clear the moment one works — one slot would let a good refetch
erase a header failure that is still true. And the `games` subscription beside
`found_words` is not redundant: `replay_board` only DELETEs found rows, realtime
filters do not reliably match DELETEs, so the RPC's no-op `games` write is what
wakes every client. Both read as designed and the second is commented where a
reader would otherwise delete it.

What has drifted is the prose: a docstring that explains what the code used to
be, a ruling stated in four places, a count of readers. Under that, one
convention miss, one spec gap the plant found — and one bug that is not this
folder's fault but runs through it.

### F-bee-games-1 · `doc-md` · The intro is owed

`doc.md` is a lede and nothing else; `shared/bee-games` is on `INTROS_OWED`. The
lede is already good and says the right thing — what the two games share and
where the wider family's half lives. What an intro owes on top of it is the part
a newcomer cannot get from the file list: **why a shared hook body is the right
shape here when the two games' game LOGIC is genuinely different** (a letter set
versus a letter multiset), which is that the difference is entirely in which
words ship on the board, so the data lifecycle is identical and the divergence
never reaches the FE; **what `--u` buys** — that one arithmetic shape serves a
hexagonal hive and a round wheel because only its four inputs differ, which is
what a custom property is for; and the fork seam, stated ONCE here rather than
four times in code (F-4). `## Details` should carry the call tree, since this
folder is two seams and a stylesheet:

```
spellingbee/hooks/useGame ─┐
  wordwheel/hooks/useGame ─┴─▶ makeBeeGame(schema) ─▶ useBeeGame(gameId)
                                   │                    ├─ games_state  (once)
                                   │                    └─ found_words  (realtime)
                                   └─▶ BeeGame  ─▶ re-exported as <Game>Game

the two BoardCols ─▶ beeBoard.module.css   (.boardCol → --u · --board-width
                                            .mobileStatus)
the two PlayAreas ─▶ beeLeaderboard.ts     (LeaderboardEntry, via readLeaderboard)
```

Its row comes off `INTROS_OWED` in the same commit as the intro.

### F-bee-games-2 · `bare-arrow-effect` · The folder's one effect is unnamed

`makeBeeGame.ts:118`: `useEffect(() => {`. The folder has exactly one effect and
it is a bare arrow, where the convention is a named function — the fault
`board-marks` was caught on at its close, which is why the effect-name grep now
runs beside the docstring-marker pass. It is the header read, so
`loadHeaderOnce` says what it is and says the thing the docstring above spends a
paragraph on.

### F-bee-games-3 · `factory-archaeology` · The factory docstring explains what the code used to be

`makeBeeGame.ts:70–74`: *"Their `hooks/useGame.ts` bodies were byte-identical
(139 lines) — same two data lifecycles, same columns, same realtime wiring —
differing only in the schema string. This owns the one copy; each game's
`useGame.ts` is now a thin `makeBeeGame('<schema>')` + its type aliases."*

Three faults in one paragraph. It is *how it used to work*, which the comment
rule excludes. It carries a line count, which means nothing to a reader and
cannot stay true. And "is now a thin…" dates the file to the moment of a
refactor that is over. What a caller needs is the sentence underneath it, which
is already there: two lifecycles, and what each one is. The same fault is at
`:53` — *"the same field-casting the per-game hooks already did"* — where the
durable half is just that the cast is needed because a runtime schema string
widens `.from()` to `never`.

### F-bee-games-4 · `fork-ruling-four-homes` · One ruling, four places

*"If either game grows a game-specific column, give it back its own `useGame`
body"* is written at `makeBeeGame.ts:21–22` (on the type), again at `:86–87` (on
the factory), and again in **both** games' `hooks/useGame.ts` (*"if spellingbee
ever grows a schema-specific column, that's the seam to fork"*). Four copies of
one decision, two of them in files this area does not own.

It is the folder's design, so its home is `doc.md` (F-1). The two in-code copies
collapse to one — on the factory, since forking is a thing you do to the
factory's callers — and the two games' sentences shrink to what a reader of THAT
file needs: this binds the shared body to this schema. Worth saying because the
games' copies are the ones that rot: they name their own game, so each is a
sentence about the other game's future.

### F-bee-games-5 · `failure-path-unpinned` · Nothing pins either failure slot, and the plant is clean

The file's subtlest decision has no spec. Planted twice, with the folder's spec
run after each:

- **Collapsed the two slots into one** (`rowsFailure` aliased to
  `headerFailure`) — the exact thing the docstring says must not happen. **7 of
  7 pass**, and `tsc` is happy.
- **Never reported a failure at all** — both setters dropped and the return
  hard-coded to `failure: null`. **7 of 7 pass.** (`tsc` then complains about
  three now-unused variables, which a realistic regression would not produce.)

So nothing pins: a header read that fails setting `failure`; a rows read that
fails setting it; a rows read that WORKS clearing a previous rows failure; and
the header's failure outranking the rows' at the return. Four cases, no
decision in them — the spec already mocks the chain and drives `load` directly,
so each is an assertion away.

### F-bee-games-6 · `leaderboard-readers` · A count, and a reader that does not read it

`beeLeaderboard.ts:8–10`: *"Two FE readers share it: the OpponentStrip, which
renders each opponent's current rank, and the opponent-rank-up header feedback,
the compete rank-climb effect in PlayArea."*

The count rots, and the first reader is not one: `<OpponentStrip>` never imports
this type. Each game's `PlayArea` reads the payload at two places — the
rank-climb narration effect (`:479`) and the compete strip's feed (`:575`) —
and hands the strip a `Map<string, number>` of ranks. So the sentence names a
component that is given a number, not the row.

Say what it is for instead of who reads it: the compete rank payload, read
through `readLeaderboard`, which every surface that shows a rank goes through so
the strip and the climb narration cannot disagree.

### F-bee-games-7 · `stale-game-on-invite-join` · Accepting an invitation from a game page shows the OLD game's board

**A bug, reachable through the app's central social flow, and its cause is
upstream of this folder.**

`useGameInvitations` is mounted in `App.tsx`, so the invite toast appears on
every page — including a game page. Its `join` calls
`navigate(gamePath(invite.gametype, invite.gameId))` (`:200`). That changes the
route's PARAMS, not the route: `/g/spellingbee/A` → `/g/spellingbee/B` keeps the
same element mounted.

`GamePageGate`'s `askWhetherTheGameExists` effect reruns on `[gameId]` but
**does not reset `exists` to `'checking'`**, so the subtree is never unmounted
and never shows `<Loading/>`. `GamePage` keys the play surface on
`commonGame.restarts` — deliberately, and for a different reason — not on
`gameId`. So `useBeeGame` stays mounted across the change, and its header effect
reruns without resetting anything:

- `loading` stays **false** (it is only ever set false, never back to true),
- `game` is still game **A**'s header — A's letters, A's two word lists,
- `foundWords` and `rowsLoaded` are still A's rows.

For one round trip the player is on game B's URL looking at game A's board and
A's found words, and a word typed there is validated against A's shipped list.
`rowsLoaded` being already true also means peer narration seeds against A's
backlog.

**This is not a bee-games defect** — it is the shape of every game's `useGame`
(boggle's `[gameId]` effect does not reset either; connections' `setGame(null)`
is its zero-rows branch, not a gameId change; psychicnum, the blessed control,
has no separate header read at all, so it cannot show the fault). That a sibling
does the same is not a defense, but it does decide WHERE the fix goes.

1. **Fix it upstream, at the gate.** `askWhetherTheGameExists` sets
   `setExists('checking')` before its read, so a gameId change unmounts the
   subtree and every game's hooks remount clean. One line, fixes all sixteen
   games, and it is what the three-way `exists` already means — "checking" is
   the state of not knowing about THIS id. `game-page` is blessed and closed, so
   this is a conformance edit into a closed area, which needs Joel's word.
   **Recommended**, and the one that does not need sixteen games audited.
2. **Fix it here, in the factory.** The header effect begins
   `setLoading(true); setGame(null); setFoundWords([]); setRowsLoaded(false)`.
   Correct for these two games and no others; leaves fourteen games with the
   bug; and it fights the gate rather than reading from it.
3. **Record it and leave it.** Against: it is reachable by the flow the app is
   built around — friends inviting each other to the next game.

Predicted: a spec for (1) belongs to `game-page`'s area; the reachability is
provable in a unit test of the gate (render with id A, rerender with id B,
expect `<Loading/>`), which is cheaper than an e2e.

## What checked out

Claims re-verified against code rather than taken from the docstrings, listed so
the closing re-read does not redo them: the header really is read once and
`found_words` really is the only refetch; the **two** failure slots are right for
the reason given (a permanent failure versus a clearing one), and the header's
wins at the return; the `games` subscription beside `found_words` is the
`replay_board` DELETE touch and is not redundant; `GameSchema` as
`Parameters<typeof supabase.schema>[0]` does keep the factory honest without
hard-coding a union; the `SchemaQuery` cast is needed because a runtime schema
string widens `.from()` to `never`; `--u`'s three-way `min()` reads all four
per-game numbers and both games declare all four; `--board-width` is published
here and read by the family's `.belowBoard`; both `BoardCol`s compose
`bee.boardCol` and `bee.mobileStatus`; the claim that *"this repo doesn't use
`composes` anywhere"* is TRUE (no `composes:` in any stylesheet — only two
`todo.md` items proposing it); `beeBoard.module.css` is on no guard's pending
row and writes no governed literal; no `/**` marker survives inside a type body;
`e2e/board-geometry.e2e.ts`'s account of the split between this folder and
`shared/found-words` is accurate.

## Notes

- **Handed on, not this area's:** both games' `PlayArea.module.css` say
  `--board-reserve: 24rem` under a comment that *"All three found-words games
  land on 24rem and none derives it from another"* — a count and a roster in a
  game's file, the fault `found-words` F-18 removed from the shared sheet beside
  it (which now reads "24rem everywhere so far"). The two game areas own those
  files.
- **The `@@` marker's meaning, for this file's reader:** a rule Joel has not yet
  seen in place and said looks right; it comes off at his read, never at
  Claude's. Nothing here moves or removes one.

## Predicted test breaks

- F-1: `src/guards/folderDocs.test.ts` — `shared/bee-games` comes off
  `INTROS_OWED` in the same commit as the intro, or the guard fails either way.
- F-5: four cases more in `makeBeeGame.test.ts` (7 → 11).
- F-7 (1): a new case in `game-page`'s gate spec, not in this folder.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` intro written; its row off `INTROS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
