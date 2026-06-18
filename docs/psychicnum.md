# Psychic Num

A tiny cooperative number-guessing game. The second registered gametype, added primarily to validate the multi-game architecture with the minimum game-logic surface possible. Read this file before touching anything in `psychicnum/` or `supabase/migrations/*_psychicnum_*.sql`.

For the shared layer see [`common.md`](common.md). For testing theory + persona conventions see [`testing.md`](testing.md). For comparison with the richer-shape gametype see [`tinyspy.md`](tinyspy.md).

## What the game is

The server picks a random number 1–10. Any club member guesses any number at any time — no turns, no seat assignment. First correct guess wins. After 7 wrong guesses (shared across all members), the game is lost.

It's deliberately a toy. The point isn't to be fun; the point is to exercise the multi-game wiring (manifest registry, schema-per-game, per-game RLS, per-game chunk split, common ClubPage + chat reuse) with a game small enough that the architectural patterns dominate the file you're reading.

Psychic Num is a stand-in until enough "real" games are live. **Slated for removal after beta** — once the roster has filled in (Boggle, crosswords, etc.), the toy stops earning its keep. The removal will validate the **removability-in-three-actions** invariant for real: `rm -rf src/psychicnum/`, drop the entry from `src/games.ts`, drop the migration file. If anything else breaks, the architecture leaked.

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

