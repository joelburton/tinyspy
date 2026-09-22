# Area: wordle

**Brand: WordNerd.** The codename is what the code says everywhere; the
brand appears in the manifest's `BRAND` and nowhere else.

One of the sixteen game areas. The process is [app-audit.md](../app-audit.md)
§4; the plan holds the order, this file holds the reading. Owed work lives in
`src/wordle/todo.md`, not here.

**Status: OPEN** (2026-09-22). Pass 1, the restructure: Step 0 done, Step 1
next. **Three passes back to back**, psychicnum's and connections' shape:
restructure → audit → tile-feedback.

## The roster

Agreed with Joel 2026-09-22, `cs-met-wordle` — **44 stamped files**:

| where | how many | note |
|---|---|---|
| `src/wordle/` | 30 | nine arrived `cs-fixed-outcome-fix` — that area ruled its files belong to their own area, which is this one |
| `supabase/migrations/` | 2 | `20260625000000_wordle.sql`, `20260917000001_wordle_events.sql` |
| `supabase/sql/wordle.sql` | 1 | also `cs-fixed-outcome-fix` |
| `supabase/tests/wordle/` | 11 | every pgTAP file but one |

`src/wordle/logo.svg` has nowhere to put a stamp (step 11's); `todo.md` is
markdown and carries none. `src/wordle/doc.md` does not exist yet —
`docs/games/wordle.md` is deleted into it during the passes, as psychicnum's
and connections' docs were.

### What is NOT on it

- **`supabase/tests/wordle/colors_test.sql`** — `cs-blessed-wordle-style` since
  earlier the same day. It pins `common.wordle_colors`, the shared algorithm,
  not anything of wordle's, the way `pdfTiles.ts` stayed `pdf`'s. **Read here
  all the same** (Joel: *"you should still read it"*), as evidence.
- **`src/wordle/lib/colors.ts`'s PLACE** is settled rather than open:
  `wordle-style` ruled that `colorRank`'s two call sites are both wordle's and
  it stays here. The file IS on this roster; what is settled is that it does
  not move.

## The three passes

Joel, 2026-09-22: *"we're going to the same three-passes as we did for
psychicnum and connections."* Read from `plans/areas/psychicnum.md` and
`plans/areas/connections.md`; connections' eight steps are psychicnum's six
with the `doc.md` skeleton and the `AnswerMessage` conversion moved earlier,
and this game follows the eight.

1. **The restructure** — [playarea-readability.md](../playarea-readability.md)
   step by step, each step ONE COMMIT Joel reads. It goes first because the
   audit's prose pass would otherwise polish comments this rewrites or deletes.
2. **The audit** — React, SQL and CSS together, findings recorded below.
3. **tile-feedback**, against [tile-feedback.md](../tile-feedback.md).

The shape the first two games settled is
[docs/playarea.md → The shape of a game's PlayArea.tsx](../../docs/playarea.md);
this game conforms to it, and where it cannot, this file says why.

## The restructure — plan

Each step is one commit Joel reads; that reading is his careful read of the
code, made on the shape that will stay. Every step is a behavior-preserving
no-op unless its heading says otherwise, verified by the net below.

### Step 0 — the baseline — DONE 2026-09-22

Run on the untouched tree with the roster stamped `cs-met-wordle` (Joel:
*"do step 0; you can run the e2e"*):

- `tsc -b` clean; lint clean over `src/wordle/`.
- The game's unit tests and the guards: 38 files, 369 tests, green.
- pgTAP, the whole suite: 181 files, 2545 tests, PASS — wordle's eleven among
  them.
- The geometry harness re-seeded with `BASELINE=1`: 21 boards written, and the
  new file **byte-identical to the one it replaced**, so no board had drifted
  since the last seed.
- wordle's four e2e specs: 5 tests, green in 7.6s (`wordle-history`,
  `wordle-keyboard`, `wordle-mobile` at two sizes, `wordle-print`).

**A later red is the step's.**

### Step 1 — gather this game's owed work into `todo.md` — DONE 2026-09-22

What the four sources held, and what moved.

**`docs/games/wordle.md` → Deferred had two items. One was already done.**
*"`wordle-keyboard.e2e.ts` reads a token that no longer exists"* — line 162
calling `token('--ink-on-dark-color')`, which resolves to nothing. Fixed
**2026-09-02** in `63069900`, and the spec now reads `--ink-onDark-color` with a
comment naming the trap (*"An undefined custom property does not throw"*). It
also passed in Step 0. **Deleted rather than moved**, which is what the register
is for: a shipped item left in a Deferred list reads as work for three weeks.

**The other item moved OUT of this game.** *"Stop HIDING the keyboard at
terminal; dim it instead"* — reversed 2026-08-17 after a real lost game, on the
grounds that the keyboard is where the alphabet's state lives and hiding it
removes that summary at the moment you want to study it. It went to
`src/shared/onscreen-keyboard/todo.md`, not `src/wordle/todo.md`, by the sorting
key `docs/deferred.md` states: *the file you'd edit to do the work*, which is
that folder's stylesheet. A judgment call, and cheap to reverse.

**Two consequences worth recording, because they are about work done HOURS
earlier today:**

- **`onscreen-keyboard` closed this morning without seeing this deferral**, and
  could not have: it was filed under a consumer's game doc, and the shared
  folder's own `todo.md` was empty. That is the gap `deferred.md`'s sorting key
  exists to prevent, and it took a game area to find it.
- **That area's F-2 made the deferral bite twice as hard.** wordiply used to
  UNMOUNT its keyboard at terminal; it now passes `gameOver` and hides it, which
  was the right fix for the reflow and is the wrong end state for the readout.
  The two games now share one treatment, which is exactly what the item wants
  before it is changed. The folder's `doc.md` said the withdraw was settled and
  now says only the BOX is.

**`docs/deferred.md`'s per-game index did not list wordle at all**, under a
table headed *"Only these games have open items today; the rest have none"* —
while the doc carried two. It has a row now, pointing at `src/wordle/todo.md`.

**`plans/tile-feedback.md` cited `wordle.md → Deferred`** for the item that
moved; repointed.

**`src/wordle/todo.md` is unchanged.** It already held two bugs (the reject ring
reading the previous refusal's outcome; `act-new-game` answering `active`
pre-load), three Soons (the hand-tuned `--avail-h`, the action row's branches,
no whole-table stop for a race) and one Someday (the `<Loading>` swap). Three of
those are the restructure's own work: Step 2 closes the `<Loading>` swap, Step 5
the action row, and `act-new-game`'s pre-load answer goes with Step 2's split.

## Findings

*(`F-wordle-1 · slug · title`, one heading each; a status prefix when it
has one, no prefix means OPEN)*

## Notes

*(things worth remembering about this area that are neither a finding nor
owed work — a forward-fix made from another area, a question for the opening,
a dependency listed and left. Anything durable goes to `todo.md` or
`docs/games/wordle.md` instead; a note here never stands in for either)*

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] `docs/games/wordle.md` reconciled with `todo.md`: its Deferred
      section moved into the todo, or deliberately kept as the standing register
- [ ] the tile-feedback pass done, and the game's tf level updated there
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
