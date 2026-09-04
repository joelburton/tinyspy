# Area: bananagrams

One of the sixteen game areas. The process is
[app-audit.md](../app-audit.md) §21; **the plan holds the order** (§7 → "The
areas, in order"), this file holds everything else.

**Brand: MonkeyGrams.** The codename `bananagrams` is what the code says everywhere —
schema, folder, gametype, this file. The brand appears in the manifest's `BRAND`
and nowhere else (docs/naming.md).

**Status: NOT OPENED.**

**A game area is TWO passes, back to back** (§7 → The areas, in order): the audit
pass — React, SQL and CSS together — and then the **tile-feedback** pass against
[tile-feedback.md](../tile-feedback.md), which is a design target read per area
rather than a sprint of its own. The game's tf level is tracked there.

This file exists **before** the area opens so there is somewhere to put a note the
moment one turns up. Nothing below is a commitment; the roster is agreed with Joel
when the area actually opens, by listing its files and stopping.

## The roster

*(agreed with Joel when the area opens — §21: list the files and STOP. For a game
that is `src/bananagrams/`, its two SQL files, and `docs/games/bananagrams.md`.)*

## Findings

*(IDs are `F-bananagrams-1`, `F-bananagrams-2`, … — §21 → Areas. Every heading states its
status; no status prefix means OPEN.)*

## Notes, to-dos and deferrals

Findings, notes, and the record of what the sprint did here — **all of it lives
in this file**, including work done during the sprint.

**The one thing that goes elsewhere:** something this area turns up that is
genuinely OUT of the sprint's scope goes to `docs/games/bananagrams.md` → Deferred,
deliberately and by name. That is the game's standing register; this file is the
sprint's record of the game.

### Already waiting for this area

Rows §7 → "Carried forward" already assigns here, indexed so opening this area doesn't start by re-reading the whole checklist. **That checklist is the one home** — each line there carries the evidence.

- `<ShuffleButton>` should never take focus at all — game stuff doesn't. The fix is removing the tab stop, not restyling the ring

#### The setup recap is written twice — and has drifted three ways

From `game-lib` group C, 2026-09-03 (was `F-game-lib-24`). **Bananagrams is the
last game rendering its setup recap from two sources**, which is the exact
arrangement `common/lib/game/setupRows.ts` was built to remove. Fourteen of the
other fifteen games call `setupRows()` once and render it on both surfaces;
crosswords has no recap at all, deliberately.

- `components/PlayArea.tsx:111` calls `setupRows()` for the **PDF**
- `components/PlayArea.tsx:638-657` hand-writes the **screen's** `<li>`s inside
  `<SetupDisclosure>`

Two hand-maintained copies of one list, and they have already diverged:

| | screen (`<li>`) | PDF (`setupRows`) |
|---|---|---|
| roster | absent | `rosterRow()` — "the FIRST row of every game's recap" |
| order | Bunch, then Starter hand | Starter hand, then Bunch |
| word-check label | "Word check" | "Words" |
| dumped tiles | `set aside (bag)` / `return to the bunch` | **inverted** — see the next item |

Nobody chose any of those differences. They are what two copies of the same list
do over time, which is the argument `setupRows.ts`'s own docstring makes using
psychicnum's old "different facts on paper than on screen" as its example.

**The fix is here, not in `common/`.** `setupRows()` is exported and correct;
this game's screen recap simply doesn't call it. A shared builder cannot make a
game call it. Delete the hand-written `<li>`s and render the array line 111
already computes, through the same list markup the other games use. Small — the
risk is layout, not correctness, since `guards/setupRows.test.ts` already
enforces the rules the array follows.

**Nothing catches this today.** That guard asserts every setup KEY produces a
row; it cannot see that a game renders its screen recap from something else. A
guard that could would have to compare the two surfaces — a different check from
the one that exists, and worth considering while fixing this, since bananagrams
is unlikely to be the last game to skip a migration.

#### The PDF inverts `dump_to_bag` — a shipped, player-visible wrong statement

From `game-lib` group C, 2026-09-03 (was `F-game-lib-25`). **A real bug, one
line.** `lib/setupSummary.ts:34`:

```ts
value: setup.dump_to_bag ? 'back to the bunch' : 'out of play'
```

Both arms are swapped. `lib/setup.ts:60-62` is unambiguous — *"`false`
(default) = back into the bunch… `true` = to the out-of-play 'bag'"* — and the
setup form agrees (`'to bag' : 'to bunch'`), as does the screen recap
(`components/PlayArea.tsx:655`, `'set aside (bag)' : 'return to the bunch'`).

So the printout misstates the rule on **either** setting: a game played with
dumps going to the bag prints that they went back to the bunch, and vice versa.

**It is only invisible because of the item above.** With one source for the
recap this string would render on screen too, in a disclosure players open
mid-game, and somebody would have hit it. The duplication is what let a wrong
value survive on the surface nobody proofreads.

Worth fixing **first and separately**: it is a wrong sentence on a record people
keep and print, it is one line, and it does not wait on the refactor.

#### A manual end has no branch at all — it prints a winner that doesn't exist

From `game-lib` group C, 2026-09-03. **Suspected bug, needs a repro before it is
believed.** `components/PlayArea.tsx:575-583` builds the terminal copy as one
ternary chain over `ctx.status?.outcome`: `timeout`, then `conceded`, then
`selfWon`, then a final else that reads

```ts
{ verdict: `${winnerName} went out — Bananas!`, message: `${winnerName} won`, tone: 'lost' }
```

There is no arm for a manual end (`play_state === 'ended'`), which is the
terminal the other games route to the shared `endedCopy()`. If a game is stopped
by agreement, this appears to fall through to that last arm and announce a
winner for a game nobody won — with `winnerName` whatever it resolves to when
there is no winner.

Every other game handles this: thirteen call `endedCopy(mode)` and MothCubes
writes its own on purpose. This game alone has no branch.

**Verify before fixing** — end a bananagrams game manually and read the pill.
The chain may be unreachable for `ended` if `isTerminal` excludes it, in which
case the finding is that the code cannot say so.

## Predicted test breaks

*(written when the area starts changing things, per §21's test-break rule: predict
them, name the specs, leave them)*
