# Psychic Num

A tiny cooperative number-guessing game. The second registered gametype, added primarily to validate the multi-game architecture with the minimum game-logic surface possible. Read this file before touching anything in `psychicnum/` or `supabase/migrations/*_psychicnum_*.sql`.

For the shared layer see [`common.md`](common.md). For testing theory + persona conventions see [`testing.md`](testing.md). For comparison with the richer-shape gametype see [`tinyspy.md`](tinyspy.md).

## What the game is

The server picks a random number 1–10. Any club member guesses any number at any time — no turns, no seat assignment. First correct guess wins. After 7 wrong guesses (shared across all members), the game is lost.

It's deliberately a toy. The point isn't to be fun; the point is to exercise the multi-game wiring (manifest registry, schema-per-game, per-game RLS, per-game chunk split, common ClubPage + chat reuse) with a game small enough that the architectural patterns dominate the file you're reading.

Psychic Num is also a stand-in for "the second game" until something substantial (Boggle) lands. When that happens, Psychic Num may be removed — and doing so will validate the **removability-in-three-actions** invariant for real: `rm -rf src/psychicnum/`, drop the entry from `src/games.ts`, drop the migration file. If anything else breaks, the architecture leaked.

## The rules

> Spec the RPCs implement against. When the rules disagree with the code, fix this section first.

### Setup

- A single secret number in the range **1–10**, chosen by the server uniformly at random at game-creation time.
- The number is **hidden server-side**. Clients cannot see it during active play even with devtools open — see [The hidden-target mechanic](#the-hidden-target-mechanic) below.
- Players: any club members. No seat assignment, no roles.
- Guess budget: **7 guesses**, shared across all players.

### Gameplay

1. Any club member submits a guess (an integer 1–10) at any time.
2. The server checks: if the guess equals the target, the team wins.
3. If wrong, the shared guess counter decrements by one. The game continues.
4. The same number can be guessed more than once — it's a dumb move, but legal. (Dumb moves in a dumb game.)
5. The game ends when either:
   - **Win:** any guess matches the target. The game's `status` flips to `won`.
   - **Lose:** the 7th wrong guess is submitted. The game's `status` flips to `lost`.

After the game ends, players can call `reveal_target` to learn what the number was — useful primarily on a loss ("the number was 7"), available on a win for symmetry.

### What the game is not

- **Not a turn-based game.** Any club member can guess at any time. The server serializes simultaneous guesses via `SELECT ... FOR UPDATE` on the game row.
- **Not solo-only.** v1 plays with 2+ club members. Solo-club play (a single-member club playing alone) would work mechanically but no UI surface drives it; that's deferred.
- **Not strategic.** There's no skill in the spec — it's "guess a random number." The "fun" parameter is left at zero.

## Schema: `psychicnum.*`

### Tables

| table | purpose |
|---|---|
| `games` | One row per playing. `club_id` (not null) ties to `common.clubs`. Holds `status`, `target` (the secret), `guesses_remaining`, `winner_id`, `setup` (the start-game-dialog choices, jsonb). |
| `guesses` | Append-only log of every guess ever submitted. One row per guess, with `user_id`, `number`, `was_correct`, `guessed_at`. Used both for rendering the history in the UI and as the audit trail for "what happened." |

There is no separate `boards` table. The only datum that fits the "board" concept (the static starting state — see [`tinyspy.md`](tinyspy.md) for the gametype/game/board distinction) is the target number, which is too small to warrant its own table. It co-locates onto the game row.

### Status enum

`games.status text not null check (status in ('active', 'won', 'lost'))`

- **active** — guesses being submitted. The default; no other entry state.
- **won** — a correct guess landed. Terminal.
- **lost** — the last wrong guess (the one that took the budget to 0) landed. Terminal. The "last" varies with the setup dialog's `guesses` choice (3, 5, 7, or 9 — see [Setup](#setup) below).

Simpler than tinyspy's enum (no sudden_death, no multi-axis loss reasons). This is one of the things Psychic Num is testing — that the architecture doesn't accidentally hardcode tinyspy's specific states.

## The hidden-target mechanic

The most architecturally interesting piece of Psychic Num is how it hides `target` from clients.

A naïve "honor system" approach would put `target` in the table and trust the FE not to display it during active play. That would defeat the "backend-authoritative" intent — anyone with browser devtools could read the value out of a query response. Psychic Num actually hides it.

### How it works

The trick is a **column-level grant** that excludes `target` from the SELECT permission given to `authenticated`:

```sql
grant select
  (id, club_id, status, guesses_remaining, winner_id, created_at)
  on psychicnum.games to authenticated;
```

The `authenticated` role can SELECT every column listed there — but not `target`. The RPCs (which run as `postgres` via `security definer`) can still read it freely; only the FE-facing role is blocked.

If a client tries `SELECT target FROM psychicnum.games WHERE id = ?` as `authenticated`, Postgres raises SQLSTATE 42501 ("permission denied for column target"). This is tested in [`tests/psychicnum/create_game_test.sql`](../supabase/tests/psychicnum/create_game_test.sql).

### How players see the target after the game ends

A dedicated RPC: `psychicnum.reveal_target(target_game uuid) returns int`. It checks that:

1. Caller is authenticated.
2. Caller is a member of the game's club.
3. The game's status is not `active` (i.e., it's already terminal).

