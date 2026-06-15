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
| `games` | One row per match. `club_id` (not null) ties to `common.clubs`. Tracks `status`, `turn_number`, `turns_remaining`, `current_clue_giver`, `next_game_id` (set by `play_again`). |
| `game_players` | Two seated players per game. Holds each player's `key_card` jsonb — a 25-element array of `'G' \| 'N' \| 'A'` matching `words.position`. FK to `common.profiles`. |
| `word_pool` | The static Duet word list (390 words, seeded by migration). Read only by security-definer RPCs; clients have no SELECT grant. |
| `words` | 25 rows per game — the board. `revealed_as` is null until a guess reveals the cell. |
| `clues` | One row per turn, enforced by `unique (game_id, turn_number)`. Holds the clue word + count + which seat gave it. |

### Status enum

`games.status text not null check (status in ('active', 'sudden_death', 'won', 'lost_assassin', 'lost_clock'))`

- **active** — turn-based clue/guess loop. The most common status.
- **sudden_death** — timer tokens are spent. No more clues; any wrong guess loses.
- **won** — all 15 greens revealed. Terminal.
- **lost_assassin** — an assassin was revealed. Terminal.
- **lost_clock** — sudden death ended with a non-green reveal. Terminal.

There is **no `lobby` status** — under the club model, both members are seated at game-creation time and the game starts directly in `active`. The lobby state existed in an earlier shape of the codebase (join-code based) and was removed when tinyspy adopted clubs.

### Key-card representation

Each `game_players.key_card` is a 25-element jsonb array of `'G' | 'N' | 'A'`. Position `i` in the array maps to `tinyspy.words.position = i`. Each seat has its own row, so each player has their own view; the partner's row holds the partner's view, which is *different* (per the Duet distribution table above).

```sql
-- seat A's view of position 7
select (key_card ->> 7) from tinyspy.game_players
 where game_id = ? and seat = 'A';
```

