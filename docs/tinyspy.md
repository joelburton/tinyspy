# Tinyspy

Cooperative Codenames Duet for two club members. The first registered gametype in this monorepo, and the most schema-rich. Read this file before touching anything in `tinyspy/` or `supabase/migrations/*_tinyspy_*.sql`.

For the shared layer (clubs, profiles, routing, the registry) see [`common.md`](common.md). For testing theory + persona conventions see [`testing.md`](testing.md).

## What the game is

Two players cooperate to find all 15 "green agents" on a 5×5 grid of 25 word cards within 9 turns. Each turn one player gives a one-word clue + a number; the other guesses. The catch: each player sees a different subset of greens, neutrals, and assassins. You can only know the greens *your partner needs to find* by deducing them from their clue.

It's a strict subset of Codenames Duet's rulebook. Mission/campaign mode (variable starting token counts) is deferred — every game starts with 9 tokens.

## The rules

> Canonical spec the RPCs implement against. When a Duet rule is unclear, fix this section first, then the code.
> Sources: [Codenames Duet rulebook (PDF)](https://filemanager.czechgames.com/storage/files/codenames-duet/rules/codenames-duet-rules-en.pdf), [UltraBoardGames summary](https://www.ultraboardgames.com/codenames/codenames-duet.php).

### Setup

- 5×5 grid of 25 word cards.
- A single shared key card with two views (player A side, player B side). Each cell is independently labeled per side: **Green** (agent), **Neutral** (bystander), **Assassin**.
- Key card distribution (per Duet rulebook, 25 cells total):

| A \ B    | Green | Neutral | Assassin |
|----------|:-----:|:-------:|:--------:|
| Green    | 3     | 5       | 1        |
| Neutral  | 5     | 7       | 1        |
| Assassin | 1     | 1       | 1        |

- Each player sees **9 green / 13 neutral / 3 assassin** on their own side.
- Total green agents to find across the table: **15**.

### The clock

- Game starts with **9 timer tokens**.
- Exactly one token is spent at each turn end. Tokens are never refunded.
- A turn ends when the guesser:
  - hits a neutral (one of the clue-giver's tan cards), or
  - stops voluntarily.
- A turn does **not** end (and no token is spent) when the guesser reveals a green agent — they may keep guessing indefinitely. There is **no** clue+1 cap (that's normal Codenames, not Duet).
- Hitting the assassin ends the game immediately; token count is irrelevant.
- When the last token is spent and agents remain, the game enters **sudden death**.

### A turn

1. **Clue-giver** (alternates each turn, A first) gives one word + a number. The clue must relate to words that are green from their own view.
2. **Guesser** points to words one at a time. Each guess is resolved against the *clue-giver's* key view:
   - **Green** → place an agent marker. Guesser may continue (unlimited).
   - **Neutral** → place a neutral marker. Turn ends; spend a timer token.
   - **Assassin** → game lost immediately.
3. The guesser may stop voluntarily at any time. Doing so ends the turn and spends a timer token.
4. Reveal markers go on the **guesser's** side of the board, but the label comes from the clue-giver's key.

### End conditions

- **Win:** all 15 green agents revealed.
- **Lose (assassin):** any guess reveals an assassin on the clue-giver's side.
- **Lose (clock):** sudden death ends without finding all remaining agents.

### Sudden death

- Triggered when timer tokens hit 0 but agents remain.
- No more clues are given. Players take turns pointing at words from memory of past clues.
- Any non-green reveal (neutral or assassin) ends the game in a loss.

## How the rules map to the schema

| rule | code |
|---|---|
| 9 starting tokens, decrements only on neutral / voluntary stop | `games.turns_remaining` (default 9), decremented by `_end_turn` |
| Turn alternates clue-giver | `games.current_clue_giver` flips in `_end_turn` |
| Reveal label comes from the clue-giver's view | `submit_guess` looks up `game_players.key_card` for `current_clue_giver`, indexes by position |
| Sudden death on token = 0 | `_end_turn` flips `status = 'sudden_death'` when `turns_remaining` hits 0 |
| Sudden-death reveal uses partner's view | `submit_guess` looks up `game_players.key_card` for the seat *opposite* to the caller |
| Win: 15 greens revealed | `submit_guess` counts `revealed_as = 'G'` after every green reveal |
| Lose on assassin | `submit_guess` flips `status = 'lost_assassin'` on `revealed_label = 'A'` |
| Lose on clock | `submit_guess` flips `status = 'lost_clock'` on any non-green during `sudden_death` |

The most subtle rule in Duet is **"reveal label uses the clue-giver's view, not the guesser's."** This sits in [`tinyspy.submit_guess`](../supabase/migrations/20260612000001_tinyspy_baseline.sql) as a single line that picks `key_owner_seat`, and the test for it is in [`game_loop_test.sql`](../supabase/tests/tinyspy/game_loop_test.sql) and [`win_test.sql`](../supabase/tests/tinyspy/win_test.sql).

## Schema: `tinyspy.*`

### Tables

| table | purpose |
|---|---|
| `games` | One row per match. `club_id` (not null) ties to `common.clubs`. Tracks `turn_number`, `turns_remaining`, `current_clue_giver`. Play-state (`play_state` + `is_terminal`) lives on `common.games` — the per-gametype row carries only gametype-specific mechanics. |
| `game_players` | Two seated players per game. Holds each player's `key_card` jsonb — a 25-element array of `'G' \| 'N' \| 'A'` matching `words.position`. FK to `common.profiles`. |
| `word_pool` | The static Duet word list (390 words, seeded by migration). Read only by security-definer RPCs; clients have no SELECT grant. |
| `words` | 25 rows per game — the board. `revealed_as` is null until a guess reveals the cell. |
| `clues` | One row per turn, enforced by `unique (game_id, turn_number)`. Holds the clue word + count + which seat gave it. |

### Play-state enum

`common.games.play_state` carries tinyspy's lifecycle enum. Tinyspy's accepted values are:

- **playing** — turn-based clue/guess loop. The most common state.
- **sudden_death** — timer tokens are spent. No more clues; any wrong guess loses.
- **won** — all 15 greens revealed. Terminal.
- **lost_assassin** — an assassin was revealed. Terminal.
- **lost_clock** — sudden death ended with a non-green reveal. Terminal.
- **lost_timeout** — the wall-clock countdown (a per-game setup option, distinct from the rulebook's timer tokens) hit 0. Terminal. See [Timer](#timer-browser-side-no-server-sync) below.

The materialized `common.games.is_terminal` boolean tracks "any terminal play_state" (true for `won` / `lost_*`, false for `playing` / `sudden_death`). Code that wants "did this end?" reads `is_terminal`; code that wants the specific outcome reads `play_state`.

There is **no `lobby` state** — under the club model, both members are seated at game-creation time and the game starts directly in `playing`.

### Key-card representation

Each `game_players.key_card` is a 25-element jsonb array of `'G' | 'N' | 'A'`. Position `i` in the array maps to `tinyspy.words.position = i`. Each seat has its own row, so each player has their own view; the partner's row holds the partner's view, which is *different* (per the Duet distribution table above).

```sql
-- seat A's view of position 7
select (key_card ->> 7) from tinyspy.game_players
 where game_id = ? and seat = 'A';
```

The fact that both views are stored on columns that RLS lets either player read (`key_card_a` and `key_card_b` are both grant-readable to any club member) is a deliberate friends-only trade-off — see the policy comment in the baseline migration. The convention is that client code only ever asks for `user_id = self`; nothing forbids the partner's key from being read but it's never queried in practice. See [`CLAUDE.md → Trust model`](../CLAUDE.md#trust-model--server-authoritative-for-cleanliness-not-anti-cheat) for the wider posture on why this isn't being hardened.

## RPCs

All `security definer`, granted only to `authenticated`, search_path pinned to `tinyspy, common, public, extensions`.

### `tinyspy.create_game(target_club uuid) → table(id uuid)`

The one entry point. Verifies caller is in a 2-member club, seats both, validates `setup.turns` + `setup.firstClueGiverUserId` + `setup.timer` shape (the timer shape is shared validation via `common.validate_timer`), picks 25 words, generates the Duet key-card distribution, builds the title (`"<seatA-username>-v-<seatB-username>: <4 picked words alphabetically, comma-separated>"`), calls `common.create_game(target_club, 'tinyspy', player_user_ids, title, setup)` which inserts the `common.games` header (`is_current_view=true`, `play_state='playing'`, with `setup` persisted on `common.games.setup`, vacating any prior current-view game in the club), then inserts the tinyspy detail row. Finally calls `common.update_state(new_id, 'playing', jsonb_build_object(...))` to seed `common.games.status` with the initial label payload (turn_number, turns_remaining, greens_found). One call, no lobby state. (Mid-game RPCs that need to read setup — `submit_guess` reading `turns_used` for the result payload — query `common.games.setup` via a subquery.)

Reject reasons: not authenticated; non-member; club doesn't have exactly 2 members; bad `setup.timer` shape (see [Timer](#timer-browser-side-no-server-sync)).

The key-card generation is the algorithmically interesting bit: build the 25-element multiset matching the distribution, shuffle Fisher-Yates, project to the two seat views. Inlined directly in `create_game` rather than extracted into a helper — `create_game` is the only place that generates a board, so there's no duplication to factor out.

### `tinyspy.submit_clue(target_game uuid, word text, clue_count int)`

Inserts a clue for the current turn. Reject reasons:

- not authenticated
- not your turn (`caller_seat ≠ current_clue_giver`)
- a clue already exists for this `turn_number` (enforced by the `unique (game_id, turn_number)` constraint, but checked explicitly in the RPC for a cleaner error message)
- play_state ≠ playing (no clues in sudden death — guesses come from memory only)

Parameter is `clue_count` (not `count`) to avoid shadowing the SQL aggregate; the matching column on `tinyspy.clues` stays `count` since it's only referenced in column lists.

### `tinyspy.submit_guess(target_game uuid, target_position int) → text`

The complex one. Returns the revealed label (`'G' | 'N' | 'A'`) for caller convenience.

Logic in order:

1. Range-check `target_position` (0–24).
2. Lock the gametype row (`FOR UPDATE`) — this serializes concurrent guesses; the play_state read against `common.games` happens after the lock so any prior committed transition is visible.
3. Read `play_state` from `common.games`; verify it's `playing` or `sudden_death`.
4. Verify caller is a player.
5. Determine **whose key view labels this reveal**:
   - During `playing`: the clue-giver's view. Also rejects "you are the clue-giver" and "no clue yet."
   - During `sudden_death`: the partner's view (the seat opposite the caller).
6. Verify the cell isn't already revealed.
7. Insert the reveal into `tinyspy.words`.
8. Resolve the outcome:
   - Assassin → `common.end_game(target_game, 'lost_assassin', …)`, return `'A'`.
   - Sudden death + non-green → `common.end_game(target_game, 'lost_clock', …)`, return label.
   - Green → check if `count(revealed_as = 'G') >= 15` → `common.end_game(target_game, 'won', …)`; otherwise mid-game `common.update_state(target_game, 'playing'|'sudden_death', …)`. Return `'G'`.
   - Neutral (in regular play) → `_end_turn`, then mid-game `common.update_state(…)`, return `'N'`.

Terminal transitions write `common.games.play_state` + `is_terminal = true` + the `status` jsonb (`{outcome, greens_found, turns_used}`) via `common.end_game`. They do **not** clear `is_current_view` — a terminal game stays in the club's current slot until the last viewer leaves.

### `tinyspy.pass_turn(target_game uuid)`

Voluntary turn-end during the guess phase. Spends one timer token, swaps the clue-giver. Reject reasons: clue-giver can't pass; no clue this turn; play_state ≠ playing.

### `tinyspy.submit_timeout(target_game uuid)`

Fires when the FE's count-down timer expires. Calls `common.end_game` with `play_state = 'lost_timeout'` (distinct from `lost_clock`, which is the rulebook's timer-tokens-exhausted ending) and `status->>'outcome' = 'lost_timeout'`.

Accepts `playing` and `sudden_death` (both non-terminal); idempotent on the terminal-state guard — a second concurrent call from a racing client raises `P0001 'game is not active'`, which the FE swallows. See [Timer](#timer-browser-side-no-server-sync).

Reject reasons: not authenticated; not a game player; game not found; already terminal.

### `tinyspy.get_clue_context(target_game uuid) → jsonb`

Read-only RPC for the [`tinyspy-suggest-clue`](#edge-function-tinyspy-suggest-clue) Edge Function. Returns the caller's unrevealed greens/neutrals/assassin words + the history of previous clues. Authorization: caller must be the current clue-giver of a playing (or sudden-death) game; the Edge Function inherits that gate by calling this as the user.

### Helpers (not callable from the client)

| function | role |
|---|---|
| `tinyspy.is_player_in_game(target_game uuid) → boolean` | Security-definer RLS helper. Bypasses RLS in its body to prevent recursion when `game_players` policies need to ask "is the caller a player?". Marked `stable` so Postgres can cache it within a SELECT. |
| `tinyspy._end_turn(target_game uuid)` | Shared by `submit_guess` (on neutral) and `pass_turn`. Decrements `turns_remaining`, increments `turn_number`, swaps `current_clue_giver`, calls `common.update_state(target_game, 'sudden_death', …)` when turns_remaining hits zero. Underscore-prefixed by convention to signal "internal." |

## Row-level security

Every `tinyspy.*` table has RLS enabled. SELECT policies all gate on `is_player_in_game(game_id)`. No INSERT/UPDATE/DELETE policies anywhere — writes go through the RPCs.

`word_pool` has **no policies at all and no grants** for `authenticated`. Only the `create_game` security-definer RPC reads from it. There's no need for clients to see the word pool.

`grant select on tinyspy.games to authenticated` exposes BOTH `key_card_a` and `key_card_b` columns to any club member — a player's RLS check passes the partner's key column along with their own. Friends-only trust model (see [CLAUDE.md → Trust model](../CLAUDE.md#trust-model--server-authoritative-for-cleanliness-not-anti-cheat)): the convention is "read your own column, don't query the partner's," not "the partner's column is unreadable." A column-restricted grant could harden this if the audience ever grew; not planned for the friends-alpha posture.

## Timer (browser-side, no server sync)

Same model as wordknit and psychic-num: the wall-clock timer is **browser-side only**, anchored to `common.games.started_at` and ticked locally via the shared `useGameTimer` hook in `src/common/hooks/`. No periodic server sync, no `paused_at` / `time_elapsed_ms` columns — pauses freeze the displayed value via accumulated-pause-duration tracking in the hook.

**This is distinct from the rulebook's timer tokens.** Duet has its own clock (the 9 starting tokens, decremented at turn-end); that's the `turns_remaining` column and `lost_clock` terminal status. The wall-clock countdown is an *additional* opt-in pressure mechanism — a per-game setup choice on `setup.timer`. Per terminal status:

- `lost_clock` — Duet's rulebook ending (sudden death + non-green reveal).
- `lost_timeout` — wall-clock countdown hit 0.

Behaviors per `setup.timer.kind`:

- **`none`**: no wall-clock rendered. The default, since the rulebook's pacing already comes from the tokens.
- **`countup`**: informational. Header shows elapsed MM:SS. Never expires.
- **`countdown`**: ticks down from `setup.timer.seconds`. When it hits 0, the FE fires `tinyspy.submit_timeout`, which flips status to `lost_timeout`. Idempotent on the server side — multiple peers racing to fire is fine.

## Pause-on-disconnect

Tinyspy inherits the shared pause behavior by adopting the common `<GamePage>` shell. Two pause sources, OR'd into a single `paused` flag:

1. **Presence-pause**: any player listed in `common.game_players` whose presence isn't currently tracked on the realtime channel causes everyone to see the game as paused.
2. **Manual pause**: any connected player can click Pause in the GamePage header; Resume is exposed in the overlay.

PauseBoundary conditional-renders PlayArea — on pause, the play surface unmounts and remounts on resume. Tinyspy's per-tab postgres-changes channel tears down and reconnects, covered by the on-SUBSCRIBED refetch. See `docs/common.md` for the wider pattern.

## Edge Function: `tinyspy-suggest-clue`

The "Need a clue?" button in the FE calls this. The function:

1. Invokes `tinyspy.get_clue_context(target_game)` as the user (RLS applies — only the current clue-giver gets through).
2. Calls Claude Sonnet 4.6 via the Anthropic tool-use API. The tool schema asks the model for `{clue, count, agents, reasoning}` so it has to commit to specific agent words.
3. Returns the JSON payload.

Requires `ANTHROPIC_API_KEY` in the function's runtime env (set via `supabase secrets set`). Local dev uses `supabase/functions/.env` (gitignored).

The function lives in [`supabase/functions/tinyspy-suggest-clue/index.ts`](../supabase/functions/tinyspy-suggest-clue/index.ts). Naming follows the `<game>-<feature>` convention since Edge Functions are a flat namespace.

The trust model here is "we're not the gatekeeper of cheating" — a clue-giver could ask Claude themselves in another browser tab, so we're not adding friction. The function exists for convenience and for the better prompting we can do server-side (the prompt has the actual board state, not what the user typed).

## Frontend

### Folder layout

```
src/tinyspy/
  manifest.ts             GameManifest registration. Lazy-loads ./components/PlayArea
                          directly (no Root.tsx).
  db.ts                   export const db = supabase.schema('tinyspy')
  theme.css               Tinyspy-specific color tokens (greens, reds, neutrals). Imported by PlayArea.tsx so it loads with the chunk.

  logo.svg                Placeholder square logo used by the GamePage header's
                          <GameLogo gametype="tinyspy" />. Imported via ?url in manifest.ts.

  components/
    PlayArea.tsx          Two-column composition: BoardGrid on the left; status +
                          action slot (CluePanel ↔ terminal indicator) + GameLog
                          on the right. Loads via the three hooks, derives phase,
                          mounts the pieces. Mounted by <GamePage> as its
                          render-prop child; receives the full GamePageCtx
                          ({ session, gameId, players, playState, isTerminal,
                          timer, setup, goToClub, feedback, menu }). Cross-cutting
                          chrome (logo, chat-bubble, players strip, pause,
                          timer, suspend-confirm, the global UserMenu) lives on
                          <GamePage> / App.
    PlayArea.module.css
    BoardGrid.tsx         The 5×5 tile grid + per-tile tint/click/post-game-stripe logic.
                          Fills available column height via grid-template-rows:
                          repeat(5, 1fr); tile word centered with font-size that
                          scales via container queries. Owns pendingPos +
                          guessError + the submit_guess RPC dispatch.
                          The TILE_BG (KeyLabel → CSS class) map lives here.
    BoardGrid.module.css
    CluePanel.tsx         The clue-giver's input area + "Need a clue?" button +
                          AI suggestion display. Live-uppercases the clue input
                          (codenames convention). Uses the peer's username +
                          profile color in waiting copy ("Waiting for moth to
                          give a clue…").
    CluePanel.module.css
    GameLog.tsx           Turn-by-turn replay. Per-turn divider line; clue
                          heading (giver name colored) above each turn's guess
                          line (guesser name colored + each guessed word colored
                          by its reveal outcome via --tinyspy-{agent,neutral,
                          assassin}). Chronological order, auto-scrolls to bottom.
    GameLog.module.css
    GameLog.test.tsx
    SetupForm.tsx         The setup form mounted in the common SetupGameDialog.
    SetupForm.module.css
    Help.tsx              Per-game rules modal — opened from the common "Help"
                          item in the GamePage menu. Receives { onClose }.
                          Implements the manifest's required
                          `help: ComponentType<{ onClose }>` contract.
    Help.module.css

  hooks/
    useGame.ts            Loads the game row + players + their key cards, subscribes to realtime
                          on its own per-tab UUID-suffixed channel for postgres-changes only.
                          (Members, presence, manual-pause, timer are NOT here — they live in
                          common's useCommonGame, consumed by GamePage.)
    useBoard.ts           Loads words + reveal state, subscribes to realtime.
    useBoard.test.ts
    useClues.ts           Loads the clue history.

  lib/
    phase.ts              Pure derivation: from (game state, caller seat) → 'clue' | 'guess' | 'over' | 'wait'.
    phase.test.ts         Pure unit test of the above.
    labels.ts             KeyLabel type ('G' | 'N' | 'A') — single-letter agent /
                          neutral / assassin role.
    setup.ts              TinyspySetup type + DEFAULT_TINYSPY_SETUP. PlayArea
                          casts `ctx.setup as TinyspySetup` to read the turn cap.
```

**Terminal state.** PlayArea owns a `showModal` flag initialized to `isTerminal` plus an effect that pops it true when `isTerminal` flips during play. Renders the shared `<GameOverModal>` (see [`ui.md` → Modals for terminal results](ui.md#modals-for-terminal-results)) with a per-status verdict — "You win!" / "You lost: assassin revealed" / "You lost: out of turns" / "You lost: out of time." The action slot also shows a "Game over: `<status>` [Back to club]" indicator that stays after the modal closes.

### Hooks: realtime patterns

All three tinyspy data hooks ([`useGame`](../src/tinyspy/hooks/useGame.ts), [`useBoard`](../src/tinyspy/hooks/useBoard.ts), [`useClues`](../src/tinyspy/hooks/useClues.ts)) drive off the shared [`useRealtimeRefetch`](../src/common/hooks/useRealtimeRefetch.ts) factory — the per-effect UUID-suffixed channel name, the SUBSCRIBED-driven refetch, the cleanup flag are all owned there. Each hook just declares its tables + writes its `load({ mounted })` callback. See `code-conventions.md` → "Realtime data hooks" for the factory contract and when to reach for it (vs hand-rolling) when porting a new game.

One tinyspy-specific wrinkle worth knowing: the roster query in `useGame.ts` fetches profiles in a **separate** PostgREST call rather than via embedded-resource syntax — PostgREST's schema cache doesn't resolve cross-schema FKs (the `tinyspy.games.user_a_id → common.profiles.user_id` embed fails with PGRST200), so we fetch the (≤ 2) profiles in a second query inside the same `load()` and merge in JS. See the inline comment.

### Phase derivation

[`src/tinyspy/lib/phase.ts`](../src/tinyspy/lib/phase.ts) takes `(game, callerSeat)` and returns a discriminated union of `'clue' | 'guess' | 'over' | 'wait'`. The decision tree is explicit and exhaustive; the test file walks through every branch.

Components consume the phase as a single value and render accordingly. Centralizing the derivation here means no component has to know that "active + I'm the clue-giver + no clue this turn" maps to the same UI state as "active + I'm the clue-giver + already submitted but waiting for guesses" (which it doesn't — they're different phases).

### Post-game peer-key reveal

During active play, each player's own `key_card` is what tints the board ([`useBoard.ts`](../src/tinyspy/hooks/useBoard.ts) → `myKey`). The partner's `key_card` is **not** fetched — even though RLS would technically allow it (see [Row-level security](#row-level-security) on the trust-model framing), the convention is "don't ask, don't see."

Once the game flips to a terminal status, `useBoard` lazily fetches the partner's `key_card` into `peerKey`. `PlayArea` then renders each unrevealed cell with **two stripes** — A's label on top, B's on bottom — so a reader can compare what each cell actually was on both views. The "would we have lost on this assassin?" review is the load-bearing UX for this.

The implementation detail worth knowing: `peerKey` is a **derived value**, not a piece of state we set/clear. It's `null` whenever `revealPeer` is false OR the cached fetch doesn't match the current `(gameId, userId)` pair. Today `<GamePage>` is keyed by `gameId` at the route level, so a navigation between games remounts the hook from scratch — the derived-value contract isn't exercised in practice, but the test in `useBoard.test.ts` pins it as a guard against future refactors that keep the hook alive across game changes.

### Code-splitting

The manifest's `PlayArea` is lazy-loaded (`React.lazy(() => import('./components/PlayArea'))`). The Vite build emits tinyspy's JS + CSS as separate chunks; the main bundle ships only the shell + common + manifest constants. First navigation to `/g/tinyspy/<id>` fetches the chunk.

## Tinyspy testing

See [`testing.md`](testing.md) for the theory and shared setup. Tinyspy-specific notes:

### pgTAP files

| file | covers |
|---|---|
| `tests/tinyspy/create_game_test.sql` | Auth, membership, happy path, club-size check, `setup.turns` validation, `setup.timer` shape spot-checks (full grid lives in wordknit's test), active-flag tracking via common.games, key-card distribution. Doubles as the pgTAP primer for the rest of the suite. |
| `tests/tinyspy/game_loop_test.sql` | The active-play turn loop: clue/guess/pass phase rejections, green-continues, neutral-ends-turn, token decrement, clue-giver swap, turn-number advance, assassin reveal flips to `lost_assassin`. |
| `tests/tinyspy/win_test.sql` | The 15-greens-found win check. Drives through revealing greens via PL/pgSQL loops over positions. |
| `tests/tinyspy/sudden_death_test.sql` | Sudden-death rules: no more clues, green continues, any non-green is `lost_clock`. Forces the game into sudden_death directly via UPDATE rather than playing nine real turns. |
| `tests/tinyspy/submit_timeout_test.sql` | `submit_timeout` happy path from both `playing` and `sudden_death` → `lost_timeout`; idempotency on terminal state; non-player rejection via `require_game_player`; status.outcome plumbing. |
| `tests/tinyspy/rls_test.sql` | The single highest-value security check: dee (not a player) sees zero rows from every game-scoped table, mutating RPCs throw, direct INSERTs are blocked. Includes a positive baseline (ada CAN see the game) so "dee sees nothing" is meaningful. |
| `tests/tinyspy/clue_context_test.sql` | `get_clue_context` auth gates + shape check (returns the expected keys). |

### Tinyspy-specific test helpers

Three helpers shared across tinyspy tests, promoted to [`supabase/tests/tinyspy/setup.psql`](../supabase/tests/tinyspy/setup.psql) per the promotion threshold in [`testing.md`](testing.md). Each tinyspy test starts with two includes — `\ir ../_shared/setup.psql` for the personas + `as_user`, then `\ir setup.psql` for these:

- **`pg_temp.find_position(g uuid, s text, target text) → int`** — "Find the first board position whose label on seat `s`'s view is `target`." The key card is random per-game, so tests can't hardcode positions.
- **`pg_temp.find_position_set(g uuid, s text, target text) → int[]`** — array-returning variant. Used by `win_test.sql` to walk all 9 green agents on a side. The positional `unnest with ordinality` avoids the `row_number()`-vs-SRF trap.
- **`pg_temp.tinyspy_setup(turns int default 9, first_user uuid default ada) → jsonb`** — build a valid `create_game` setup payload. Defaults to the standard 9-turn game with ada as first clue-giver and `timer.kind = 'none'`; override turns or first_user to test variations (`tinyspy_setup(11)`, `tinyspy_setup(9, bea_uuid)`). Timer-specific tests pass a literal jsonb so the timer mode is explicit.

### The key-card distribution test

`create_game_test.sql` asserts that the 25 tiles match the Duet rulebook distribution exactly:

```
G/G:3  G/N:5  G/A:1
N/G:5  N/N:7  N/A:1
A/G:1  A/N:1  A/A:1
```

The test produces a deterministic array via `array_agg(... order by a_label, b_label)` to compare against the expected. **Sort explicit columns**, not `order by 1` — inside `array_agg`, `order by 1` parses as ORDER BY the constant integer 1 (a no-op), which lets the test pass through coincidence of row ordering. The explicit-column variant is the only correct shape; the past breakage on this is why.

### FE tests

| file | covers |
|---|---|
| `src/tinyspy/lib/phase.test.ts` | Every branch of phase derivation. Pure, no DOM. |
| `src/tinyspy/hooks/useBoard.test.ts` | The board hook's data flow — initial fetch, realtime append, refetch on resubscribe. |
| `src/tinyspy/components/GameLog.test.tsx` | Per-turn grouping, oldest-first chronological order, within-turn guess sort by `revealed_at`, "no guesses made" placeholder for passed turns. |

## Open items

Deferred or sketched but not built:

- **Mission / campaign mode.** Variable starting token counts per the rulebook's mission maps. Schema isn't built — `games.turns_remaining` would just take a non-9 default at create_game time, controlled by a new mission parameter. Worth doing when there's real demand.
- **Tile `aria-label` for screen readers.** Board tiles in `BoardGrid.tsx` carry only `aria-hidden` — a screen-reader user hears the word but not whether it's revealed, and as what role. Adding an `aria-label` like `${word}, revealed as green agent` would need a narrow `'G' | 'N' | 'A' → 'green agent' | 'neutral' | 'assassin'` helper. The prior `labels.ts → labelName` was deleted with the GameLog rewrite (colored words don't need text labels); a narrower helper would come back for this.

## File locations

| asking… | look at… |
|---|---|
| What does an RPC do | [`supabase/migrations/20260612000001_tinyspy_baseline.sql`](../supabase/migrations/20260612000001_tinyspy_baseline.sql) |
| What does an RPC say it does | this file + [`supabase/tests/tinyspy/*_test.sql`](../supabase/tests/tinyspy/) |
| What does the board look like | [`src/tinyspy/components/BoardGrid.tsx`](../src/tinyspy/components/BoardGrid.tsx) (per-tile render + the submit_guess dispatch) |
| What does the page composition look like | [`src/tinyspy/components/PlayArea.tsx`](../src/tinyspy/components/PlayArea.tsx) (mounted as the render-prop child of `<GamePage>` from App.tsx) |
| How does state flow on the FE | [`src/tinyspy/hooks/useGame.ts`](../src/tinyspy/hooks/useGame.ts), `useBoard.ts`, `useClues.ts` |
| What's the phase logic | [`src/tinyspy/lib/phase.ts`](../src/tinyspy/lib/phase.ts) |
| How does the AI clue suggestion work | [`supabase/functions/tinyspy-suggest-clue/index.ts`](../supabase/functions/tinyspy-suggest-clue/index.ts) |
