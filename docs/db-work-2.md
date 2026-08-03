# Database work queue (second sweep)

The first queue (`db-work.md`, 2026-08-02 → 08-03) collected DB-touching items
from [`deferred.md`](deferred.md) only. This one is the **whole-docs sweep**:
every `## Deferred`, `## Open decisions`, `### Open questions` and `## TODO`
across `docs/` and `docs/games/`, filtered to what would touch a migration.

Same contract as before. **This is a queue, not a register** — each entry points
at the doc that owns the rationale, and adds only the shape of the DB change.
When an item ships, delete it here *and* resolve it there. When the queue
empties, delete this file.

The reason to care about the list at all is the alpha prior in
[`CLAUDE.md`](../CLAUDE.md): baselines are still editable and `db:reset` wipes
everything, so schema work is free right now and stops being free when we leave
alpha ([`deferred.md → To discuss`](deferred.md#to-discuss)).

**Nothing here is urgent, and nothing here is decided-and-unbuilt.** The sweep
turned up one real constraint (the club-name cap — shipped 2026-08-03, and it
closed a live 23514 on long names), one set of unratified rules (wordiply's —
ratified the same day, no code change), and one column worth reserving ahead of
its feature (`common.profiles.theme`, also shipped). What's left is a feature
nobody has committed to and two items whose DB half is data rather than schema.

| # | item | owner doc | the DB change |
|---|---|---|---|
| 1 | bananagrams + boggle "check board" helper | [bananagrams.md](games/bananagrams.md) · [boggle.md → Deferred](games/boggle.md#11-deferred) | a new RPC per game (the stackdown `reveal_next_word` shape) |
| 2 | crosswords dictionary-puzzle bulk import | [crosswords.md → §9](games/crosswords.md#9-deferred) | data, not schema — but it's the trigger for the picker bound |
| 3 | boggle word-list freshness via Storage | [boggle.md → Deferred](games/boggle.md#11-deferred) | Supabase Storage + the edge fn; no SQL |

---

## 1. A "check board" helper for bananagrams + boggle

Both docs record the same planned feature, and bananagrams has already *paid*
for it: its setup form shows the two `DifficultyField` word-band pickers
**regardless of mode**, explicitly so a future opt-in "check board" helper has
bands to check against. So the setup surface exists and the DB side doesn't.

Shape, if it lands: an RPC per game in the stackdown mould (`reveal_next_word` /
`reveal_next_hint` — a server-side cheat that reads the game's own words and
logs the request), gated like a move. boggle's would sit beside `submit_word`;
bananagrams' would validate the caller's placed board.

Worth deciding *whether* first — this is a hint mechanic, not a fix.

## 2. crosswords' dictionary-puzzle bulk import

Not schema — the import writes rows into the existing `crosswords.puzzles`. It's
here because it's the **trigger** for a bound that's deliberately unfixed:
`SetupForm.tsx`'s `source = 'library'` query is an unbounded `select` that will
sail past PostgREST's `max_rows` once the library grows past ~1000. The doc's
call is to do the bound *with* the import (>10k puzzles needs a real picker with
search, not a `.limit()` on a flat list), so the two ship together or neither
does.

`fetch-nyt-range` (the bulk NYT CLI) is the same category — a script blocked on
the `NYT_COOKIE_JAR` secret, writing data, touching no schema.

## 3. boggle word-list freshness via Storage

Also not SQL: the bundled word list is frozen at deploy, and the proposed middle
ground is a gzipped list in a **Supabase Storage** bucket fetched at edge-fn cold
start. It's in this file because "Supabase change that isn't the FE" is what
someone scanning this list is looking for — but it needs no migration, and the
doc's measurements say the bundled list is fine while `common.words` is stable.

---

## Swept and NOT here

Recorded so the next sweep doesn't re-derive it. Everything below is a real
open item in its own doc, and none of it touches the database:

- **bananagrams** — the peel pill firing for a peer's peel (FE copy).
- **connections** — per-tile rise-and-fade match animations (CSS).
- **wordwheel / spellingbee** — the `Letters`/`Wheel` CSS fold (CSS, and
  deliberately not done).
- **crosswords** — first-visit help auto-open, ⌥M, NYT dedup, the scratchpad
  lock races (all FE/Broadcast; the doc notes the races *"can't corrupt the
  DB"*), and the clue-list greys + revealed-grid-still-wins standing flags,
  which are ratified decisions rather than work.
- **mobile.md** — the feedback-copy length audit, the two open breakpoint
  questions, and the two owed on-device checks.
- **ui.md** — the `.board`/`.grid` promotion, responsive layouts, animations, a
  literal palette layer, font-size tokens, per-game UI testing.
- **deferred.md → Common / architecture** — the view-state RPC error surface and
  the stricter `useSession` startup verify (both FE).
- **stackdown** — live board generation via a constructive repair loop, which
  the doc argues against on complexity grounds; treat as won't-do.
