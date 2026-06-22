# PsychicNum

A tiny number-guessing game with two modes: **psychicnum_coop** (team plays together with a shared budget) and **psychicnum_compete** (players race independently). The second gametype family registered, kept as the minimal surface for exercising the multi-game architecture — now also the minimal surface for exercising the **coop/compete sibling-manifest pattern** that wordknit and freebee will follow. Read this file before touching anything in `psychicnum/` or `supabase/migrations/*_psychicnum_*.sql`.

For the shared layer see [`common.md`](../common.md). For testing theory + persona conventions see [`testing.md`](../testing.md). For comparison with the richer-shape gametype see [`tinyspy.md`](tinyspy.md).

## The sibling-manifest pattern

PsychicNum exports two manifest entries from one folder:

| field                | `psychicnumCoopGame`     | `psychicnumCompeteGame`     |
|----------------------|--------------------------|------------------------------|
| `gametype`           | `psychicnum_coop`         | `psychicnum_compete`          |
| `schema`             | `psychicnum`              | `psychicnum`                  |
| `baseGametype`       | `psychicnum`              | `psychicnum`                  |
| `mode`               | `'coop'`                  | `'compete'`                   |
| `name`               | `PsychicNum (coop)`       | `PsychicNum (compete)`        |
| `numberOfPlayers`    | `[1, 6]`                  | `[2, 6]`                      |

Both ship the same `PlayArea`, `SetupForm`, `Help`, `useGame`, `theme.css`, and `logo.svg`. The mode branches at render time (`game.mode === 'coop'` vs `'compete'`). The DB inserts **two rows in `common.gametypes`** but a **single set of psychicnum tables** — the `psychicnum.games.mode` column is denormalized for RLS branching, and one `psychicnum.create_game(target_club, setup, players, mode)` RPC routes both manifests' Start clicks.

`baseGametype: 'psychicnum'` is the family key — anywhere code wants "treat these as siblings" (docs lookup, future ClubPage side-by-side rendering), it filters on this field. See [`src/common/lib/games.ts`](../../src/common/lib/games.ts) → `GameManifest.baseGametype` + `mode`.

A timer that runs out is NOT what makes a game "compete" — compete needs an opposing PLAYER. Solo clubs (1 player) get only the coop button, but coop can still carry a countdown timer (where running out loses the game). The compete manifest's lower bound (2 players) hides it server-side too.

## The rules

> Spec the RPCs implement against. When the rules disagree with the code, fix this section first.

### Setup (both modes)