Then returns the target. The terminal-only gate is the load-bearing constraint — without it, a curious client could call `reveal_target` mid-game and cheat. With it, the secret is genuinely server-side until the game ends.

### Why this matters as a pattern

Psychic Num is the first place we have a true server-only secret. The column-level grant pattern is reusable for any future game that needs hidden per-game state — Boggle's secret board generation, a memory-game's pairing layout, etc. The recipe is:

1. Put the secret column on the table where it naturally lives.
2. Grant SELECT to `authenticated` on the safe columns explicitly, omitting the secret.
3. Provide a security-definer RPC for revealing the secret, gated on whatever condition makes revealing it okay.

Tinyspy doesn't use this pattern because tinyspy has no true secrets — both players' key cards are equally available via RLS, and the per-player filtering is by convention rather than enforcement (see [`tinyspy.md`'s note on game_players_select](tinyspy.md#row-level-security)).

## RPCs

All `security definer`, granted only to `authenticated`, search_path pinned to `psychicnum, common, public, extensions`.

### `psychicnum.create_game(target_club uuid, setup jsonb) → table(id uuid)`

Caller must be a club member. Validates the setup shape, picks a random target 1–10, inserts the game row in `active` with `guesses_remaining` initialized from `setup.guesses`, upserts `common.club_active_game` pointing at it.

**No minimum-club-size check.** The game logic plays fine with any membership count — 1 (solo club, deferred), 2, 5, whatever. The current FE doesn't surface solo-club play, but the RPC doesn't reject it.

Reject reasons: not authenticated; not a member; `setup.guesses` not in {3, 5, 7, 9}; `setup.guesses` missing.

### `psychicnum.submit_guess(target_game uuid, guess int) → text`

The only mid-game action. Returns one of:

- `'correct'` — caller won the game; status flipped to `won`.
- `'wrong'` — game continues with `guesses_remaining - 1`.
- `'lost'` — caller's wrong guess took the budget to zero; status flipped to `lost`.

Locks the game row with `SELECT ... FOR UPDATE` to serialize concurrent guesses. With "first correct guess wins" semantics, if two players guess the target at the same instant, whichever transaction commits first is the winner; the second sees `status != 'active'` and raises `'game is not active'`.

Records every guess in `psychicnum.guesses` with `was_correct` set. Duplicate guesses (someone guessed 7 already, you guess 7 too) are allowed and decrement the counter normally.

Reject reasons:

- not authenticated
- guess out of range (must be 1–10)
- game not found
- not a club member
- game status ≠ active

### `psychicnum.reveal_target(target_game uuid) → int`

Returns the target. Gated on status being non-active. See [The hidden-target mechanic](#the-hidden-target-mechanic) above.

Reject reasons: not authenticated; not a club member; game still active.

### Trigger

`psychicnum.clear_active_on_termination()` — fires on `psychicnum.games.status` UPDATE. When status flips from `active` to `won` or `lost`, deletes the matching `common.club_active_game` row. Same pattern as [tinyspy's equivalent](tinyspy.md#helpers-not-callable-from-the-client).

## Setup

The start-game dialog collects one option from the players before `create_game` fires:

- **`guesses`**: total guess budget shared across all club members, one of `{3, 5, 7, 9}`. 7 is the default (parity with the previous hardcoded value); 3 is the hard mode; 5 medium; 9 the easy warm-up.

Shape stored on `psychicnum.games.setup` (jsonb): `{ "guesses": 3 | 5 | 7 | 9 }`. The mutable `guesses_remaining` counter is initialized from `setup.guesses` at create-game time; the column persists the original choice so end-of-game review can display "this game was played with 5 guesses" without trying to infer it from a counter that's already been decremented to 0.

The FE side: `src/psychicnum/lib/setup.ts` (the `PsychicnumSetup` type) and `src/psychicnum/components/Setup.tsx` (the form body, lazy-loaded inside the common `SetupGameDialog`). The server is the canonical authority for what shapes are accepted — the TypeScript narrowing is advisory.

## Row-level security

Both tables (`games`, `guesses`) have RLS enabled, with SELECT policies gated by `common.is_club_member(club_id)`. Note that this game uses `common.is_club_member` directly rather than defining its own `psychicnum.is_player_in_game` — there's no seat structure to query, just club membership.

`guesses_select` inherits visibility from the parent game via an EXISTS subquery to `psychicnum.games`:

```sql
create policy guesses_select on psychicnum.guesses
  for select to authenticated
  using (
    exists (
      select 1 from psychicnum.games g
       where g.id = guesses.game_id
         and common.is_club_member(g.club_id)
    )
  );
```

No INSERT / UPDATE / DELETE policies. All writes go through the RPCs.

Realtime publication includes both `psychicnum.games` and `psychicnum.guesses` so the FE can subscribe to status flips and new-guess appends.

## Frontend

### Folder layout

```
src/psychicnum/
  Root.tsx                Mounted by App.tsx for /g/psychicnum/<id>.
  manifest.ts             GameManifest registration.
  db.ts                   export const db = supabase.schema('psychicnum')

  components/
    BoardScreen.tsx       The one and only screen — input, submit, history, result, chat panel.

  hooks/
    useGame.ts            Loads the game + guesses + club members, subscribes to realtime.
```

That's it. No theme.css, no *.module.css, no per-component styling — the game leans entirely on the global utility classes from [`common/theme.css`](../src/common/theme.css). The visual minimalism is deliberate; the gametype is here to test the wiring, not to be a polished UI.

### `BoardScreen`

A single card with four sections:

1. **Header**: title, back-to-home link.
2. **Active state**: "X guesses left" prompt, a number input, a Submit button. Disabled while submitting.
3. **Terminal state**: a result banner with "We won! [winner] guessed it." or "We lost. The number was X." The user navigates back to the club to start another game via the standard "Start" flow.
4. **Guess history**: every guess with username, value, and correct/nope.
5. **Chat**: the shared `ClubChatPanel` (same component every game uses).

When the game ends, the screen lazily fetches the target via `reveal_target` and caches it in local state for the banner.

### `useGame`

Fetches game row + guesses + club members in parallel, subscribes to realtime on `psychicnum.{games, guesses}`. On any change, refetches the bundle. Follows the same patterns as tinyspy's hooks (per-effect unique channel name, refetch on `SUBSCRIBED`, separate fetches for cross-schema profile data).

The `members` array is what `ClubChatPanel` needs for message attribution, and also what `BoardScreen` uses to render "[ada] guessed 7" attribution in the guess history.

### Code-splitting

Same pattern as tinyspy — `Root` is lazy-loaded in the manifest. The build emits psychicnum's JS as its own chunk (~4 KB gzipped); users who only play tinyspy never download it.

## Psychic-num testing

See [`testing.md`](testing.md) for theory and shared setup. Psychic-num-specific notes:

### pgTAP files

| file | covers |
|---|---|
| `tests/psychicnum/create_game_test.sql` | Auth, membership, happy path, auto-pause via `club_active_game` upsert, column-level grant blocks SELECT of `target`. |
| `tests/psychicnum/gameplay_test.sql` | Range guards, correct guess flips to `won`, wrong guess decrements, duplicate guesses allowed, 7th wrong loses, trigger clears `club_active_game` on termination. |
| `tests/psychicnum/rls_test.sql` | dee (non-member) sees zero rows from both tables, mutating RPCs throw, `reveal_target` rejects while active, returns the target after game end for any member. |

### Pinning the target in tests

The target is randomized at game creation, but tests need deterministic outcomes ("guess 7 → correct"). The pattern is:

```sql
select pg_temp.as_user(...);
create temp table g on commit drop as
select * from psychicnum.create_game((select id from club));

-- Pin the target as postgres (RPC runs randomly; we override directly)
reset role;
update psychicnum.games set target = 7 where id = (select id from g);

-- Now play through the scenario...
select pg_temp.as_user(...);
select psychicnum.submit_guess((select id from g), 7);  -- correct!
```

The `reset role` step is the noteworthy bit — clients can't write to `psychicnum.games` (no INSERT/UPDATE/DELETE grant on `authenticated`), so the test needs to drop back to `postgres` to do the override. This is only legal in tests; in production the RPC has the only path to write.

## Open items / known scope-creep

### `winner_id` is overspec'd

The schema has `psychicnum.games.winner_id` and the FE shows "alice guessed it" attribution. **This wasn't in the original spec** — the spec was "if any player guesses, the team wins," with no individual attribution. The `winner_id` got added unilaterally during implementation, importing a pattern from tinyspy (which tracks lots of who-did-what for its turn-based logic).

This is harmless but contrary to the cooperative-team framing. The cleanup, when someone wants to do it:

| where | what to remove |
|---|---|
| `psychicnum_baseline.sql` | `winner_id` column on `psychicnum.games`; the `update ... set winner_id = caller_id` line in `submit_guess` |
| `src/psychicnum/hooks/useGame.ts` | `winner_id` field on `PsychicnumGame` and from the SELECT list |
| `src/psychicnum/components/BoardScreen.tsx` | the "[winner] guessed it" rendering on the win banner |
| `src/psychicnum/manifest.ts` | the winner-name batch lookup in `fetchClubGames`; status label becomes just `"won"` |
| `tests/psychicnum/gameplay_test.sql` | the `winner_id` assertion |

~30 lines of removal across 5 files. Not done yet because there's no functional pressure.

### Other gaps

- **No solo-mode UI** even though the RPCs allow any club size. Tied to the broader question of how solo-clubs surface in the UI; see [`common.md`'s solo-clubs section](common.md#solo-clubs).
- **No anti-spam.** Friends-only audience; not a concern. The 7-guess cap caps damage anyway.

## File locations

| asking… | look at… |
|---|---|
| What does an RPC do | [`supabase/migrations/20260612000002_psychicnum_baseline.sql`](../supabase/migrations/20260612000002_psychicnum_baseline.sql) |
| What does the UI look like | [`src/psychicnum/components/BoardScreen.tsx`](../src/psychicnum/components/BoardScreen.tsx) |
| How does state flow on the FE | [`src/psychicnum/hooks/useGame.ts`](../src/psychicnum/hooks/useGame.ts) |
| Is the target really hidden? | column-level grant in the migration + the SELECT test in [`tests/psychicnum/create_game_test.sql`](../supabase/tests/psychicnum/create_game_test.sql) |
