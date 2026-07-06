# Plan: cryptic word-break / hyphen marks (`|` / `_`)

> **✅ SHIPPED 2026-07-05.** Built as planned (Joel: option A, PDF marks now, do now).
> `crosswords.cells` gained `mark_right`/`mark_bottom` + the `set_mark` RPC; the FE ports
> `nextMarkState`, the `|`/`_` keys, `useCells.setMark`, the Cell edge-mark render + CSS, and
> the jsPDF `drawEdgeMark`. Tests: `marks.test.ts`, `useCells.test.ts` (setMark), pgTAP
> `set_mark` pins, e2e cycle test. This doc is kept as the design record. Deviations landed as
> written (option A: fillable cells only; compete marks per-player).

A port of crossplay's edge-mark feature. Studies the crossplay original and lays out how it
maps onto our RPC + Postgres-CDC model. Scope is small and genuinely optional (cryptic-crossword
apparatus; NYT dailies never use it) — built now on request.

---

## 1. What the feature is (from crossplay)

A **player-drawn annotation** on a cell edge marking where a single grid entry breaks into
multiple lexical words — the cryptic convention where "PENKNIFE" is one entry but two words
("PEN|KNIFE"), or "well-being" has a hyphen. Two edges per cell:

- **`|` → the RIGHT edge** (boundary with the cell to the right) — for across breaks.
- **`_` → the BOTTOM edge** (boundary with the cell below) — for down breaks.

Each keystroke **cycles** that edge: `none → break → hyphen → none`.
- **break** renders as a thick bar centered on the boundary.
- **hyphen** renders as a short dash across the boundary (smaller, so the two read differently
  at a glance).