After the game ends, the target becomes readable to club members via the `psychicnum.games_state` view — useful primarily on a loss ("the number was 7"), available on a win for symmetry. See [The hidden-target mechanic](#the-hidden-target-mechanic) below.

### What the game is not

- **Not a turn-based game.** Any club member can guess at any time. The server serializes simultaneous guesses via `SELECT ... FOR UPDATE` on the game row.
- **Not solo-only.** v1 plays with 2+ club members. Solo-club play (a single-member club playing alone) would work mechanically but no UI surface drives it; that's deferred.
- **Not strategic.** There's no skill in the spec — it's "guess a random number." The "fun" parameter is left at zero.

## Schema: `psychicnum.*`

### Tables

| table | purpose |
|---|---|
| `games` | One row per playing. `club_id` (not null) ties to `common.clubs`. Holds `target` (the secret), `guesses_remaining`, `winner_id`. Play-state (`play_state` + `is_terminal`) and the setup blob both live on `common.games` — the per-gametype row carries only gametype-specific mechanics. |
| `guesses` | Append-only log of every guess ever submitted. One row per guess, with `user_id`, `number`, `was_correct`, `guessed_at`. Used both for rendering the history in the UI and as the audit trail for "what happened." |

There is no separate `boards` table. The only datum that fits the "board" concept (the static starting state — see [`tinyspy.md`](tinyspy.md) for the gametype/game/board distinction) is the target number, which is too small to warrant its own table. It co-locates onto the game row.

### Play-state enum

`common.games.play_state` carries psychic-num's lifecycle enum. Accepted values:

- **playing** — guesses being submitted. The default; no other entry state.
- **won** — a correct guess landed. Terminal.
- **lost** — the last wrong guess (the one that took the budget to 0) landed. Terminal. The "last" varies with the setup dialog's `guesses` choice (3, 5, 7, or 9 — see [Setup](#setup) below).

Simpler than tinyspy's enum (no sudden_death, no multi-axis loss reasons). This is one of the things Psychic Num is testing — that the architecture doesn't accidentally hardcode tinyspy's specific states.

## The hidden-target mechanic

The most architecturally interesting piece of Psychic Num is how it hides `target` from clients. Two layers, working together:

### Layer 1 — column-level grant (storage gate)

The base table grants SELECT to `authenticated` on every column *except* `target`:

```sql
grant select
  (id, club_id, guesses_remaining, winner_id, created_at)
  on psychicnum.games to authenticated;
```

A direct `SELECT target FROM psychicnum.games WHERE id = ?` as `authenticated` raises SQLSTATE 42501 ("permission denied for column target"). The RPCs (which run as `postgres` via `security definer`) can still read it. This is tested in [`tests/psychicnum/create_game_test.sql`](../supabase/tests/psychicnum/create_game_test.sql).

### Layer 2 — `psychicnum.games_state` view + `_target_for` helper (conditional exposure)

The FE never reads from `psychicnum.games` directly anymore — it reads from a view that conditionally exposes `target` based on `common.games.is_terminal`:

```sql
create or replace view psychicnum.games_state
  with (security_invoker = true) as
select g.id, g.club_id, g.guesses_remaining, g.winner_id, g.created_at,
       psychicnum._target_for(g.id) as target
  from psychicnum.games g;
```

Two settings carry the design:

- **`security_invoker = true`** on the view means RLS is evaluated as the *caller*, not the view-owner — so the `is_club_member` policy on `psychicnum.games` decides row visibility normally.
- **`psychicnum._target_for(uuid)`** is a `SECURITY DEFINER` helper that runs as `postgres`. It bypasses the column-grant (which only binds the `authenticated` role) and returns the target — but **only when `common.games.is_terminal` is true**:

  ```sql
  -- inside _target_for(g uuid):
  select case when c.is_terminal then p.target end
    from psychicnum.games p
    join common.games c on c.id = p.id
   where p.id = g;
  ```

The net effect: one FE query (`db.from('games_state').select(...)`) returns the row with `target` populated once terminal, `null` while playing. Row visibility is gated by RLS (invoker); column exposure is gated by the helper's CASE.

The old `reveal_target` RPC is **gone** — the view subsumes its role.

### Why this matters as a pattern

This is the canonical recipe for **"expose a column the invoker can't see directly, gated on row state."** The recipe:

1. Grant SELECT on safe columns to `authenticated`; omit the secret. (Storage lock stays as defense-in-depth.)
2. Write a `SECURITY DEFINER` helper that reads the secret and returns it conditionally — running as `postgres`, it bypasses the column grant.
3. Define a view with `security_invoker = true` so RLS still gates row visibility, and call the helper for the secret column.
4. Point the FE at the view, not the base table.

Future games with conditional-reveal state (post-game key cards in tinyspy, end-of-round reveals in a future Boggle, etc.) should reach for this shape first. See [`code-conventions.md` → SECURITY DEFINER helper + security_invoker view](code-conventions.md#security-definer-helper--security_invoker-view) for the brief cross-reference.

Tinyspy doesn't use this pattern (yet) because both players' key cards are equally readable via RLS during the game; per-player filtering is by convention rather than enforcement (see [`tinyspy.md`'s note on game_players_select](tinyspy.md#row-level-security)).

## RPCs

All `security definer`, granted only to `authenticated`, search_path pinned to `psychicnum, common, public, extensions`.

### `psychicnum.create_game(target_club uuid, setup jsonb) → table(id uuid)`

Caller must be a club member. Validates the setup shape (the `guesses` value AND the shared `setup.timer` via `common.validate_timer`), picks a random target 1–10, calls `common.create_game(target_club, 'psychicnum', player_user_ids, title := target::text, setup := setup)` — which inserts the `common.games` header (`is_current_view=true`, `play_state='playing'`, with `setup` persisted on `common.games.setup`), then inserts the psychic-num detail row with `guesses_remaining` initialized from `setup.guesses`, and finally calls `common.update_state(new_id, 'playing', jsonb_build_object('guesses_remaining', setup.guesses))` to seed the listing-label payload. (Mid-game RPCs that need to read setup — `submit_guess` and `submit_timeout` reading `guesses_used` for the result payload — query `common.games.setup` via a subquery.)

A note on the title: putting the secret target directly in the title leaks it — by design. Psychic-num is a toy game in this repo and won't survive into beta. The column-level grant on `psychicnum.games.target` (described in [The hidden-target mechanic](#the-hidden-target-mechanic)) stays as the educational example of the column-grant pattern, even though in practice the title makes it moot. When a real game gets the column-grant treatment for keeping a secret hidden, its title formula will reference something non-revealing.

**No minimum-club-size check.** The game logic plays fine with any membership count — 1 (solo club, deferred), 2, 5, whatever. The current FE doesn't surface solo-club play, but the RPC doesn't reject it.

Reject reasons: not authenticated; not a member; `setup.guesses` not in {3, 5, 7, 9}; `setup.guesses` missing; bad `setup.timer` shape (see [Timer](#timer-browser-side-no-server-sync) below).

### `psychicnum.submit_guess(target_game uuid, guess int) → text`

The only mid-game action. Returns one of:

- `'correct'` — caller won the game; status flipped to `won`.
- `'wrong'` — game continues with `guesses_remaining - 1`.
- `'lost'` — caller's wrong guess took the budget to zero; status flipped to `lost`.

Locks the gametype row with `SELECT ... FOR UPDATE` to serialize concurrent guesses, then reads `play_state` from `common.games` in a separate query (the foo-lock guarantees that by the time we read play_state, any concurrent submit that ended the game has already committed). With "first correct guess wins" semantics, if two players guess the target at the same instant, whichever transaction commits first is the winner; the second sees `play_state != 'playing'` and raises `'game is not active'`.

Records every guess in `psychicnum.guesses` with `was_correct` set. Duplicate guesses (someone guessed 7 already, you guess 7 too) are allowed and decrement the counter normally.

Reject reasons:

- not authenticated
- guess out of range (must be 1–10)
- game not found
- not a club member
- game status ≠ active

### `psychicnum.submit_timeout(target_game uuid)`

Fires when the FE's count-down timer expires. Calls `common.end_game` with `play_state = 'lost'` and `status->>'outcome' = 'lost_timeout'` — distinct from the regular `lost` (exhausted guesses) so end-of-game review can show the right reason.

Idempotent on the terminal-state guard: a second concurrent call from a racing client raises `P0001 'game is not active'`, which the FE swallows. See [Timer](#timer-browser-side-no-server-sync).

Reject reasons: not authenticated; not a game player; game not found; game status ≠ active.

## Setup

The start-game dialog collects two options from the players before `create_game` fires:

- **`guesses`**: total guess budget shared across all club members, one of `{3, 5, 7, 9}`. 7 is the default (parity with the previous hardcoded value); 3 is the hard mode; 5 medium; 9 the easy warm-up.
- **`timer`**: timer mode — `none`, `countup`, or `countdown` with a player-chosen MM:SS duration (1 second to 60 minutes). Default is a 10-minute count-down. Rendered by the shared `<TimerField>` component in `src/common/components/` — the same field wordknit uses, validated server-side by `common.validate_timer`. See [Timer](#timer-browser-side-no-server-sync) below.

Shape stored on `common.games.setup` (jsonb): `{ "guesses": 3|5|7|9, "timer": { "kind": "none"|"countup" } | { "kind": "countdown", "seconds": 1..3600 } }`. The mutable `guesses_remaining` counter is initialized from `setup.guesses` at create-game time; the blob persists the original choices on the common header so end-of-game review can display "this game was played with 5 guesses and a 10-minute clock" without trying to infer either from runtime state.

The FE side: `src/psychicnum/lib/setup.ts` (the `PsychicnumSetup` type) and `src/psychicnum/components/SetupForm.tsx` (the form body, lazy-loaded inside the common `SetupGameDialog`). The server is the canonical authority for what shapes are accepted — the TypeScript narrowing is advisory.

## Timer (browser-side, no server sync)

Same model as wordknit: the timer is **browser-side only**, anchored to `common.games.started_at` (a server-stamped ISO timestamp) and ticked locally via the shared `useGameTimer` hook in `src/common/hooks/`. No periodic server sync, no `paused_at` / `time_elapsed_ms` columns — pauses freeze the displayed value via accumulated-pause-duration tracking in the hook.

Behaviors per mode:

- **`none`**: no timer rendered. `useGameTimer` returns `displaySeconds: 0` and never expires.
- **`countup`**: informational. Header shows elapsed MM:SS. Never expires (no server action on any time).
- **`countdown`**: ticks down from `setup.timer.seconds`. When it hits 0, the FE fires `psychicnum.submit_timeout`, which flips status to `lost`. Idempotent on the server side — multiple peers racing to fire is fine.

Drift bounds: the FE clock is anchored to the server timestamp, so a few hundred ms of skew is the worst case (Date.now vs server time at game start). For a multi-minute game this is invisible. If a player closes their tab and rejoins, the timer correctly reflects "you've been gone for 30 seconds" because the anchor is the server's `started_at`, not "when this React component mounted."

## Pause-on-disconnect

Two pause sources, OR'd into a single `paused` flag:

1. **Presence-pause**: any player listed in `common.game_players` whose presence isn't currently tracked on the realtime channel causes everyone to see the game as paused. The boundary is enforced by the shared `PauseBoundary` component — children **unmount** while paused (conditional render), so any per-game form state resets and click handlers are gone wholesale.
2. **Manual pause**: any connected player can click Pause in the header, which fires a Broadcast event. Any connected player can Resume. There's no privileged "original pauser" check.

The pause state propagates via the same realtime channel used for postgres-changes. Mirrors wordknit's pattern exactly — see [`docs/common.md`](common.md) and wordknit.md for the wider picture. Same hook shape (`useGame` returns `paused`, `missing`, `manuallyPausedBy`, `sendManualPause`, `sendManualUnpause`).

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
  manifest.ts             GameManifest registration. Lazy-loads ./components/PlayArea
                          directly (no Root.tsx); declares submitTimeout dispatch.
  db.ts                   export const db = supabase.schema('psychicnum')

  logo.svg                Placeholder square logo used by the GamePage header's
                          <GameLogo gametype="psychicnum" />. Imported via ?url in manifest.ts.

  components/
    PlayArea.tsx          Two-column composition (board placeholder on the left;
                          action slot + guess history on the right):
                            GuessForm (input + submit_guess RPC) — during play
                            "Game over: <status> [Back to club]" indicator — terminal
                            GuessHistory (chronological guess log, auto-scroll)
                            GameOverModal (shared) — pops on terminal entry
                          Mounted by <GamePage> as its render-prop child; receives
                          the GamePageCtx ({ session, gameId, players, playState,
                          isTerminal, timer, setup, goToClub, feedback, menu }).
                          Cross-cutting chrome (logo, chat-bubble, players strip,
                          pause, timer, suspend-confirm) lives on <GamePage>.
    PlayArea.module.css
    GuessForm.tsx         Owns input state + submit_guess dispatch. Auto-refocuses
                          the input after each submit so the player can type the
                          next guess without reaching for the mouse.
    GuessForm.module.css
    GuessHistory.tsx      Card list of guesses with username attribution. Each
                          row gets a 10px left strip (green for correct, red for
                          wrong) — same visual register as wordknit + tinyspy.
                          Chronological order; auto-scrolls to bottom.
    GuessHistory.module.css
    SetupForm.tsx         The setup form (guess budget + timer) mounted in the
                          common SetupGameDialog.
    SetupForm.module.css
    Help.tsx              Per-game rules modal — opened from the common "Help"
                          item in the GamePage menu. Implements the manifest's
                          required `help: ComponentType<{ onClose }>` contract.

  hooks/
    useGame.ts            Loads the game row (from games_state, so target appears on
                          termination) + guesses, subscribes to realtime. No longer owns
                          presence / pause / members / timer — those live in
                          common's useCommonGame, consumed by GamePage.

  lib/
    setup.ts              PsychicnumSetup type + DEFAULT_PSYCHICNUM_SETUP.
```

### `PlayArea`

A two-column composition. Reads `playState`, `isTerminal`, `timer`, `setup`, `goToClub`, `feedback`, `menu` from `GamePageCtx`. During play, renders `<GuessForm>` plus a "Guess the number (1–10). N guesses left." status line; on terminal, renders a "Game over: `<status>` [Back to club]" indicator in the same slot. `<GuessHistory>` always renders below it. The shared `<GameOverModal>` (see [`ui.md` → Modals for terminal results](ui.md#modals-for-terminal-results)) pops on terminal entry with a per-status verdict — "You win!" / "You lost: out of time" / "You lost: out of guesses." Each wrong guess fires a closeable feedback pill in the header via `ctx.feedback.show`. The board placeholder reveals the secret number once the game is over. Everything cross-cutting (logo, chat, pause, timer, the global UserMenu) is the responsibility of `<GamePage>` / App.

### `useGame`

Reads from `psychicnum.games_state` (the view that exposes `target` conditionally on terminal status — see [The hidden-target mechanic](#the-hidden-target-mechanic)). `game.target: number | null` comes back directly: `null` while active, the actual number once terminal. No separate reveal effect.

Subscribes to realtime on `psychicnum.{games, guesses}` over its own per-tab UUID-suffixed channel (`psychicnum:${gameId}:${uuid}`) for postgres-changes only. On any change, refetches the bundle. Follows the same patterns as tinyspy's hooks (per-effect unique channel name, refetch on `SUBSCRIBED`, separate fetches for cross-schema profile data).

The `members` array used by `GuessHistory` for "[ada] guessed 7" attribution comes from `useCommonGame` (via GamePage's render-prop).

### Code-splitting

Same pattern as tinyspy — the manifest's `PlayArea` is lazy-loaded. The build emits psychicnum's JS as its own chunk (~4 KB gzipped); users who only play tinyspy never download it.

## Psychic-num testing

See [`testing.md`](testing.md) for theory and shared setup. Psychic-num-specific notes:

### pgTAP files

| file | covers |
|---|---|
| `tests/psychicnum/create_game_test.sql` | Auth, membership, happy path, `setup.guesses` validation, `setup.timer` shape spot-checks (the shared validator's full grid lives in wordknit's create_game test), `is_current_view` flips via `common.games`, title formula, column-level grant blocks SELECT of `target`. |
| `tests/psychicnum/gameplay_test.sql` | Range guards, correct guess flips `play_state` to `won` and freezes `winner_username` into `status`, wrong guess decrements, duplicate guesses allowed, 7th wrong loses, `common.end_game` flips `is_terminal=true` on termination, `submit_timeout` happy path + idempotency + non-player rejection. |
| `tests/psychicnum/rls_test.sql` | dee (non-member) sees zero rows from both tables and from `games_state`, mutating RPCs throw. Members reading `games_state` see `target IS NULL` while active and the actual value once status is terminal — exercising both the `security_invoker` row-gating and the `_target_for` helper's CASE. |

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

The schema has `psychicnum.games.winner_id` — a per-game record of who landed the winning guess. **This contradicts the cooperative spec** — the spec is "if any player guesses, the team wins," with no individual attribution. The `winner_id` tracking is overspec — a pattern that fits tinyspy's turn-based who-did-what model but doesn't belong in a cooperative-team game.

The recent GameOverModal refactor already dropped the FE-side `<ResultBanner>` that surfaced "[winner] guessed it" copy — the modal now reads as a uniform team-verdict ("You win!"), and the per-guess attribution still on `GuessHistory` carries the cooperative framing. The remaining cleanup is the schema side:

| where | what to remove |
|---|---|
| `psychicnum_baseline.sql` | `winner_id` column on `psychicnum.games`; the `update ... set winner_id = caller_id` line in `submit_guess` |
| `src/psychicnum/hooks/useGame.ts` | `winner_id` field on `PsychicnumGame` and from the `games_state` SELECT list |
| `src/psychicnum/manifest.ts` | the `labelFor` already doesn't read `winner_id` directly (it reads `winner_username` from `common.games.status`, frozen there by `submit_guess`); just drop the `update ... set winner_id` line from the RPC, no FE change needed |
| `tests/psychicnum/gameplay_test.sql` | the `winner_id` assertion |

~20 lines of removal across 4 files. Not done yet because there's no functional pressure.

### Other gaps

- **No solo-mode UI** even though the RPCs allow any club size. Tied to the broader question of how solo-clubs surface in the UI; see [`common.md`'s solo-clubs section](common.md#solo-clubs).
- **No anti-spam.** Friends-only audience; not a concern. The 7-guess cap caps damage anyway.

## File locations

| asking… | look at… |
|---|---|
| What does an RPC do | [`supabase/migrations/20260612000002_psychicnum_baseline.sql`](../supabase/migrations/20260612000002_psychicnum_baseline.sql) |
| What does the UI look like | [`src/psychicnum/components/PlayArea.tsx`](../src/psychicnum/components/PlayArea.tsx) + `GuessForm.tsx` / `GuessHistory.tsx` alongside; the terminal modal is the shared `common/components/GameOverModal.tsx` |
| How does state flow on the FE | [`src/psychicnum/hooks/useGame.ts`](../src/psychicnum/hooks/useGame.ts) (reads from `games_state`) |
| Is the target really hidden? | column-level grant + `psychicnum.games_state` view with `_target_for` helper in the migration; SELECT-blocked test in [`tests/psychicnum/create_game_test.sql`](../supabase/tests/psychicnum/create_game_test.sql) and view-behavior test in [`tests/psychicnum/rls_test.sql`](../supabase/tests/psychicnum/rls_test.sql) |