The fact that both views are stored on `game_players` rows that RLS lets either player read is a deliberate v1 trade-off — see the policy comment in the baseline migration. The convention is that client code only ever asks for `user_id = self`; nothing forbids the partner's key from being read but it's never queried in practice. Hardening this is on the deferred list (see [Open items](#open-items) below).

## RPCs

All `security definer`, granted only to `authenticated`, search_path pinned to `tinyspy, common, public, extensions`.

### `tinyspy.create_game(target_club uuid) → table(id uuid)`

The one entry point. Verifies caller is in a 2-member club, seats both, picks 25 words, generates the Duet key-card distribution, sets status='active', upserts `common.club_active_game` (auto-pausing any prior active game). One call, no lobby state.

Reject reasons: not authenticated; non-member; club doesn't have exactly 2 members.

The key-card generation is the algorithmically interesting bit: build the 25-element multiset matching the distribution, shuffle Fisher-Yates, project to the two seat views. The same logic runs in `play_again` — refactoring it out would buy ~30 lines but cost the ability to read each RPC linearly. Currently it's inlined in both.

### `tinyspy.submit_clue(target_game uuid, word text, clue_count int)`

Inserts a clue for the current turn. Reject reasons:

- not authenticated
- not your turn (`caller_seat ≠ current_clue_giver`)
- a clue already exists for this `turn_number` (enforced by the `unique (game_id, turn_number)` constraint, but checked explicitly in the RPC for a cleaner error message)
- game status ≠ active (no clues in sudden death — guesses come from memory only)

Parameter is `clue_count` (not `count`) to avoid shadowing the SQL aggregate; the matching column on `tinyspy.clues` stays `count` since it's only referenced in column lists.

### `tinyspy.submit_guess(target_game uuid, target_position int) → text`

The complex one. Returns the revealed label (`'G' | 'N' | 'A'`) for caller convenience.

Logic in order:

1. Range-check `target_position` (0–24).
2. Lock the game row (`FOR UPDATE`).
3. Verify status is `active` or `sudden_death`.
4. Verify caller is a player.
5. Determine **whose key view labels this reveal**:
   - During `active`: the clue-giver's view. Also rejects "you are the clue-giver" and "no clue yet."
   - During `sudden_death`: the partner's view (the seat opposite the caller).
6. Verify the cell isn't already revealed.
7. Insert the reveal into `tinyspy.words`.
8. Resolve the outcome:
   - Assassin → `status = 'lost_assassin'`, return `'A'`.
   - Sudden death + non-green → `status = 'lost_clock'`, return label.
   - Green → check if `count(revealed_as = 'G') >= 15` → `status = 'won'`. Either way, turn continues, return `'G'`.
   - Neutral (in active play) → `_end_turn`, return `'N'`.

The status flip to terminal fires the `clear_active_on_termination` trigger, which deletes the matching `common.club_active_game` row.

### `tinyspy.pass_turn(target_game uuid)`

Voluntary turn-end during the guess phase. Spends one timer token, swaps the clue-giver. Reject reasons: clue-giver can't pass; no clue this turn; status ≠ active.

### `tinyspy.play_again(prev_game uuid) → table(id uuid)`

From a finished game, creates a successor in the same club with fresh words + key card. Both players are pre-seated in the same seats. Idempotent via `prev.next_game_id`: whichever caller arrives first creates; a later call from the same `prev_game` returns the existing successor id. Upserts `common.club_active_game` to the new game.

Reject reasons: not authenticated; previous game not ended; not a player in the previous game.

### `tinyspy.get_clue_context(target_game uuid) → jsonb`

Read-only RPC for the [`tinyspy-suggest-clue`](#edge-function-tinyspy-suggest-clue) Edge Function. Returns the caller's unrevealed greens/neutrals/assassin words + the history of previous clues. Authorization: caller must be the current clue-giver of an active (or sudden-death) game; the Edge Function inherits that gate by calling this as the user.

### Helpers (not callable from the client)

| function | role |
|---|---|
| `tinyspy.is_player_in_game(target_game uuid) → boolean` | Security-definer RLS helper. Bypasses RLS in its body to prevent recursion when `game_players` policies need to ask "is the caller a player?". Marked `stable` so Postgres can cache it within a SELECT. |
| `tinyspy._end_turn(target_game uuid)` | Shared by `submit_guess` (on neutral) and `pass_turn`. Decrements `turns_remaining`, increments `turn_number`, swaps `current_clue_giver`, flips to `sudden_death` at zero. Underscore-prefixed by convention to signal "internal." |
| `tinyspy.clear_active_on_termination()` | Trigger on `tinyspy.games`. When status flips from non-terminal to terminal, deletes the matching `common.club_active_game` row so the club-level state becomes "completed." |

## Row-level security

Every `tinyspy.*` table has RLS enabled. SELECT policies all gate on `is_player_in_game(game_id)`. No INSERT/UPDATE/DELETE policies anywhere — writes go through the RPCs.

`word_pool` has **no policies at all and no grants** for `authenticated`. Only security-definer RPCs (`create_game`, `play_again`) read from it. There's no need for clients to see the word pool.

The one liberal policy is `game_players_select` — it returns *all columns* of `game_players` for any player in the game, including the partner's `key_card`. Client code by convention filters to `user_id = self`. A harder version would split this into own-row reads + a `game_players_roster` view that omits `key_card`. See the policy comment in the baseline migration for the trade-off.

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
  Root.tsx                Mounted by App.tsx for /g/tinyspy/<id>. Receives gameId as a prop.
  manifest.ts             GameManifest registration.
  db.ts                   export const db = supabase.schema('tinyspy')
  theme.css               Tinyspy-specific color tokens (greens, reds, neutrals). Imported by Root.tsx so it loads with the chunk.

  components/
    BoardScreen.tsx       The main play surface — header + 5×5 board + clue panel + game log + chat.
    BoardScreen.module.css
    CluePanel.tsx         The clue-giver's input area + "Need a clue?" button + AI suggestion display.
    CluePanel.module.css
    GameLog.tsx           Reveal-history list (which player guessed what, when).
    GameLog.module.css
    GameLog.test.tsx
    GameOverBanner.tsx    The win/loss banner + "Play again" button.
    GameOverBanner.module.css
    HowToPlayModal.tsx    Rules popup. Closeable, dismissed by default after first view.
    HowToPlayModal.module.css

  hooks/
    useGame.ts            Loads the game row + players + their key cards, subscribes to realtime.
    useBoard.ts           Loads words + reveal state, subscribes to realtime.
    useBoard.test.ts
    useClues.ts           Loads the clue history.

  lib/
    phase.ts              Pure derivation: from (game state, caller seat) → 'clue' | 'guess' | 'over' | 'wait'.
    phase.test.ts         Pure unit test of the above.
    labels.ts             KeyLabel type + labelName helper for prose-friendly labels.
```

### Hooks: realtime + Suspense patterns

[`src/tinyspy/hooks/useGame.ts`](../src/tinyspy/hooks/useGame.ts) is the canonical example of the patterns we use everywhere in this project:

- **Per-effect-run unique channel names.** `tinyspy:${gameId}:${crypto.randomUUID()}` so React StrictMode's double-mount doesn't collide on channel names. The channel is torn down in the effect's cleanup; the next mount gets a fresh suffix.
- **Refetch on `SUBSCRIBED`.** When the realtime channel reaches the `SUBSCRIBED` state, we refetch the underlying data. This recovers from events missed between the initial fetch and the subscription going live.
- **Separate fetches for cross-schema embeds.** PostgREST's schema cache doesn't resolve cross-schema FKs (the `tinyspy.game_players.user_id → common.profiles.user_id` embed fails with PGRST200), so we fetch the profiles separately and merge in JS. See the comment inline.

These patterns repeat in [`useBoard`](../src/tinyspy/hooks/useBoard.ts) and [`useClues`](../src/tinyspy/hooks/useClues.ts), and in the psychic-num and common hooks too. New hooks should follow this shape.

### Phase derivation

[`src/tinyspy/lib/phase.ts`](../src/tinyspy/lib/phase.ts) takes `(game, callerSeat)` and returns a discriminated union of `'clue' | 'guess' | 'over' | 'wait'`. The decision tree is explicit and exhaustive; the test file walks through every branch.

Components consume the phase as a single value and render accordingly. Centralizing the derivation here means no component has to know that "active + I'm the clue-giver + no clue this turn" maps to the same UI state as "active + I'm the clue-giver + already submitted but waiting for guesses" (which it doesn't — they're different phases).

### Post-game peer-key reveal

During active play, each player's own `key_card` is what tints the board ([`useBoard.ts`](../src/tinyspy/hooks/useBoard.ts) → `myKey`). The partner's `key_card` is **not** fetched — even though RLS would technically allow it (see [Open items → Harden `game_players_select`](#open-items)), the convention is "don't ask, don't see."

Once the game flips to a terminal status, `useBoard` lazily fetches the partner's `key_card` into `peerKey`. `BoardScreen` then renders each unrevealed cell with **two stripes** — A's label on top, B's on bottom — so a reader can compare what each cell actually was on both views. The "would we have lost on this assassin?" review is the load-bearing UX for this.

The implementation detail worth knowing: `peerKey` is a **derived value**, not a piece of state we set/clear. It's `null` whenever `revealPeer` is false OR the cached fetch doesn't match the current `(gameId, userId)` pair. Flipping back into a fresh game (via Play again) makes the derivation evaluate to null on the next render — no manual clear needed. See `useBoard.test.ts` for the test that pins this behavior.

### Code-splitting

`Root` is lazy-loaded in the manifest (`React.lazy(() => import('./Root'))`). The Vite build emits tinyspy's JS + CSS as separate chunks; the main bundle ships only the shell + common + manifest constants. First navigation to `/g/tinyspy/<id>` fetches the chunk.

## Tinyspy testing

See [`testing.md`](testing.md) for the theory and shared setup. Tinyspy-specific notes:

### pgTAP files

| file | covers |
|---|---|
| `tests/tinyspy/create_game_test.sql` | Auth, membership, happy path, club-size check, club_active_game upsert, key-card distribution. Doubles as the pgTAP primer for the rest of the suite. |
| `tests/tinyspy/game_loop_test.sql` | The active-play turn loop: clue/guess/pass phase rejections, green-continues, neutral-ends-turn, token decrement, clue-giver swap, turn-number advance, assassin reveal flips to `lost_assassin`. |
| `tests/tinyspy/win_test.sql` | The 15-greens-found win check. Drives through revealing greens via PL/pgSQL loops over positions. |
| `tests/tinyspy/sudden_death_test.sql` | Sudden-death rules: no more clues, green continues, any non-green is `lost_clock`. Forces the game into sudden_death directly via UPDATE rather than playing nine real turns. |
| `tests/tinyspy/play_again_test.sql` | Reject-while-active, reject-non-player, successor creation, idempotency on `next_game_id`, successor becomes the club's active game. |
| `tests/tinyspy/rls_test.sql` | The single highest-value security check: dee (not a player) sees zero rows from every game-scoped table, mutating RPCs throw, direct INSERTs are blocked. Includes a positive baseline (ada CAN see the game) so "dee sees nothing" is meaningful. |
| `tests/tinyspy/clue_context_test.sql` | `get_clue_context` auth gates + shape check (returns the expected keys). |

### Tinyspy-specific test helpers

These live inline in the test files that need them — not promoted to `_shared/setup.psql` because they're tinyspy-specific:

- **`pg_temp.find_position(g uuid, s text, target text) → int`** (in `game_loop_test.sql`, `sudden_death_test.sql`, `play_again_test.sql`): "Find the first board position whose label on seat `s`'s view is `target`." The key card is random per-game; the test can't hardcode positions.
- **`pg_temp.find_position_set(g uuid, s text, target text) → int[]`** (in `win_test.sql`): array-returning variant for "find all positions matching." The positional `unnest with ordinality` avoids the `row_number()`-vs-SRF trap.

If a future game accumulates three or more of these per-game helpers, that's the signal to promote them to a `tests/<game>/setup.psql` file — see [`testing.md`](testing.md) for the deferred pattern.

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
| `src/tinyspy/components/GameLog.test.tsx` | Component renders correct labels for revealed cells. |

## Open items

Deferred or sketched but not built:

- **Hardening `game_players_select`.** Currently any player can read the partner's `key_card`. The fix is to split into own-row reads + a `game_players_roster` view that omits the key. See the policy comment in the baseline migration.
- **Mission / campaign mode.** Variable starting token counts per the rulebook's mission maps. Schema isn't built — `games.turns_remaining` would just take a non-9 default at create_game time, controlled by a new mission parameter. Worth doing when there's real demand.
- **Per-player guess UI.** Currently a single guesser at a time (the non-clue-giver during active play). Could expand to "either player can vote on a guess" for richer cooperative play, but that's a rules change, not just code.

## File locations

| asking… | look at… |
|---|---|
| What does an RPC do | [`supabase/migrations/20260612000001_tinyspy_baseline.sql`](../supabase/migrations/20260612000001_tinyspy_baseline.sql) |
| What does an RPC say it does | this file + [`supabase/tests/tinyspy/*_test.sql`](../supabase/tests/tinyspy/) |
| What does the board look like | [`src/tinyspy/components/BoardScreen.tsx`](../src/tinyspy/components/BoardScreen.tsx) |
| How does state flow on the FE | [`src/tinyspy/hooks/useGame.ts`](../src/tinyspy/hooks/useGame.ts), `useBoard.ts`, `useClues.ts` |
| What's the phase logic | [`src/tinyspy/lib/phase.ts`](../src/tinyspy/lib/phase.ts) |
| How does the AI clue suggestion work | [`supabase/functions/tinyspy-suggest-clue/index.ts`](../supabase/functions/tinyspy-suggest-clue/index.ts) |
