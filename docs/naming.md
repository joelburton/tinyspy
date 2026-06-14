# Naming & terminology

The short, conceptual glossary for this repo. Reads in a sitting; serves as the orientation layer before you dive into a specific file.

For code-style and convention details (table naming, RPC patterns, CSS, imports, etc.) see [`code-conventions.md`](code-conventions.md). For the architectural layer (clubs, registry, removability) see [`common.md`](common.md).

## The big idea

> A name describes a **role**, not an **implementation**. If two games each have a thing that plays role X, both are called X, and the game qualifier lives in the folder structure — never in the name.

Game-name prefixes (`BoggleScoreReport`, `tinyspy_words`) are the smell. The folder or schema already carries that information; repeating it in the name is noise.

The practical effect: when you swap from working on tinyspy to working on a hypothetical boggle, the names you reach for don't change. The `Board` is still `Board`, the `useGame` is still `useGame` — just in a different folder.

## Terminology lexicon

The load-bearing words and what they each mean. Internalize these; mixing them up is a source of confusion that surfaces hours later in code review.

### gametype

The *category* of game: `tinyspy`, `psychicnum`, `boggle`. Treated as one word (like `username`), not `game_type` or `gameKind`. In code: `gametype text` columns, `gametype: string` TS fields.

A `gametype` is also the directory name under `src/`, the Postgres schema name, and the second segment of `/g/<gametype>/<gameId>` URLs. The same string runs all the way through.

### game

A *specific playing*. "Ada and Bea's tinyspy match on June 14." Matches everyday English ("good game," "game over"). One row in `<gametype>.games`. Identified by a UUID.

### board

The *static starting state* of a game — the inert configuration that could be saved and replayed. For boggle, that's the dice arrangement. For crosswords, the puzzle grid. For games where the starting state is trivial (psychic-num's "a number from 1–10," tinyspy's "25 random words + a key card"), the board co-locates onto the game row instead of warranting its own table.

The distinguishing test: would two different games on the same setup be a meaningful concept for this gametype? If yes, that setup is a board. If no, the concept is too thin to bother extracting.

### club

A fixed-membership room formed by one creator. The cross-game social primitive: a club might play tinyspy on Monday and a hypothetical boggle on Friday, and the same friendship/conversation persists across both.

Clubs live in `common.clubs`. They span gametypes; gametypes reference clubs (`<schema>.games.club_id → common.clubs.id`), never the reverse.

Solo clubs (handle `=<username>`) are single-member auto-created clubs that anchor solo play and per-user stats. They're structurally separate from regular (multi-member) clubs; the UI hides them from the main clubs list.

See [`common.md`](common.md) for the full club model — invariants, lifecycle, three-state (active/paused/completed) semantics.

### member

A user who's joined a club. In `common.club_members`. Membership is fixed at club creation in v1; no add/remove RPCs.

### persona

A test fixture user with a stable role across the pgTAP suite — `ada`, `bea`, `cade`, `dee`, `eda`. Each has a documented role (in-club player, in-club non-player, outsider) and a UUID that embeds the name (`ada11111-1111-…`) for self-evident error messages. Defined in [`supabase/tests/_shared/setup.psql`](../supabase/tests/_shared/setup.psql). See [`testing.md`](testing.md) for the conventions.

## Removability — the architectural rule that anchors all of this

> Any game must be removable in three actions: delete its folder, delete its line from `src/games.ts`, drop its schema.

If removing a game requires editing anything in `common/`, the shell, or another game, **the boundary has leaked**. Every code-side convention in [`code-conventions.md`](code-conventions.md) — the multi-schema design, the import-direction rules, the games registry, the per-game RLS helpers — exists to preserve this property.

The detail lives in [`common.md → What "common" means here`](common.md#what-common-means-here).

## What's in the rest of `docs/`

| file | what's there |
|---|---|
| [`common.md`](common.md) | The architectural layer: clubs, profiles, registry, routing, removability invariant, the FE shell |
| [`tinyspy.md`](tinyspy.md) | Codenames Duet rules + tinyspy schema, RPCs, FE, Edge Function, tests |
| [`psychicnum.md`](psychicnum.md) | Psychic Num rules + schema, the hidden-target pattern, FE, tests |
| [`testing.md`](testing.md) | Test theory, persona conventions, pgTAP + Vitest patterns |
| [`code-conventions.md`](code-conventions.md) | How we write code: DB conventions, FE conventions, naming rules, known gotchas |
| [`deferred.md`](deferred.md) | Things explicitly deferred from code reviews and conversations |
| [`cheatsheet.md`](cheatsheet.md) | One-screen command + file lookup |
