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

**Nothing here is urgent.** The sweep found one small constraint (shipped
2026-08-03 — the club-name cap, which also closed a live 23514 on long names)
plus a set of decisions that would need SQL *only if reversed*, and a few items
whose DB half is data rather than schema.

| # | item | owner doc | the DB change |
|---|---|---|---|
| 1 | wordiply's four unconfirmed rules | [wordiply.md → Open decisions](games/wordiply.md#10-open-decisions) | `_finish_compete`'s comparator / the word-band filter — **only if a decision flips** |
| 2 | bananagrams + boggle "check board" helper | [bananagrams.md](games/bananagrams.md) · [boggle.md → Deferred](games/boggle.md#11-deferred) | a new RPC per game (the stackdown `reveal_next_word` shape) |
| 3 | Per-user theme setting | [ui.md → User-selectable themes](ui.md#user-selectable-themes-deferred) | a `common.profiles` column — explicitly YAGNI'd |
| 4 | crosswords dictionary-puzzle bulk import | [crosswords.md → §9](games/crosswords.md#9-deferred) | data, not schema — but it's the trigger for the picker bound |
| 5 | boggle word-list freshness via Storage | [boggle.md → Deferred](games/boggle.md#11-deferred) | Supabase Storage + the edge fn; no SQL |

---

## 1. wordiply's four unconfirmed rules

`§10 Open decisions` lists ten forks; six are marked resolved and four still say
*"confirm"*. They're all **implemented** — the game ships the recommended
default — so this is a ratify-or-change list, not unbuilt work. Three of the four
live in SQL:

- **#3 letter-count tiebreak direction** (higher wins) and **#4 unresolved-tie
  result** (co-winners) are steps 2 and 4 of `wordiply._finish_compete`'s
  lexicographic comparator. Changing either is a migration — *and* an FE change:
  `lib/scoring.ts`'s `compareCompetitors` MUST match the SQL order, which the
  function's own comment calls out.
- **#7 legal-band cleanliness** (exclude slang/slur/crude, stricter than
  `candidate_words`) is a filter in the board builder + import, so a change means
  regenerating boards rather than altering schema.
- **#6 guess count fixed at 5** is a constant; exposing it as a setup option
  would touch `create_game`'s validator and the setup form.

The cheap resolution is to confirm all four and mark them resolved like the other
six, at which point this entry disappears.

## 2. A "check board" helper for bananagrams + boggle

Both docs record the same planned feature, and bananagrams has already *paid*
for it: its setup form shows the two `DifficultyField` word-band pickers
**regardless of mode**, explicitly so a future opt-in "check board" helper has
bands to check against. So the setup surface exists and the DB side doesn't.

Shape, if it lands: an RPC per game in the stackdown mould (`reveal_next_word` /
`reveal_next_hint` — a server-side cheat that reads the game's own words and
logs the request), gated like a move. boggle's would sit beside `submit_word`;
bananagrams' would validate the caller's placed board.

Worth deciding *whether* first — this is a hint mechanic, not a fix.

## 3. A per-user theme setting

`ui.md` names the shape while telling you not to build it: dark/light/pink as a
user setting needs a switching mechanism, a UI, and *"a per-user setting in
`common.profiles`"* — the DB half. It's listed here only so the column is on the
radar if the theme work ever starts; the doc's instruction stands, and it's the
right one. **Don't pre-engineer.**

## 4. crosswords' dictionary-puzzle bulk import

Not schema — the import writes rows into the existing `crosswords.puzzles`. It's
here because it's the **trigger** for a bound that's deliberately unfixed:
`SetupForm.tsx`'s `source = 'library'` query is an unbounded `select` that will
sail past PostgREST's `max_rows` once the library grows past ~1000. The doc's
call is to do the bound *with* the import (>10k puzzles needs a real picker with
search, not a `.limit()` on a flat list), so the two ship together or neither
does.

`fetch-nyt-range` (the bulk NYT CLI) is the same category — a script blocked on
the `NYT_COOKIE_JAR` secret, writing data, touching no schema.

## 5. boggle word-list freshness via Storage

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
