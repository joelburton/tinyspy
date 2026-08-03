# Database work queue

The deferred items that need a **migration** — a new table, column, view, grant, RLS
policy, or RPC body. They're gathered here because they're cheapest to do *now*: the
alpha prior in [`CLAUDE.md`](../CLAUDE.md) says edit the baselines and let `db:reset`
wipe everything, and that stops being true when we leave alpha
([`deferred.md → To discuss`](deferred.md#to-discuss)).

**This file is a queue, not a register.** Each entry is a pointer plus the concrete
shape of the migration; the *rationale* stays in [`deferred.md`](deferred.md) or the
game's own doc, so nothing is duplicated and nothing rots. When an item ships, delete
its entry here **and** its entry there. When the queue empties, delete this file.

Sorted by payoff, not by size.

| # | item | where the full entry lives | the DB change |
|---|---|---|---|
| 1 | Setup-shape evolution policy for `default_setup` | [deferred.md → Common / architecture](deferred.md#common--architecture) | nothing yet — it ships *with* the change that triggers it |
| 2 | pgTAP coverage gaps around the replay RPCs | [deferred.md → Tooling](deferred.md#tooling) | test files only; no schema change |

**There are no migrations left in this queue** — #1 has nothing to build until
something triggers it and #2 is test files. Both still have their full entries in
`deferred.md`, so this file can be deleted the moment #2 is picked up (or sooner,
if the pointer stops earning its keep).

*wordwheel's ≥ 15 quality gate was on this list until 2026-08-03, when it was
settled as-is rather than tuned — it's recorded at its definition in
[wordwheel.md](games/wordwheel.md), not as a deferral.*

*Boggle's dupes-cancel scoring was item #1 here until 2026-08-03; it moved to
[deferred.md → Far future](deferred.md#far-future) because the open question is
whether we want the rule at all, not how to build it.*

*Hide-the-solution-on-loss was also item #1. It shipped 2026-08-03 — first as a
frontend-only gate, then (same day) promoted to the common
`common.games.solution_revealed` column + `common.reveal_solution` RPC, which is the
migration this queue exists for: it makes the reveal shared, reload-durable, and
self-clearing on replay. See [common.md → Revealing the
solution](common.md#revealing-the-solution).*

---

## 1. Setup-shape evolution policy for `clubs_gametypes.default_setup`

**Nothing to build.** Listed here so it isn't forgotten at the moment it matters: the
policy only bites when a setup field is renamed, retyped, or dropped, and option (b) in
the deferred entry is literally "the migration that ships the shape change also clears
the incompatible `default_setup` rows."

The one thing to carry forward past the alpha freeze: **wholesale-renaming a setup
field is the breakage case** — the dialog shows defaults for the new field and silently
drops the stale one on next save. Cheap to absorb while resets wipe everything; not
after.

## 2. pgTAP coverage gaps around the replay RPCs

Test files, not schema — but editing SQL means a `db:reset` round, so it belongs in the
same sitting. Two thin spots, neither a bug:

- **mid-game restart** (as opposed to at-terminal) is asserted only implicitly, and only
  in scrabble;
- a coop **`target_rank` carried through a restart** is untested in spellingbee /
  wordwheel (`coop_target_test` never restarts, `restart_test` never sets a coop
  target), as is an explicit `"target_rank": null` in coop.

Worth tightening next time those files are open.
