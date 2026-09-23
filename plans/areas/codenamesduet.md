# Area: codenamesduet

**Brand: TinySpy.** The codename is what the code says everywhere; the
brand appears in the manifest's `BRAND` and nowhere else.

One of the sixteen game areas. The process is [app-audit.md](../app-audit.md)
§4; the plan holds the order, this file holds the reading. Owed work lives in
`src/codenamesduet/todo.md`, not here.

**Status: OPEN** (2026-09-23), roster agreed and stamped.

**Two passes, back to back**: the audit — React, SQL and CSS together — then
the tile-feedback pass against [tile-feedback.md](../tile-feedback.md).

## The roster

Agreed with Joel 2026-09-23 (*"yes."*), `cs-met-codenamesduet` — **58 stamped
files** at the opening:

| where | how many | note |
|---|---|---|
| `src/codenamesduet/` | 43 | Nine arrived `cs-fixed-outcome-fix` (`Board`, `BoardCol`, `GameEventLog`, `PlayArea`, `useBoard`, `useGame`, `turnOutcome`, `pdf/model`, `printCodenamesduetPdf`) — that area ruled its files belong to their own area, which is this one. The rest arrived `cs-unmet` |
| `supabase/migrations/20260615000001_codenamesduet.sql` | 1 | |
| `supabase/sql/codenamesduet.sql` | 1 | |
| `supabase/tests/codenamesduet/` | 12 | all eleven pgTAP files and `setup.psql` |
| `supabase/functions/codenamesduet-suggest-clue/index.ts` | 1 | the AI clue suggester — this game's own code, read here as spellingbee's edge function was |

`src/codenamesduet/logo.svg` and `supabase/functions/codenamesduet-suggest-clue/deno.json`
have nowhere to put a stamp; `todo.md` is markdown and carries none. All three
are roster all the same. `docs/games/codenamesduet.md` is on the roster too,
and is deleted into a new `src/codenamesduet/doc.md` in pass 2, as the earlier
games' docs were.

### What is NOT on it

- **The shared folders it imports** — their contracts are read against this
  game, not re-audited.
- **The five e2e specs** (`codenamesduet`, `-clueform`, `-history`, `-mobile`,
  `-print`) and `e2e/gallery/games/codenamesduet.ts` — `cs-unmet`, off the
  roster as every game's have been.
- **Open at the opening:** whether any pgTAP file pins a shared `common.`
  function rather than this game's own, as spellingbee's `rank_idx_test.sql`
  did. If the reading finds one, it comes off the roster then.

## Findings

*(`F-codenamesduet-1 · slug · title`, one heading each; a status prefix when it
has one, no prefix means OPEN)*

## Notes

*(things worth remembering about this area that are neither a finding nor
owed work — a forward-fix made from another area, a question for the opening,
a dependency listed and left. Anything durable goes to `todo.md` or
`docs/games/codenamesduet.md` instead; a note here never stands in for either)*

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] `docs/games/codenamesduet.md` reconciled with `todo.md`: its Deferred
      section moved into the todo, or deliberately kept as the standing register
- [ ] the tile-feedback pass done, and the game's tf level updated there
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
