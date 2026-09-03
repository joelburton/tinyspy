# Area: game-lib

An area of app-audit's step 7. The process is [app-audit.md](../app-audit.md)
§21; **the plan holds the order** (§7 → "The areas, in order"), this file holds
everything else.

**What it is.** The non-visual half of the game shell — the registry, the
manifest contract, and the game logic every game shares, none of which belongs to
any one game: `src/common/lib/game/`, `src/common/lib/games.ts` + its test, and
`src/games.ts`.

**Created 2026-09-03** by Joel, during `utils`'s opening. Two of its four groups
of files were on no area's roster at all: `deep` listed them out as "names every
game" (`deep.md:160`, `:161`) and nothing picked them up — the identical gap that
created `utils` one folder over.

**Status: NOT OPENED.**

This file exists **before** the area opens so there is somewhere to put a note the
moment one turns up. Nothing below is a commitment; the roster is agreed with
Joel when the area actually opens, by listing its files and stopping.

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

**The split below touches 236 files.** `common/lib/games.ts` is imported across
every area in the sprint. Split it late and it edits files that are already
`cs-blessed`; split it early and every area after this one reads the settled
shape. Hence its slot near the front, ahead of the other two scaffolding areas
rather than beside them — §7 holds where, as it holds every area's position.

## The roster

*(agreed with Joel when the area opens — §21: list the files and STOP)*

The four groups as they stand, listed so the shell is useful rather than empty —
**not agreed**. Measured 2026-09-03:

| | files | lines |
|---|---|---|
| `src/common/lib/game/` | 31 | 2,181 |
| `src/common/lib/games.ts` + `games.test.ts` | 2 | 1,003 |
| `src/games.ts` — the manifest list, the one file allowed to import each game | 1 | 56 |

**Not this area's**, and named so the boundary is visible: `common/components/game/`
is `shared-game-chrome`, and `common/hooks/game/` is a question `hooks` answers at
its own opening (§7 row 4). Adding this area deliberately does not preempt that.

## Findings

*(IDs are `F-game-lib-1`, `F-game-lib-2`, … — §21 → Areas. Every heading states
its status; no status prefix means OPEN.)*

## Notes, to-dos and deferrals

Findings, notes, and the record of what the sprint did here — **all of it lives
in this file**. Add freely: a line costs nothing and is the alternative to losing
it.

**The one thing that goes elsewhere:** something this area turns up that is
genuinely OUT of the sprint's scope goes to `docs/deferred.md`, deliberately and
by name. That is the app's standing register; this file is the sprint's record of
the area.

### Already waiting for this area

**Split `common/lib/games.ts`.** Agreed with Joel 2026-09-03 (*"yes, split"*)
during `utils`'s opening, and assigned here rather than to `utils` on his call
that the game half waits: *"i don't want to dive into game-stuff yet."*

`games.ts` is **909 lines holding five unrelated vocabularies**, and
`docs/common-folders.md`'s one-line description of it ("the GameManifest type +
registry helpers") is no longer true. Its position at the root of `lib/` is a
recorded judgment call — *"it's THE registry, and a dead-obvious top-level path
beats one more level of nesting"* — and that is defensible for the registry.
What is not defensible is what rode in on the exemption. Counted across the 236
importing files, 361 named imports:

| what | names | imports | destination |
|---|---|---|---|
| identity | `Member` 103 · `GamePlayer` 18 · `outcomeVerb` 7 · `playerOutcome` · `RichMessage` 1 | 129 | `lib/members/` (Joel, 2026-09-03) |
| the registry | `GamePageCtx` 32 · `GameManifest` 22 · `TimerMode` 21 · `CommonGameListRow` 7 · `GameStopResult` 5 · `MODE_LABEL` 5 · `playerCount*` 5 | 97 | stays in `lib/games.ts` |
| setup forms | `CreatedGame` 31 · `SetupBodyProps` 17 · `SetupSetter` 16 · `SetupOf` 16 · `GameSetupForm` | 80 | `lib/setup/` — except `CreatedGame`, below |
| feedback | `GenericFeedbackMsg` 39 · `GenericFeedbackApi` 5 | 44 | `lib/feedback/` |
| the menu | `MenuSection` 7 · `MenuApi` 2 · `MenuItem` 2 · `MenuHeader` · `isSubmenu` · `MenuSubmenu` 1 each · `MenuAction`, `MenuItemBase` | 14 | `lib/menu/` — the folder already exists |

**`GameManifest` is 22 of 361.** The most-imported name in the registry file is
`Member`, which names no game. The loose-file exemption was granted for the
file's smallest constituency, which is the whole finding.

The planned destinations, with the calls that are not obvious:

- **`lib/members/member.ts`** — `Member`, `GamePlayer`. **Types only, and that is
  load-bearing:** `Member` is the name 103 files import, so a pure-type module
  means those 103 imports erase at runtime and cannot close a cycle whatever else
  moves. `games.ts:6` already carries a warning about the cycle the current
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

### Open question — `outcomes.ts`

`src/common/lib/outcomes.ts` is the third loose file at the root of `lib/`: 46
lines, one type (`Outcome`), nine importers. It is **not** this area's — it names
no game — and it is left loose on purpose for now. Its own docstring makes the
argument: *"Its own file because it is a vocabulary rather than a feature."* The
two candidate owners are `utils` (whose membership rule it matches word for word:
no page, no game, no subsystem) and `corecss` (the outcome families are also a
color bucket). Undecided as of 2026-09-03; recorded here so it is not lost.

## Predicted test breaks

*(written when the area starts changing things, per §21's test-break rule:
predict them, name the specs, leave them)*

The split is a rename sweep, so §21's "renaming is the point, not a risk" applies
— but `docs/common-folders.md` records the one gotcha from the last one:
**`vi.mock('…relative…')` path arguments are not `import` statements**, so an
import-rewriting codemod misses them and ~50 tests fail with "real module ran."
Rewrite mock paths in a second pass.
