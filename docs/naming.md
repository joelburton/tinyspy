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

### puzzle

A *prewritten, replayable game source* — distinct from `board` (the per-game-instance copy of the puzzle's content, with any per-game state like a shuffled tileOrder). A puzzle exists ahead of time; players pick it from a list (today: a date picker; eventually a calendar) and `create_game` copies it into a fresh `board`.

The split lets the source stay pristine across multiple plays (a club can replay yesterday's puzzle without contaminating it) and gives us a place to attach puzzle-source metadata (NYT puzzle number + date for wordknit; future Sunday-NYT-crossword constructor names).

Two kinds of gametype shake out from this:

- **Generated-board games** (tinyspy, psychic-num): each game gets a fresh board synthesized by `create_game` from random draws of a word pool / random number. No puzzles, no `<game>.puzzles` table. The setup form has no puzzle picker.
- **Puzzle-based games** (wordknit, future crosswords): puzzles exist as prewritten rows in `<game>.puzzles`, imported from external archives. `create_game` accepts a `puzzleId` and copies the chosen puzzle's content into the new board. The setup form has a picker.

Per-gametype `puzzles` tables stay narrow (different shapes for Connections vs. crosswords) rather than collapsing into a common `puzzle` table with a generic `content jsonb`. Cross-cutting "which puzzles a club has played" lives on the per-game `<game>.games.puzzle_id` FK; a future per-club replay-tracking layer would join across those rather than centralize the storage.

### club

A fixed-membership room formed by one creator. The cross-game social primitive: a club might play tinyspy on Monday and a hypothetical boggle on Friday, and the same friendship/conversation persists across both.

Clubs live in `common.clubs`. They span gametypes; gametypes reference clubs (`<schema>.games.club_id → common.clubs.id`), never the reverse.

Solo clubs (handle `=<username>`) are single-member auto-created clubs that anchor solo play and per-user stats. They're structurally separate from regular (multi-member) clubs; the UI hides them from the main clubs list.

See [`common.md`](common.md) for the full club model — invariants, lifecycle, three-state (active/paused/completed) semantics.

### member

A user who's joined a club. In `common.clubs_members`. Membership is fixed at club creation in v1; no add/remove RPCs.

**Bare `member` is reserved for the club-member case** — that's the dominant referent in this codebase and stealing it would cost every reader a moment of disambiguation. If we ever introduce a "member" concept for some other domain object (a permission group, a household, a mailing list, …), it must carry a differentiating prefix: `permissionGroupMember`, `householdMember`. Bare `member` stays the club member.

**`member` vs `user` as a context signal.** Once you've decided to talk about a person, the choice between the two words is itself meaningful:

- `member` reads as "of the club / game / clearly-implied group we're currently discussing." "Any member can start a game" is unambiguous — *which* members? The current club's. The scope rides along with the word.
- `user` reads as "of the site." Saying "any user can start a game" is actively weaker and confusing — it raises the question *which* users, in a way `member` doesn't.

The practical effect: most game-side code shouldn't reach for `user` at all, because games happen inside clubs and the relevant person is always a member of that club. `user` is right when the context genuinely is "a person who isn't tied to a specific club we're discussing" — e.g., the club-creation flow's "list of users we might pick to add to a new club," or the auth-side `auth.users` references. When in doubt: if a club is implied by the surrounding code, write `member`.

For the database row specifically (regardless of context), `profile` is the name — that's the `common.profiles` row.

### persona

A test fixture user with a stable role across the pgTAP suite — `ada`, `bea`, `cade`, `dee`, `eda`. Each has a documented role (in-club player, in-club non-player, outsider) and a UUID that embeds the name (`ada11111-1111-…`) for self-evident error messages. Defined in [`supabase/tests/_shared/setup.psql`](../supabase/tests/_shared/setup.psql). See [`testing.md`](testing.md) for the conventions.

## Per-game vocabulary

The cross-cutting terms above apply everywhere. Each game also has a small internal lexicon worth pinning so future contributors (and future-you) stay consistent. Today only wordknit has terms that warrant a glossary entry beyond the cross-cutting words; tinyspy and psychic-num use the cross-cutting lexicon plus their domain-obvious words (`clue`, `target`).

### wordknit

| term | meaning |
|---|---|
| **category** | One of the 4 hidden groupings of 4 tiles. Named `category` rather than `group` to avoid colliding with the many other "group" meanings (club groups, user groups, permission groups) — see the watch list below. |
| **rank** | The difficulty index 0..3 of a category — yellow / green / blue / purple in NYT's palette. Named `rank` rather than `level` because `level` overloads with puzzle-difficulty levels, app-routing levels, and other meanings the codebase shouldn't pre-commit. |
| **tile** | One of the 16 selectable words on the board. `tile` generalizes the scrabble-tile / boggle-die vocabulary to "any selectable thing on a board." Future word-grid games (boggle, crosswords) should reuse the same word. |
| **matched** | The verb (and resolution state) for a category once a correct guess identifies it. Unifies with the `matched_category_rank` column on `wordknit.guesses` so the FE-state name (`matchedCategories`) and the column root (`matched_…`) read as one vocabulary. |
| **mistake_count** | The integer counter of wrong + oneAway submissions for a game. Explicit `_count` suffix because a list of the actual mistakes (the `guesses` rows with `result <> 'correct'`) is the FE's natural projection — see the count-vs-list rule below. |

## Removability — the architectural rule that anchors all of this

> Any game must be removable in three actions: delete its folder, delete its line from `src/games.ts`, drop its schema.

If removing a game requires editing anything in `common/`, the shell, or another game, **the boundary has leaked**. Every code-side convention in [`code-conventions.md`](code-conventions.md) — the multi-schema design, the import-direction rules, the games registry, the per-game RLS helpers — exists to preserve this property.

The detail lives in [`common.md → What "common" means here`](common.md#what-common-means-here).

## Naming principles

These are the rules-of-thumb behind the choices above. They apply to SQL column / table / function names, TS types / fields / exports, and CSS tokens — anywhere a name will be read outside its immediate point of definition.

### Be specific at long visibility; generic is OK only when scope is obvious

Avoid general terms — `group`, `set`, `data`, `item`, `entry`, `record`, `list`, `value`, `content`, `state` (as a noun for "the data") — for anything that travels far from its definition: column names, top-level TS types, hook return keys, module exports.

Generic locals inside a small function are fine. A 5-line PL/pgSQL function with a `group_obj jsonb` variable reads correctly because you can see the whole function at once. The rule is about visibility scope — the bigger the visibility, the more specific the name needs to be.

Watch list of generic words to push back on in wide-visibility names is at the bottom of this file.

### Bare `member` = club member; prefix everything else

See the lexicon entry. If you need "member" for a non-club concept, it gets a differentiating prefix (`permissionGroupMember`, etc.) — the bare form stays reserved.

### Plural ≠ count. If a count could share its name with a list, add `_count`.

`wordknit.games.mistake_count` is named that way (not `mistakes`) because:

1. It's a number, not a list. A plural-looking name reads as a list.
2. A list of the actual mistakes will eventually live somewhere on the FE (the `guesses` rows with `result <> 'correct'`). Calling the column `mistakes` would collide with that list.

Apply this preemptively: when adding a count column, ask "could a list-of-these also exist later?" If yes — and that's usually yes for anything countable — use `_count` / `Count` now. The cost of being explicit upfront is small; the cost of renaming later is real.

Doesn't apply to scalars that have no plausible list shape — `score`, `total_seconds_paused`, `version`. The rule is about *count*-vs-*list*-collision, not "every number ends in `_count`."

### A name with multiple plausible meanings is usually wrong

If you reach for `group` or `set` or `level` and find yourself thinking "well, it could mean…" — that's the signal to pick a more specific word. `member` is the pragmatic exception, and its carve-out (prefix when not a club member) is precisely what controls the ambiguity.

### Consistency across gametypes for the same concept is non-negotiable

When two games have a concept that *is the same thing*, they MUST use the same name. The common types and hooks force this for everything they touch (`SetupMember`, `useGameTimer`, `PauseBoundary`); the discipline lives at the boundary where a new game starts to introduce its own surface.

When a third game adopts a term that's standard in two others, that term graduates to the "cross-game canonical names" list below. That's also the moment to verify the pre-existing two are already using it the same way (often the catalyst for a small rename).

### Qualify when the name will be read in isolation; stay bare when the scope owner is right there

Inside `board.categories[].rank`, bare `rank` is unambiguous — the surrounding object IS a category. As a column on `wordknit.guesses`, the same idea needs `matched_category_rank` because at the column level the name is read globally (PostgREST, generated TS types, the FE's `Database` type) with no surrounding context.

The principle: the wider the visibility, the more the name has to carry its own scope.

## Cross-game canonical names

Names that recur across gametypes and MUST be identical when the underlying concept is the same. A future game that names one of these differently is wrong.

| name | what it is |
|---|---|
| `gametype` | The category-of-game string (`tinyspy` / `psychicnum` / `wordknit`). Column on `common.games` + `common.gametypes`; folder under `src/`; Postgres schema name; second URL segment. The same string runs all the way through. |
| `play_state` | The `text` column on `common.games` carrying each gametype's mid-game/terminal enum. Values differ per gametype (wordknit: `playing` / `solved` / `lost`; tinyspy: `playing` / `sudden_death` / `won` / `lost_assassin` / `lost_clock` / `lost_timeout`; psychic-num: `playing` / `won` / `lost`); the column NAME is always `play_state`. **No gametype uses `'active'` as a value** — "active" overloads view-state and play-state, so reusing it would relitigate the confusion the vocabulary exists to prevent. Companion column `is_terminal boolean` is materialized in the same RPCs that write `play_state`. See [`states.md`](states.md). |
| `is_current_view` | The boolean column on `common.games` carrying the **one current-view game per club** invariant (partial unique index on `(club_id) where is_current_view = true`). See [`states.md`](states.md) for view-state vs play-state. |
| `created_at` | The `timestamptz` column on every game-row table (and most child tables — guesses, words, etc.). |
| `club_id` | The FK to `common.clubs(id)` on every `<gametype>.games` table. |
| `target_game` | The conventional name for the game-UUID parameter on every gametype's mutating RPCs (`submit_guess(target_game uuid, …)`). `target_<noun>` is the broader pattern for RPC params pointing at row IDs. |
| `submit_guess` | The mid-game-action RPC on a gametype that records a player's guess. The guess *shape* differs (a clue + count for tinyspy, a number for psychic-num, a 4-tile set + verdict for wordknit), but the RPC name is the same. |
| `<table>_select` | The SELECT RLS policy naming pattern — `games_select`, `guesses_select`. Other policy directions follow the same pattern (`<table>_insert` etc.) if/when we ever add them. |
| `SetupMember` | The TS type for a club member in a setup-flow context. From `src/common/lib/games.ts`. |
| `useGameTimer`, `PauseBoundary`, `PauseOverlay`, `computePause`, `ClubChatPanel` | Common hooks / components / helpers. Every game that uses one consumes it under this exact import — there is no per-game variant. |

## Watch list of generic words

These show up as smells when they leak into wide-visibility names (columns, top-level types, hook return keys, exports). Each has at least one preferred specific alternative in this codebase. If you see one here in a wide-visibility name, raise it.

| generic | preferred specifics |
|---|---|
| `group` / `groups` | `category` (wordknit), `club` (the social primitive), or a more specific domain noun |
| `set` | the named collection (`tiles`, `guesses`, `categories`) |
| `member` | bare is reserved for club member; for any other domain, prefix (`<thing>Member`) |
| `level` | `rank` (wordknit), `tier`, or a fully-qualified `<domain>_level` if it really is a level |
| `data` / `info` / `content` | the actual subject (`board`, `setup`, `guesses`) |
| `state` (as a noun for "the data") | the specific state-machine value if it's an enum; the concrete field if it's a payload |
| `item` / `entry` / `record` / `row` | the singular form of the actual collection (`guess`, `tile`, `category`) |
| `list` | the named collection |
| `value` | the actual semantic (`score`, `rank`, `count`) |
| `thing` / `stuff` / `obj` | never (in wide visibility); fine as a 3-line-function local |

## What's in the rest of `docs/`

| file | what's there |
|---|---|
| [`common.md`](common.md) | The architectural layer: clubs, profiles, registry, routing, removability invariant, the FE shell |
| [`states.md`](states.md) | The view-state / play-state vocabulary and how the suspend / current / pause concepts compose |
| [`tinyspy.md`](tinyspy.md) | Codenames Duet rules + tinyspy schema, RPCs, FE, Edge Function, tests |
| [`psychicnum.md`](psychicnum.md) | Psychic Num rules + schema, the hidden-target pattern, FE, tests |
| [`wordknit.md`](wordknit.md) | Wordknit (Connections-style) rules + schema, the FE-knows decision, the pause + timer patterns |
| [`testing.md`](testing.md) | Test theory, persona conventions, pgTAP + Vitest patterns |
| [`code-conventions.md`](code-conventions.md) | How we write code: DB conventions, FE conventions, naming rules, known gotchas |
| [`deferred.md`](deferred.md) | Things explicitly deferred from code reviews and conversations |
| [`cheatsheet.md`](cheatsheet.md) | One-screen command + file lookup |