- A single secret number in the range **1–10**, chosen by the server uniformly at random at game-creation time. Same target for everyone.
- The number is **hidden server-side**. Clients cannot see it during active play even with devtools open — see [The hidden-target mechanic](#the-hidden-target-mechanic) below.
- Setup form collects: **guess budget** (one of 3/5/7/9), **timer** (none/countup/countdown, MM:SS for countdown).
- The mode (coop vs compete) is **NOT** a setup field — it's locked at the gametype level, picked by which Start button the player clicks. See [The sibling-manifest pattern](#the-sibling-manifest-pattern) above.

### Coop gameplay

- All players share a single guess pool (initial value = `setup.guesses`).
- Every guess decrements **everyone's** budget — coop budgets always equal each other (the per-player rows just happen to track the same number, decremented in lock-step).
- Every guess is visible to every club member (the history pane shows all of them).
- **Win:** any player's guess matches the target. Whole team wins.
- **Lose:** the last wrong guess (the one that takes the shared budget to zero) submits. Whole team loses.
- **Timeout (if countdown set):** countdown hits zero → whole team loses.

### Compete gameplay

- Each player gets their own guess budget (initial value = `setup.guesses` per player).
- Each guess decrements only the submitter's budget.
- A player sees:
  - **Their own** guesses + results (the history pane filters server-side via RLS).
  - **Opponents' remaining budget** (a strip rendered in the action slot — "You: 3 · Bea: 2 · Cade: 0").
  - **NOT** opponents' guesses or correctness.
- **Win:** the first correct guess ends the game for everyone. That player wins; everyone else loses immediately, even if they had budget remaining.
- **Lose (collective):** all player budgets reach zero with nobody having guessed correctly. Everyone loses.
- **Timeout (if countdown set):** countdown hits zero → everyone loses.

### What the game is not

- **Not a turn-based game.** Any player can guess at any time. The server serializes simultaneous guesses via `SELECT ... FOR UPDATE` on the game row.
- **Not strategic.** There's no skill in the spec — it's "guess a random number." The "fun" parameter is left at zero.
- **Slated for removal after beta** — once the roster has filled in (Boggle, crosswords, etc.), the toy stops earning its keep. The removal will validate the **removability-in-three-actions** invariant for real: `rm -rf src/psychicnum/`, drop the two entries from `src/games.ts` AND drop the two `common.gametypes` rows from the schema, drop the migration file. If anything else breaks, the architecture leaked.

## Schema: `psychicnum.*`

### Tables

| table | purpose |
|---|---|
| `games` | One row per playing. `club_handle` ties to `common.clubs`. Holds `target` (the secret) and `mode` ('coop' or 'compete', denormalized for RLS branching). Play-state (`play_state` + `is_terminal`) and the setup blob both live on `common.games`. |
| `players` | Per-player budget tracking. One row per (game, player), with `guesses_remaining`. Seeded at create-game time from `setup.guesses`. Coop decrements every row in lock-step; compete decrements only the guesser's row. Per-player outcome (`won` / `lost`) is NOT here — it goes on `common.game_players.result` at game-end via `common.end_game`. |
| `guesses` | Append-only log of every guess ever submitted. One row per guess, with `user_id`, `number`, `was_correct`, `guessed_at`. RLS in compete mode scopes visibility to caller only. |

There is no separate `boards` table. The only datum that fits the "board" concept (the static starting state — see [`tinyspy.md`](tinyspy.md) for the gametype/game/board distinction) is the target number, which is too small to warrant its own table.

### Mode column

`psychicnum.games.mode` is denormalized from the gametype string ('psychicnum_coop' → 'coop', 'psychicnum_compete' → 'compete'). It exists so the RLS policy on `psychicnum.guesses` can branch on mode without joining to `common.games` for every visibility check. CHECK constraint pins it to `{coop, compete}`. Never changes after insert.

### Data differences between coop and compete — at a glance

A consolidated comparison. Anything not listed here is identical across modes.

| dimension                              | coop                                                        | compete                                                              |
|----------------------------------------|-------------------------------------------------------------|----------------------------------------------------------------------|
| **gametype string** (`common.games.gametype`) | `'psychicnum_coop'`                                  | `'psychicnum_compete'`                                               |
| **`psychicnum.games.mode` column**     | `'coop'`                                                    | `'compete'`                                                          |
| **manifest `numberOfPlayers`**         | `[1, 6]` (solo OK)                                          | `[2, 6]` (needs ≥1 opponent)                                         |
| **`psychicnum.players.guesses_remaining` per row** | Always equal across rows (decremented in lock-step) | Independent per row (decremented only on the submitter's row)        |
| **`psychicnum.guesses` RLS**           | Club-wide visible — every member sees every guess           | Caller-only — `using (... and guesses.user_id = auth.uid())`         |
| **`psychicnum.players` RLS**           | Club-wide visible                                           | Club-wide visible (same — that's the "opponents see budget" property) |
| **`submit_guess` budget decrement**    | UPDATE every player row                                     | UPDATE only the caller's row                                         |
| **`submit_guess` correct-guess terminal** | `play_state='won'`, every player `result={won: true}`    | `play_state='won_compete'`, caller `result={won: true}`, others `{won: false}` |
| **`submit_guess` all-exhausted terminal** | `play_state='lost'`, every player `result={won: false}`  | `play_state='lost_compete'`, every player `result={won: false}`      |
| **`submit_timeout` terminal**          | `play_state='lost'`, outcome `lost_timeout`                 | `play_state='lost_compete'`, outcome `lost_compete_timeout`          |
| **listing-label `status.guesses_remaining`** | Shared value (all rows have it; any row works)        | Sum of all rows (the listing label reflects "total remaining budget across the game") |
| **FE PlayArea header**                 | "X guesses left" (single shared number)                     | Budget strip: "You: X · Bea: Y · Cade: Z"                            |
| **FE GuessHistory**                    | Every guess shown with username                             | Only caller's guesses shown (RLS filters server-side; FE doesn't need to filter) |
| **GameOverModal verdict copy**         | "You win!" / "You lost: out of guesses" (team)              | "You won the race!" / "Beaten to the punch." (per-self)              |

The shape that's the same in both modes:
- The `psychicnum.games` table (modulo the `mode` value).
- The `psychicnum.players` table (one row per player; structurally identical).
- The `psychicnum.guesses` table (rows look the same; RLS hides them differently).
- The setup blob (`{ guesses, timer }`) — same fields, same defaults.
- The hidden-target mechanic — both modes reveal the target post-terminal via `games_state`.
- `common.games.title` formula (a random `#NNNNNN` id — see [Title formula](#title-formula)).
- `common.game_players.result` shape (`{ won: bool }`).
- `common.update_state` mid-game listing-label payload structure.

### Play-state enum

`common.games.play_state` carries PsychicNum's lifecycle enum. Different vocabularies per mode:

**Coop:**
- **playing** — guesses being submitted. Default.
- **won** — a correct guess landed. Terminal.
- **lost** — collective budget exhausted OR timer expired. Terminal.

**Compete:**
- **playing** — guesses being submitted. Default.
- **won_compete** — a player guessed correctly. Terminal. That player's `common.game_players.result = {won: true}`; everyone else's `= {won: false}`.
- **lost_compete** — all players exhausted their budgets OR timer expired with nobody having won. Terminal. Everyone's `result = {won: false}`.

**Both modes:**
- **ended** — a player chose the **End game** menu item (`psychicnum.end_game`, `outcome='manual'`). Terminal, neutral: nobody won, nobody lost, everyone's `result = {won: false}`. Deliberately the *uniform* value the other games use for manual stops (not `'lost'`/`'lost_compete'`) so the cross-game terminal vocabulary stays consistent; the FE has explicit `'ended'` branches that render it green ("Game ended") rather than as a loss.

The mode-specific suffixes mirror what freebee did for its planned compete mode. Future games' compete-mode terminal states should follow this convention.

## The hidden-target mechanic

The most architecturally interesting piece of PsychicNum is how it hides `target` from clients. Two layers, working together:

### Layer 1 — column-level grant (storage gate)

The base table grants SELECT to `authenticated` on every column *except* `target`:

```sql
grant select
  (id, club_handle, mode, created_at)
  on psychicnum.games to authenticated;
```

A direct `SELECT target FROM psychicnum.games WHERE id = ?` as `authenticated` raises SQLSTATE 42501 ("permission denied for column target"). The RPCs (which run as `postgres` via `security definer`) can still read it. This is tested in [`tests/psychicnum/create_game_test.sql`](../../supabase/tests/psychicnum/create_game_test.sql).

### Layer 2 — `psychicnum.games_state` view + `_target_for` helper (conditional exposure)

The FE never reads from `psychicnum.games` directly anymore — it reads from a view that conditionally exposes `target` based on `common.games.is_terminal`:

```sql
create or replace view psychicnum.games_state
  with (security_invoker = true) as
select g.id, g.club_handle, g.mode, g.created_at,
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

### Why this matters as a pattern

This is the canonical recipe for **"expose a column the invoker can't see directly, gated on row state."** The recipe:

1. Grant SELECT on safe columns to `authenticated`; omit the secret. (Storage lock stays as defense-in-depth.)
2. Write a `SECURITY DEFINER` helper that reads the secret and returns it conditionally — running as `postgres`, it bypasses the column grant.
3. Define a view with `security_invoker = true` so RLS still gates row visibility, and call the helper for the secret column.
4. Point the FE at the view, not the base table.

Future games with conditional-reveal state (post-game key cards in tinyspy, end-of-round reveals in a future Boggle, etc.) should reach for this shape first. See [`code-conventions.md` → SECURITY DEFINER helper + security_invoker view](../code-conventions.md#security-definer-helper--security_invoker-view) for the brief cross-reference.

TinySpy doesn't use this pattern (yet) because both players' key cards are equally readable via RLS during the game; per-player filtering is by convention rather than enforcement (see [`tinyspy.md → Row-level security`](tinyspy.md#row-level-security)).

## RPCs

All `security definer`, granted only to `authenticated`, search_path pinned to `psychicnum, common, public, extensions`.

### `psychicnum.create_game(target_club text, setup jsonb, player_user_ids uuid[], mode text) → table(id uuid)`

Caller must be a club member. **One RPC for both modes** — the `mode` parameter:

- Routes the gametype string to `'psychicnum_coop'` or `'psychicnum_compete'` on `common.games.gametype`.
- Lands on `psychicnum.games.mode` for RLS branching.
- Triggers the player-count check (`compete` requires ≥2 players).

Each FE manifest's `startGameInClub` passes its own per-manifest mode constant — the caller doesn't pick mode interactively.

After validation, picks a random target 1–10, calls `common.create_game(target_club, '<gametype>', player_user_ids, target::text, setup, setup)` — which inserts the `common.games` header (`is_current_view=true`, `play_state='playing'`, with `setup` persisted on `common.games.setup`), then inserts the psychicnum.games row, then inserts one `psychicnum.players` row per player_user_ids entry with `guesses_remaining` seeded from `setup.guesses`.

**Player-count gates:**
- Coop: `common.require_player_count_max(player_user_ids, 6)`. Matches `numberOfPlayers: [1, 6]`.
- Compete: same max-6 plus an explicit `array_length >= 2` check. Matches `numberOfPlayers: [2, 6]`.

Reject reasons: not authenticated; not a member; `mode` not in `{coop, compete}`; compete with <2 players; >6 players; `setup.guesses` not in {3, 5, 7, 9}; `setup.guesses` missing; bad `setup.timer` shape (see [Timer](#timer-server-authoritative-ticks) below).

### Title formula

A random short numeric id, formatted `#NNNNNN` (six zero-padded digits, e.g. `#042317`). The title is purely a human-readable label for the game row in club lists — it must **not** reference the target, because `common.games.title` is club-wide readable and would put the secret in plain sight. The column-level grant on `psychicnum.games.target` (described in [The hidden-target mechanic](#the-hidden-target-mechanic)) is the canonical "true server-side secret" — and unlike the earlier title-as-target formula, nothing now undercuts it. (We don't care about friends peeking via devtools — see [CLAUDE.md → Trust model](../../CLAUDE.md) — but the secret shouldn't sit in a label-shaped column that exists for a different purpose.)

### `psychicnum.submit_guess(target_game uuid, guess int) → text`

The only mid-game action. Returns one of:

- `'correct'` — caller won the game; play_state flipped to `won` (coop) or `won_compete` (compete).
- `'wrong'` — game continues.
- `'lost'` — collective budget exhaustion; play_state flipped to `lost` / `lost_compete`.

**Mode-aware budget decrement:**
- Coop: decrements every `psychicnum.players` row.
- Compete: decrements only the caller's row.

**Mode-aware terminal-on-correct:**
- Coop: `play_state='won'`, every player's `result = {won: true}` (team win).
- Compete: `play_state='won_compete'`, caller's `result = {won: true}`, everyone else's `result = {won: false}`. Game ends for everyone — opponents with remaining budget no longer get to try.

**Mode-aware terminal-on-all-exhausted:**
- Coop: any wrong guess that takes the shared count to 0 → `play_state='lost'`.
- Compete: `play_state='lost_compete'` only when the sum of all players' budgets reaches 0 (everyone's exhausted, nobody won).

Locks the gametype row with `SELECT ... FOR UPDATE` to serialize concurrent guesses. With "first correct guess wins" semantics, if two compete-mode players guess the target at the same instant, whichever transaction commits first is the winner; the second sees `play_state != 'playing'` and raises `'game is not active'`.

Records every guess in `psychicnum.guesses` with `was_correct` set. Duplicate guesses (someone guessed 7 already, you guess 7 too) are allowed and decrement the counter normally.

Reject reasons:

- not authenticated
- guess out of range (must be 1–10)
- game not found
- not a game player
- game status ≠ playing
- caller has 0 guesses remaining (compete only — in coop a 0-budget would already have ended the game)

### `psychicnum.submit_timeout(target_game uuid)`

Fires when the FE's count-down timer expires. Calls `common.end_game` with:
- Coop: `play_state = 'lost'`, `status->>'outcome' = 'lost_timeout'`.
- Compete: `play_state = 'lost_compete'`, `status->>'outcome' = 'lost_compete_timeout'`.

Either way, **everyone loses** — `common.game_players.result = {won: false}` for every player. Compete-mode players were racing; the clock running out before anyone won is a collective loss.

Idempotent on the terminal-state guard: a second concurrent call from a racing client raises `P0001 'game is not active'`, which the FE swallows. See [Timer](#timer-server-authoritative-ticks).

Reject reasons: not authenticated; not a game player; game not found; game status ≠ playing.

### `psychicnum.end_game(target_game uuid)`

The **End game** menu item (per-game item declared by `PlayArea` via `ctx.menu.setGameItems`, both modes) fires this. It's the explicit manual stop — any current game player can decide the group is done.

Unlike `submit_timeout`, a manual stop is **neither a win nor a loss**, so it writes the uniform terminal `play_state = 'ended'` with `status = {outcome:'manual', mode}` and `result = {won: false}` for every player (psychicnum tracks no per-player score, so there's nothing richer to record). Same shape across both modes. The FE renders `'ended'` neutrally — green "Game ended" copy, not the red loss treatment.

Idempotent on the terminal-state guard: a second concurrent call raises `P0001 'game is not in progress'`, which the FE swallows. **Realtime touch at the tail** (`update psychicnum.games set club_handle = club_handle …`) — same trick as `submit_timeout`: `common.end_game` only writes `common.games`, so the no-op self-set produces the WAL entry that wakes the FE's `psychicnum.games` subscription to refetch and reveal the target.

Reject reasons: not authenticated; not a game player; game not found; game status ≠ playing.

## Setup

The start-game dialog collects two options from the players before `create_game` fires:

- **`guesses`**: total guess budget shared across all club members, one of `{3, 5, 7, 9}`. 7 is the default; 3 is hard mode; 5 medium; 9 the easy warm-up.
- **`timer`**: timer mode — `none`, `countup`, or `countdown` with a player-chosen MM:SS duration (1 second to 60 minutes). Default is a 10-minute count-down. Rendered by the shared `<TimerField>` component in `src/common/components/` — the same field wordknit uses, validated server-side by `common.validate_timer`. See [Timer](#timer-server-authoritative-ticks) below.

Shape stored on `common.games.setup` (jsonb): `{ "guesses": 3|5|7|9, "timer": { "kind": "none"|"countup" } | { "kind": "countdown", "seconds": 1..3600 } }`. The mutable `guesses_remaining` counter is initialized from `setup.guesses` at create-game time; the blob persists the original choices on the common header so end-of-game review can display "this game was played with 5 guesses and a 10-minute clock" without trying to infer either from runtime state.

The FE side: `src/psychicnum/lib/setup.ts` (the `PsychicNumSetup` type) and `src/psychicnum/components/SetupForm.tsx` (the form body, lazy-loaded inside the common `SetupGameDialog`). The server is the canonical authority for what shapes are accepted — the TypeScript narrowing is advisory.

## Timer (server-authoritative ticks)

Standard `<TimerField>` + `useGameTimer` setup — same as wordknit; see [`wordknit.md → Timer`](wordknit.md#timer-server-authoritative-ticks) for the design rationale and drift bounds. Psychic-num-specific: countdown expiry calls `psychicnum.submit_timeout`, which flips `play_state` to `lost`.

## Pause-on-disconnect

Inherited unchanged from the common shell — presence-pause + manual-pause both compose into a single `paused` flag, `PauseBoundary` unmounts children while paused. Psychic-num has no gametype-specific wiring beyond mounting the shared `<GamePage>`. See [`wordknit.md → Pause`](wordknit.md#pause-presence-driven--manual) for the canonical write-up.

## Row-level security

All three tables (`games`, `players`, `guesses`) have RLS enabled, with SELECT policies. INSERT / UPDATE / DELETE are not granted to `authenticated` at all — all writes go through the RPCs.

- **`games` + `players`** are club-wide visible: `using (common.is_club_member(club_handle))` (games) / `using (exists ... is_club_member(g.club_handle))` (players join via game). Every club member sees every player's budget in both modes — that's the "opponents see remaining budget but not guesses" property.

- **`guesses`** is mode-aware:

  ```sql
  create policy guesses_select on psychicnum.guesses
    for select to authenticated
    using (
      exists (
        select 1 from psychicnum.games g
         where g.id = guesses.game_id
           and common.is_club_member(g.club_handle)
           and (g.mode = 'coop' or guesses.user_id = auth.uid())
      )
    );
  ```

  Coop: any club member sees any guess. Compete: club members only see their own guesses. The `g.mode` read is denormalized expressly to avoid joining `common.games` on every visibility check.

Realtime publication includes all three tables so the FE can subscribe to terminal-state flips (games), budget decrement (players), and new-guess appends (guesses). In compete mode the realtime payload for an opponent's guess still arrives, but the RLS-filtered refetch hides it from rendering.

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
    setup.ts              PsychicNumSetup type + DEFAULT_PSYCHICNUM_SETUP.
```

### `PlayArea`

A two-column composition. Reads `playState`, `isTerminal`, `timer`, `setup`, `goToClub`, `feedback`, `menu` from `GamePageCtx`. During play, renders `<GuessForm>` plus a "Guess the number (1–10). N guesses left." status line; on terminal, renders a "Game over: `<status>` [Back to club]" indicator in the same slot. `<GuessHistory>` always renders below it. The shared `<GameOverModal>` (see [`ui.md` → Modals for terminal results](../ui.md#modals-for-terminal-results)) pops on terminal entry with a per-status verdict — "You win!" / "You lost: out of time" / "You lost: out of guesses." Each wrong guess fires a closeable feedback pill in the header via `ctx.feedback.show`. The board placeholder reveals the secret number once the game is over. Everything cross-cutting (logo, chat, pause, timer, the global UserMenu) is the responsibility of `<GamePage>` / App.

### `useGame`

Reads from `psychicnum.games_state` (the view that exposes `target` conditionally on terminal status — see [The hidden-target mechanic](#the-hidden-target-mechanic)). `game.target: number | null` comes back directly: `null` while active, the actual number once terminal. No separate reveal effect.

Drives off the shared [`useRealtimeRefetch`](../../src/common/hooks/useRealtimeRefetch.ts) factory with a two-table subscription on `psychicnum.{games, guesses}`. The factory owns the per-effect UUID-suffixed channel name, the SUBSCRIBED-driven refetch, and the cleanup; this hook just declares its tables + writes the `load({ mounted })` callback. See `code-conventions.md` → "Realtime data hooks" for the factory contract.

The `members` array used by `GuessHistory` for "[ada] guessed 7" attribution comes from `useCommonGame` (via GamePage's render-prop).

### Code-splitting

Same pattern as tinyspy — the manifest's `PlayArea` is lazy-loaded. The build emits psychicnum's JS as its own chunk (~4 KB gzipped); users who only play tinyspy never download it.

## Psychic-num testing

See [`testing.md`](../testing.md) for theory and shared setup. Psychic-num-specific notes:

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
select * from psychicnum.create_game(
  (select handle from club),
  pg_temp.psychicnum_setup(),
  array[ada_id, bea_id]::uuid[],
  'coop'  -- or 'compete'
);

-- Pin the target as postgres (RPC runs randomly; we override directly)
reset role;
update psychicnum.games set target = 7 where id = (select id from g);

-- Now play through the scenario...
select pg_temp.as_user(...);
select psychicnum.submit_guess((select id from g), 7);  -- correct!
```

The `reset role` step is the noteworthy bit — clients can't write to `psychicnum.games` (no INSERT/UPDATE/DELETE grant on `authenticated`), so the test needs to drop back to `postgres` to do the override. This is only legal in tests; in production the RPC has the only path to write.

## Open items

- **No anti-spam.** Friends-only audience; not a concern. The 7-guess cap caps damage anyway.

## File locations

| asking… | look at… |
|---|---|
| What does an RPC do | [`supabase/migrations/20260615000002_psychicnum.sql`](../../supabase/migrations/20260615000002_psychicnum.sql) |
| What does the UI look like | [`src/psychicnum/components/PlayArea.tsx`](../../src/psychicnum/components/PlayArea.tsx) + `GuessForm.tsx` / `GuessHistory.tsx` alongside; the terminal modal is the shared `common/components/GameOverModal.tsx` |
| How does state flow on the FE | [`src/psychicnum/hooks/useGame.ts`](../../src/psychicnum/hooks/useGame.ts) (reads from `games_state`) |
| Is the target really hidden? | column-level grant + `psychicnum.games_state` view with `_target_for` helper in the migration; SELECT-blocked test in [`tests/psychicnum/create_game_test.sql`](../../supabase/tests/psychicnum/create_game_test.sql) and view-behavior test in [`tests/psychicnum/rls_test.sql`](../../supabase/tests/psychicnum/rls_test.sql) |
