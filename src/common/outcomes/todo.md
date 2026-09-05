# outcomes — todo

## Bugs

## Soon

- **Rename `status.outcome` → `status.terminal_cause`.** The repo spends
  `outcome` on two unrelated closed lists: this vocabulary (the TONE a thing
  reads as — `won`, `near`, `warning`, …) and the game-status key naming WHY a
  game stopped (`timeout`, `manual`, `solved`, `conceded`, …,
  [docs/states.md](../../../docs/states.md)). Having one of the app's most
  central terms also mean something else is not a documentation problem, and
  the tone list is the one that keeps the word — it is the older, wider claim,
  and `outcome` is what a pill, a tile, a log bar and an envelope all say.

  `terminal_cause` is the right name on both halves: `terminal` is already how
  this repo says game-end (`common/terminal/`, `terminalCopy`, the
  `--outcomes-*-terminalFrame-color` role), and `cause` is the word
  `docs/states.md` already uses to define the field — *"names the CAUSE, never
  the verdict"* — so the key comes to say what its own doc says about it.
  **Snake, not camel**: it is a raw JSONB key spelled identically in SQL and
  TS, sitting beside `words_found`, `target_rank` and `top_score`.

  What it touches:

  | | scale | shape |
  |---|---|---|
  | `supabase/sql/*.sql` | ~65 sites, all sixteen games + `common.sql` | in-place edits; behavior files are re-applied whole on every deploy, so none of this is a migration |
  | FE readers | ~98 sites | mechanical |
  | stored rows | every ended game in prod | **a forward migration**, rekeying `outcome` inside the `status` JSONB |
  | docs | `states.md`, `game-status-labels.md`, the per-game docs, `naming.md` | prose |
  | tests | `gameStatusLabels.test.ts` fixtures, pgTAP | mechanical |

  **No fallback** (Joel): a single cutover, no window where a reader accepts
  either key. The migration therefore lands before the SQL that stops writing
  the old name, or an ended game's status line goes blank for rows written
  under it. Deploy ships SQL and FE together, so there is no version skew to
  cover.

  Not folded into other work — a sixteen-game sweep with a data migration in it
  is done in one deliberate pass, when a whole-repo rename is the only thing in
  flight.

## Someday

## Maybe