Key properties (crossplay):
- **No gameplay effect.** Marks are ignored by solve / check / reveal / fill. Only "Clear" wipes
  them (back to the author's initial marks, if any). They're pure annotation.
- **Shared, not per-player** — in crossplay everyone edits one grid, so a mark is visible to all.
- The **only** semantic consumer is `clueAnswer.ts`, which derives a clue enumeration like
  `(4,3)` by splitting the entry on its marks — but that feeds the **AI "Explain" feature**,
  which is itself deferred. So for us, marks are **display-only**.

### Crossplay's implementation (the parts that port)

| Piece | crossplay location | what it is |
|---|---|---|
| Data | `packages/shared/src/index.ts` | `Cell.markRight?`, `Cell.markBottom?` (`'break'\|'hyphen'`); `MarkSide='right'\|'bottom'`; `MarkType='break'\|'hyphen'` |
| Cycle | `PuzzleView.tsx:161` `nextMarkState(cur) → break\|hyphen\|null` | pure, unit-tested — **port verbatim** |
| Local apply | `PuzzleView.tsx:171` `setCellMark(...)` | optimistic immutable update — our equivalent lives in `useCells` |
| Keyboard | `PuzzleView.tsx:994` (`\|`/`_` branch) | cycle + optimistic + wire send |
| Wire | `{type:'mark', row, col, side, markType}` | **does not port** — we use an RPC |
| Server | `ws.ts:319` `applyMark(...)` | mutate cell edge, bump version, broadcast — our equivalent is a `set_mark` RPC |
| Render | `Cell.tsx:112–115` + `Cell.module.css` (`.markRightBreak` / `.markRightHyphen` / `.markBottomBreak` / `.markBottomHyphen`) | four absolutely-positioned em-sized spans — **port the CSS + the JSX** |
| Print | `print/grid.ts` `drawEdgeMark(...)` | jsPDF edge marks — our `pdf/grid.ts` currently drops them |

---

## 2. How it maps onto our port

Our model differs from crossplay's single shared SQLite snapshot in two ways that matter here:
**(a) state is per-cell rows in `crosswords.cells`, synced by CDC, not one blob; (b) compete
gives each player their own grid.** Both map cleanly:

- **Storage: two columns on `crosswords.cells`** — `mark_right text`, `mark_bottom text`, each
  `null | 'break' | 'hyphen'` (a `check` constraint). Marks ride on the existing cell row, so
  they sync through the **same `useCells` CDC path** — no new hook, no new channel, no new
  reconciliation logic. The version trigger already bumps on any UPDATE.
- **Per-grid by construction.** A coop mark lands on the shared grid (`owner_id null`); a compete
  mark lands on the writer's own grid. This *extends* crossplay's "shared in coop" to compete's
  private grids for free — each solver annotates their own copy.
- **New RPC `set_mark(target_game, p_row, p_col, p_side, p_mark)`** mirroring `set_cell`: the
  same guards (membership · `play_state = 'playing'` · not conceded), coop→`owner null` /
  compete→caller, validates `p_side ∈ {right,bottom}` and `p_mark ∈ {break,hyphen,null}`, UPDATEs
  the one mark column, returns the bumped version so the FE's own CDC echo is a no-op.

### The one real design decision — marks on **given** cells

crossplay lets a mark sit on any open cell (`kind === 'cell'`), **including givens**. But our
`crosswords.cells` only has rows for **fillable, non-given** cells (givens are author-correct and
excluded — solve treats their absence as satisfied). A `markRight` belongs to the *left* cell of
a boundary, so "a break immediately to the right of a given cell" has no row to live on.

Three options:

- **(A) Restrict marks to fillable cells (recommended for v1).** Simplest; zero schema-invariant
  disruption. The limitation — you can't put a break on a given cell's own right/bottom edge — is
  rare and only matters for cryptic puzzles that *also* have givens, which is a thin intersection.
  Document as a deviation from crossplay.
- **(B) Add rows for given cells too.** Rejected: it breaks the "only fillable cells get rows"
  invariant that `_is_solved` and the RLS all lean on; high blast radius for a cosmetic feature.
- **(C) A separate `crosswords.cell_marks` table** keyed `(game, owner, row, col)`. Cleanest for
  full parity (marks on any cell), but it's a whole new table + RLS + a second CDC subscription or
  a join. Overkill unless a real cryptic import needs given-edge marks.

**Recommendation: (A).** Revisit (C) only if an imported cryptic actually needs a mark on a given.

---

## 3. Work breakdown (one stage, ~half a day)

### Server (`supabase/migrations/20260706000000_crosswords.sql`)
1. Add `mark_right text`, `mark_bottom text` to `crosswords.cells`, each
   `check (mark_right in ('break','hyphen'))` (null allowed).
2. `create function crosswords.set_mark(target_game uuid, p_row int, p_col int, p_side text,
   p_mark text) returns table(version bigint)` — guards as `set_cell`; validate side + mark;
   `update crosswords.cells set mark_right/mark_bottom = p_mark where … owner_id is not distinct
   from v_owner and row/col`; `raise` if `not found` (not a fillable cell → the option-A
   restriction is enforced here). Grant to authenticated, revoke from public.
3. No change to `_is_solved` / `games_state` / shielding — marks are neither secret nor scored.

### FE
4. `lib/types.ts` — un-drop `markRight`/`markBottom` on `Cell` + `MarkSide`/`MarkType` (the
   drop comment there points at this plan; flip it to "supported"). Add `nextMarkState` (port
   verbatim from `PuzzleView.tsx:161`) — put it in `lib/cursor.ts` or a small `lib/marks.ts`.
5. `hooks/useCells.ts` — extend `CellState` with `markRight`/`markBottom`; select the two columns
   in `load()` + read them in the CDC payload (they flow through the existing merge automatically).
   Add a `setMark(row, col, side, next)` mirroring `setCell` (optimistic + version-guarded
   rollback + adopt-returned-version). One `set_mark` RPC call.
6. `hooks/useGridKeyboard.ts` — re-enable the `|` / `_` branch (currently scoped-out with a
   comment): compute `side`, read the current mark from `fillAt`-style state, `nextMarkState`,
   call a new `onMark(row, col, side, next)` ref callback. Update the module docstring.
7. `components/Grid.tsx` (`Cell`) — render the four mark spans off `markRight`/`markBottom`; add a
   `data-mark-right` / `data-mark-bottom` attribute for e2e. Port the four CSS rules from
   crossplay `Cell.module.css` into `Grid.module.css` (em-sized, `pointer-events:none`).
8. `components/PlayArea.tsx` — wire `onMark` into the `kbRef` (calls `useCells.setMark`); coop
   marks broadcast nothing extra (they sync via CDC like fills; the `recentFills` flash is
   fill-only and stays that way).
9. `components/Help.tsx` — document `|` (right-edge break/hyphen) and `_` (bottom-edge).

### Print (optional follow-on)
10. `pdf/grid.ts` — port crossplay's `drawEdgeMark`; carry `markRight`/`markBottom` through
    `PlayArea.buildPrintCells`. The renderer is otherwise a verbatim port, so this is small.
    Defer if we want the FE feature first.

### Tests
11. **pgTAP** (`gameplay_test.sql`): `set_mark` cycles right/bottom through break→hyphen→null;
    rejects a given cell (option A); rejects a conceded player + non-playing state; coop writes
    the shared row, compete writes only the caller's; a non-player is blocked.
12. **Vitest**: `nextMarkState` pure cycle; `useCells.setMark` optimistic + rollback + CDC apply.
13. **e2e** (`crosswords.e2e.ts`): press `|` twice → cell shows `data-mark-right="hyphen"`, a
    third press clears it; `_` for the bottom edge.

---

## 4. Deviations from crossplay to record (in `docs/games/crosswords.md` + `deferred.md`)

- **Marks live on `crosswords.cells` columns synced by CDC**, not on a shared snapshot over a
  socket. Compete marks are therefore **per-player** (each private grid), where crossplay is
  single-grid — a natural extension, not a regression.
- **Marks are restricted to fillable cells** (option A) — no marks on given cells. Note it.
- **No `clueAnswer` enumeration** (`(4,3)`): that consumer is the deferred AI "Explain" feature.
  Marks are display-only here.
- **No "Clear grid" wipe of marks** — we don't expose a clear-all op; N/A until we do.

## 5. Open decisions for Joel (before building)

1. **Given-cell marks** — go with option A (restrict to fillable), or is full parity (option C's
   `cell_marks` table) wanted? *Recommend A.*
2. **Print marks now or later** — include step 10 in the stage, or ship the FE feature first and
   add PDF marks as a follow-on? *Recommend later.*
3. **Priority** — this is cryptic-only apparatus; worth building now, or hold until we actually
   import a cryptic puzzle source? *Recommend hold, since the puzzle sources today (curated
   library + NYT dailies) don't produce marks.*
