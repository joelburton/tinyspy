# codenamesduet

Cooperative Codenames Duet for two club members — the most schema-rich gametype in the roster. Read this file before touching anything in `codenamesduet/` or `supabase/migrations/*_codenamesduet_*.sql`.

For the shared layer (clubs, profiles, routing, the registry) see [`common.md`](../common.md). For testing theory + persona conventions see [`testing.md`](../testing.md).

**Manifest declarations.** Single-mode family — `gametype: 'codenamesduet'`, `baseGametype: 'codenamesduet'`, `mode: 'coop'`. No compete variant; Codenames Duet is intrinsically cooperative and there's no natural compete reading of the rules.

## What the game is

Two players cooperate to find all 15 "green agents" on a 5×5 grid of 25 word cards within 9 turns. Each turn one player gives a one-word clue + a number; the other guesses. The catch: each player sees a different subset of greens, neutrals, and assassins. You can only know the greens *your partner needs to find* by deducing them from their clue.

It's a strict subset of Codenames Duet's rulebook. Mission/campaign mode (variable starting turn counts) is deferred — every game starts with 9 turns.

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

- Game starts with **9 turns**.
- Exactly one turn is spent at each turn end. Turns are never refunded.
- A turn ends when the guesser:
  - hits a neutral (one of the clue-giver's tan cards), or
  - stops voluntarily.
- A turn does **not** end (and no turn is spent) when the guesser reveals a green agent — they may keep guessing indefinitely. There is **no** clue+1 cap (that's normal Codenames, not Duet).
- Hitting the assassin ends the game immediately; turn count is irrelevant.
- When the last turn is spent and agents remain, the game enters **sudden death**.

### A turn

1. **Clue-giver** (A gives the first clue; normally alternates — but a seat whose agents are all found is skipped, see [below](#a-finished-player-stops-giving-clues)) gives one word + a number. The clue must relate to words that are green from their own view.
2. **Guesser** points to words one at a time. Each guess is resolved against the *clue-giver's* key view:
   - **Green** → place an agent marker. Guesser may continue (unlimited).
   - **Neutral** → place a neutral marker. Turn ends — one turn used.
   - **Assassin** → game lost immediately.
3. The guesser may stop voluntarily at any time. Doing so ends the turn — one turn used.
4. Reveal markers go on the **guesser's** side of the board, but the label comes from the clue-giver's key.

#### A finished player stops giving clues

The clue-giver does **not** strictly alternate. From the rulebook: *"If all 9 words that you see as green have been covered by agent cards, tell your partner that he or she has no words left to guess. Your partner will be the one who gives clues on all remaining turns."* So once a seat's agents are all contacted, it gives no more clues — the partner takes every remaining turn. ([UltraBoardGames summary](https://www.ultraboardgames.com/codenames/codenames-duet.php) quotes the same line.)

At turn end this means: hand the clue to the alternation candidate only if that seat still has an unfound agent; otherwise the current giver keeps it. "Both seats finished" never arises at turn end — a turn ends on a neutral or a voluntary pass, never on the 15th green (which wins first), so at least one seat always has an agent left.

The FE surfaces this to **both** players as a prominent colored banner in the info column (below the agent/turn state readout) so neither reads the lopsided turn flow as a bug:

- the **finished** player gets a green "all your agents have been found — `<peer>` gives every remaining clue" banner (without it: "why don't I ever get a clue turn?");
- the **partner** gets a neutral "`<peer>` has found all their agents — you give every remaining clue now" banner (without it: "why does the clue never come back to me to guess?").

Both ride two booleans from `useBoard` — `myAgentsDone` / `peerAgentsDone` — computed by the pure [`agentsAllContacted`](../../src/codenamesduet/lib/agents.ts) helper (an agent is a `'G'` on that seat's key; "contacted" is the global `revealed_as = 'G'`). The partner flag uses the peer's key column, which the board fetch already pulls; we return the boolean rather than the key only because `peerKey` has a dedicated gated role feeding the post-game reveal — not for secrecy (the [trust model](../../CLAUDE.md#trust-model--server-authoritative-for-cleanliness-not-anti-cheat) doesn't care). Both banners show only in normal play (not sudden death, where nobody clues, nor once terminal).

#### Neutrals are per-direction (the neutral-marker rule)

A neutral is only neutral *on the clue-giver's key*. The same word may be the **other player's agent**, so a neutral locks it for the guesser's direction only — the partner can still contact it. The rulebook captures this: a word one player marks neutral may still be the other player's agent, so it stays open for the partner's direction. When that partner guesses it, it resolves on *their* clue-giver's key (agent → contacted, neutral → a second neutral marker, assassin → loss). Only when **both** players have hit a word as a neutral is it dead for both (both neutral markers cover the word).

Green (agent contacted) and assassin are **global** — true for both players the moment they're revealed. This is why the board stores a global `revealed_as` (`'G'`/`'A'`) *plus* per-seat `neutral_a` / `neutral_b` flags (a word can be a neutral for one player while still live for the other). The earlier implementation made *every* reveal global, which incorrectly stranded a partner's agent — a bug, not a house rule.

### End conditions

- **Win:** all 15 green agents revealed.
- **Lose (assassin):** any guess reveals an assassin on the clue-giver's side.
- **Lose (clock):** sudden death ends without finding all remaining agents.

### Sudden death

- Triggered when the turn budget hits 0 but agents remain.
- No more clues are given. Players take turns pointing at words from memory of past clues.
- Any non-green reveal (neutral or assassin) ends the game in a loss.

## How the rules map to the schema

| rule | code |
|---|---|
| 9 starting turns, decrements only on neutral / voluntary stop | `games.turns_remaining` (default 9), decremented by `_end_turn` |
| Turn alternates clue-giver, but a finished seat is skipped | `_end_turn` sets `games.current_clue_giver` to the alternation candidate only if that seat still has an unfound `'G'` on its key; otherwise the current giver keeps it |
| Reveal label comes from the clue-giver's view | `submit_guess` picks `games.key_card_a` or `games.key_card_b` based on `current_clue_giver`, indexes by position |
| Neutral is per-direction (partner can still guess) | `submit_guess` sets `words.neutral_a` / `neutral_b` for the *guesser's* seat (not global `revealed_as`); the "already resolved" check blocks only that seat |
| Both players hit a word as neutral → dead for both | `neutral_a AND neutral_b` (the FE grays it for both) |
| Sudden death on turns = 0 | `_end_turn` flips `play_state = 'sudden_death'` when `turns_remaining` hits 0 |
| Sudden-death reveal uses partner's view | `submit_guess` picks the `key_card_*` column for the seat *opposite* to the caller |
| Win: 15 greens revealed | `submit_guess` counts global `revealed_as = 'G'` after every green reveal |
| Lose on assassin | `submit_guess` flips `play_state = 'lost_assassin'` on `revealed_label = 'A'` |
| Lose on clock | `submit_guess` flips `play_state = 'lost_clock'` on any non-green during `sudden_death` |
| Every move is logged | one `codenamesduet.events` row per clue, guess, pass and hint (a word can be guessed twice) |

The most subtle rule in Duet is **"reveal label uses the clue-giver's view, not the guesser's."** This sits in [`codenamesduet.submit_guess`](../../supabase/sql/codenamesduet.sql) as a single line that picks `key_owner_seat`, and the test for it is in [`game_loop_test.sql`](../../supabase/tests/codenamesduet/game_loop_test.sql) and [`win_test.sql`](../../supabase/tests/codenamesduet/win_test.sql).

## Schema: `codenamesduet.*`

### Tables

| table | purpose |
|---|---|
| `games` | One row per match. `club_handle` (not null) ties to `common.clubs`. Tracks `turn_number`, `turns_remaining`, `current_clue_giver`. **Seats live on this row as columns** (`user_a_id`, `user_b_id`) alongside each seat's key view (`key_card_a`, `key_card_b` — jsonb arrays of 25 `'G' \| 'N' \| 'A'` labels matching `words.position`). Play-state (`play_state` + `is_terminal`) lives on `common.games`. |
| `word_pool` | The static Duet word list (390 words, seeded by migration). Read only by security-definer RPCs; clients have no SELECT grant. |
| `words` | 25 rows per game — the board, with denormalized reveal state. `revealed_as` (`'G'`/`'A'`/null) is the **global** reveal (agent contacted / assassin); `neutral_a` / `neutral_b` are **per-seat** bystander marks (a neutral on the giver's key may be the partner's agent, so it only locks the guesser's seat). |
| `events` | The log, in the shape every game's log takes ([supabase.md → Every game's log is `<game>.events`](../supabase.md#every-games-log-is-gameevents)): one row per `clue`, `guess`, `pass` and `hint`, `order by id`. Beside the skeleton: `turn_number`, `seat`, and payload columns named for the kind that owns them — `clue_word` / `clue_count` / `clue_from_ai` (the clue is exactly the AI's suggestion, as the client says), `guess_position` / `guess_result` — with a CHECK tying each kind to exactly its own. One clue per turn is a partial unique index. A word can be guessed twice (once per seat), which is why this is separate from the per-word `words` row. `took_turn` is true exactly where the turn number moves on: a bystander in ordinary play and a pass (both run `_end_turn`), and an agent in sudden death, where every guess is a turn of its own. |

There's no `codenamesduet.game_players` table. The "who played this game" record lives at the common layer in `common.game_players` (cross-game, used for the player roster + RLS membership checks). Seat *assignment* — which player is in seat A vs B, and what each seat's key view is — is gameplay state and lives as columns on `codenamesduet.games` directly. The two roles don't overlap: `common.game_players` answers "did this user participate"; `codenamesduet.games`'s seat columns answer "in which seat, with what key view."

### Play-state enum

`common.games.play_state` carries codenamesduet's lifecycle enum. codenamesduet's accepted values are:

- **playing** — turn-based clue/guess loop. The most common state.
- **sudden_death** — the turn budget is spent. No more clues; any wrong guess loses.
- **won** — all 15 greens revealed. Terminal.
- **lost_assassin** — an assassin was revealed. Terminal.
- **lost_clock** — sudden death ended with a non-green reveal. Terminal.
- **lost_timeout** — the wall-clock countdown (a per-game setup option, distinct from the rulebook's turn budget) hit 0. Terminal. See [Timer](#timer-server-authoritative-ticks) below.
- **ended** — the friends manually stopped an in-progress game via the **End game** menu item (`codenamesduet.end_game`). Terminal, but *neutral* — not a loss. See the [`end_game`](#codenamesduetend_gametarget_game-uuid--void) RPC below.

The materialized `common.games.is_terminal` boolean tracks "any terminal play_state" (true for `won` / `lost_*` / `ended`, false for `playing` / `sudden_death`). Code that wants "did this end?" reads `is_terminal`; code that wants the specific outcome reads `play_state`.

There is **no `lobby` state** — under the club model, both members are seated at game-creation time and the game starts directly in `playing`.

### Key-card representation

The two seats' key views live as a pair of jsonb columns on `codenamesduet.games`: `key_card_a` for seat A, `key_card_b` for seat B. Each is a 25-element array of `'G' | 'N' | 'A'`, indexed 0..24 matching `codenamesduet.words.position`. The two columns hold *different* views (per the Duet distribution table above) — that asymmetry is the whole point of Duet, since each player sees greens the other doesn't.

```sql
-- seat A's view of position 7 on a game
select (key_card_a ->> 7) from codenamesduet.games where id = ?;
```

Why columns on the games row rather than a separate two-row child table: a single SELECT on `codenamesduet.games` returns the full game state (seats, key views, turn state) in one round-trip — no join, no second query needed to render the board. The per-seat granularity that a child table would give (one row per seat, naturally row-scoped to a single player) was never load-bearing — RPCs always read both seats together (to pick the clue-giver's view vs the guesser's view during reveal resolution).

The fact that both views are RLS-readable by either player (`grant select on codenamesduet.games to authenticated` covers both columns; the `games_select` policy gates on club membership, not on seat) is a deliberate friends-only trade-off. The convention is that client code only ever asks for its own column; nothing forbids the partner's column from being read but it's never queried in practice. See [`CLAUDE.md → Trust model`](../../CLAUDE.md#trust-model--server-authoritative-for-cleanliness-not-anti-cheat) for the wider posture on why this isn't being hardened.

## RPCs

All `security definer`, granted only to `authenticated`, search_path pinned to `codenamesduet, common, public, extensions`.

### `codenamesduet.create_game(target_club text, setup jsonb, player_user_ids uuid[]) → table(id uuid)`

The one entry point. Verifies the roster is exactly 2 club members (any club size — the pair, not the club, is what's constrained), seats both, validates `setup.turns` + `setup.first_clue_giver_user_id` + `setup.timer` shape (the timer shape is shared validation via `common.require_valid_timer`), picks 25 words, generates the Duet key-card distribution, builds the title (the first 3 words in BOARD order, dash-joined — the board is shared, so naming the game after three of its words leaks nothing; the key card is what stays secret), calls `common.create_game(target_club, 'codenamesduet', player_user_ids, title, setup, setup - 'first_clue_giver_user_id')` for the common header half (the last arg is the saved club default, stripped of the per-game first-giver pick) (see [common.md → Game-RPC helpers](../common.md#game-rpc-helpers-called-by-per-game-rpcs)), then inserts the codenamesduet detail row. Finally calls `common.update_state(new_id, 'playing', jsonb_build_object(...))` to seed `common.games.status` with the initial label payload (turn_number, turns_remaining, greens_found). One call, no lobby state. (Mid-game RPCs that need to read setup — `submit_guess` reading `turns_used` for the terminal status blob and its own answer — query `common.games.setup` via a subquery.)

Reject reasons: not authenticated; non-member; the roster isn't exactly 2 players; bad `setup.timer` shape (see [Timer](#timer-server-authoritative-ticks)).

The key-card generation is the algorithmically interesting bit: build the 25-element multiset matching the distribution, shuffle Fisher-Yates, project to the two seat views. Inlined directly in `create_game` rather than extracted into a helper — `create_game` is the only place that generates a board, so there's no duplication to factor out.

### Title formula

`"WORD1-WORD2-WORD3"` — the first three words **in board order**, dash-joined: the top-left three cells exactly as every player sees them.

**Board order, not alphabetical** (changed 2026-08-02). A duet board is never shuffled or rotated, so its first three cells are a stable, recognizable handle — you can glance at the grid and know which game the title names. Games whose boards *do* get reordered sort their title words instead, because there the on-screen first-three would drift.

The words are on the shared board every player sees, so the title leaks nothing (the key card is what stays secret); three words are enough to tell one game from another in a club's history.

### `codenamesduet.submit_clue(target_game uuid, clue_word text, clue_count int, clue_from_ai boolean default false)`

Logs a `clue` event for the current turn, with `clue_from_ai` as the client said it.

The parameters share their names with the `codenamesduet.events` columns they fill (`clue_word`, `clue_count`), so the body reads them qualified — `submit_clue.clue_word` — and a bare name in a query can never mean the parameter by accident.

**What it answers.** [An envelope](../envelopes.md):

| | | |
|---|---|---|
| `ok` · `{result: 'clued', word, count, turn_number, by_seat}` | | the clue as it was recorded — what the partner will see, not what this form sent |
| `PN370` "Game over" | `race` | the partner ended it, or the clock expired, while you composed |
| `PN371` "Your partner is giving the clue now" | `race` | the giver flips inside `_end_turn`, which the PARTNER's guess runs |
| `PN372` "A clue is already in for this turn" | `race` | your own clue landed and its event row hasn't arrived |
| `PN369` "That game no longer exists" | `fault` | nothing to race against |
| `PN384` "BUG: a clue from a player with no seat" | `fault` | `create_game` seats both players |

**Three races on one form**, which is unusual and is a fact about this game: the clue form is drawn from `current_clue_giver` and the turn's clue row, both arriving by subscription, while the Submit button unlocks the moment the RPC replies. Every window between "my move landed" and "my form knows" is real. `common.require_game_player`'s two faults (PN252, PN253) arrive through the same envelope.

### `codenamesduet.submit_guess(target_game uuid, target_position int)`

The complex one. The revealed label (`'G' | 'N' | 'A'`) rides in the answer's `data` as `revealed`.

Logic in order:

1. Range-check `target_position` (0–24).
2. Lock the gametype row (`FOR UPDATE`) — this serializes concurrent guesses; the play_state read against `common.games` happens after the lock so any prior committed transition is visible.
3. Read `play_state` from `common.games`; verify it's `playing` or `sudden_death`.
4. Verify caller is a player.
5. Determine **whose key view labels this reveal**:
   - During `playing`: the clue-giver's view. Also rejects "you are the clue-giver" and "no clue yet."
   - During `sudden_death`: the partner's view (the seat opposite the caller).
6. Verify the cell isn't already resolved **for this guesser** — blocked if it's globally revealed (`revealed_as` set) OR this seat already hit it as a neutral. A *partner's* neutral does not block the caller (it may be the caller's agent). Those are two separate raises, because they are two different sentences: one is the board's, the other is only yours.
7. Log a `guess` event (`took_turn` true on a bystander in ordinary play), then denormalize onto `codenamesduet.words`: green → global `revealed_as = 'G'`, assassin → `revealed_as = 'A'`, neutral → the guesser's `neutral_a`/`neutral_b` flag.
8. Resolve the outcome:
   - Assassin → `common.end_game(target_game, 'lost_assassin', …)`.
   - Sudden death + non-green → `common.end_game(target_game, 'lost_clock', …)`.
   - Green → check if `count(revealed_as = 'G') >= 15` → `common.end_game(target_game, 'won', …)`; otherwise mid-game `common.update_state(target_game, 'playing'|'sudden_death', …)`.
   - Neutral (in regular play) → `_end_turn`, whose return value carries the new turn state into the answer.

**What it answers.** [An envelope](../envelopes.md), with five `ok`s — the three that end the game named for the play_state they set, the two that don't named for what was turned over:

| | | |
|---|---|---|
| `ok` · `{result: 'agent'}` | | an agent contacted; the turn continues, so the turn state is reported unchanged |
| `ok` · `{result: 'bystander'}` | | a bystander; carries the turn state `_end_turn` just wrote, sudden death included |
| `ok` · `{result: 'won'}` | | the 15th agent |
| `ok` · `{result: 'lost_assassin'}` | | |
| `ok` · `{result: 'lost_clock'}` | | a non-green in sudden death |
| `PN379` "Game over" | `race` | in sudden death EITHER player may guess, so the partner can lose the game while yours is in flight |
| `PN380` "Your partner is guessing this turn" | `race` | your own turn-ending guess made you the giver; the tiles unlocked on its reply |
| `PN381` "No clue yet this turn" | `race` | the same window, one turn on |
| `PN382` "That word is already revealed" | `race` | the partner turned it over, or your own previous guess did |
| `PN383` "You already tried that word" | `race` | your own bystander — and only yours; the partner may still contact it |
| `PN377` "BUG: a guess off the board" | `fault` | the position comes from the tile that was clicked |
| `PN378` "That game no longer exists" | `fault` | nothing to race against |
| `PN386` "BUG: a guess from a player with no seat" | `fault` | `create_game` seats both players |

Every non-terminal `ok` carries `revealed`, `greens_found` and the turn state; every terminal one carries `revealed`, `greens_found` and `turns_used`. Nothing on the board reads them today — the reveal arrives by Realtime and the board redraws itself — but the answer states what it did, and the `[db]` line carries it.

Terminal transitions write `common.games.play_state` + `is_terminal = true` + the `status` jsonb (`{outcome, turns_used, greens_found}`) via `common.end_game`. The terminal write states `greens_found` itself rather than leaving it to the merge: `common.end_game` **merges** into `status` (`status = coalesce(games.status, '{}') || …`), and the winning reveal IS a green — it takes the terminal branch instead of the `update_state` that would have bumped the tally, so a blob that stayed quiet left a won game reading "14/15 agents". They do **not** clear `is_current_view` — a terminal game stays in the club's current slot until the last viewer leaves.

### `codenamesduet.pass_turn(target_game uuid)`

Voluntary turn-end during the guess phase. Logs a `pass` event (`took_turn` true) against the turn it ends, then spends that turn and swaps the clue-giver.

**What it answers.** [An envelope](../envelopes.md), with ONE `ok`:

| | | |
|---|---|---|
| `ok` · `{result: 'passed', turn_number, turns_remaining, clue_giver, play_state}` | | the turn state `_end_turn` wrote. Spending the last turn shows up as `play_state: 'sudden_death'` rather than as a second answer — the board renders that off the games row, and "did my pass go through" has one answer |
| `PN374` "Game over" | `race` | the partner ended it, or the clock expired |
| `PN375` "You're giving the clue this turn" | `race` | your own turn-ending guess made you the giver |
| `PN376` "No clue yet this turn" | `race` | the turn rolled over under a stale panel |
| `PN373` "That game no longer exists" | `fault` | nothing to race against |
| `PN385` "BUG: a pass from a player with no seat" | `fault` | `create_game` seats both players |

### `codenamesduet.submit_timeout(target_game uuid)`

Fires when the FE's count-down timer expires. Calls `common.end_game` with `play_state = 'lost_timeout'` (distinct from `lost_clock`, which is the rulebook's turns-exhausted ending) and `status->>'outcome' = 'timeout'` — the play_state carries the verdict, the outcome names the cause. (The other three terminals map the same way: `lost_assassin` → `assassin`, `lost_clock` → `exhausted` — the roster's noun for a spent budget, here the turn counter — and `won` → `solved`.)

Accepts `playing` and `sudden_death` (both non-terminal); idempotent on the terminal-state guard — a second concurrent call from a racing client raises `P0001 'game is not active'`, which the FE swallows. See [Timer](#timer-server-authoritative-ticks).

Reject reasons: not authenticated; not a game player; game not found; already terminal.

### New game — a fresh board; Restart — the same board as a mulligan

The **New game** button in the terminal action row + the matching menu item: a FRESH game (new id, a newly sampled board) with this game's setup + roster, in the same club. A direct `create_game` RPC — codenamesduet samples its board inline, and takes no `mode` (coop-only, one gametype). Non-destructive: `common.create_game` un-currents this game into the club's list, so it stays resumable — the registry still asks `NEW_GAME_CONFIRM` mid-game; the creator jumps in via `ctx.goToGame` and the peer arrives via the game-invitation toast.

**Restart** (`replay_board`, added 2026-08-03) is its twin, and it is deliberately a **mulligan** rather than a fresh puzzle. Duet was the one game with a principled reason not to have a replay: the whole board — including which word is the assassin — is the secret, so running it back hands both players a board they've partly learned. What overrules that is the accident: an assassin on the first guess ends a game nobody got to play, and *"let's just run it back"* is what the friends actually say. The key cards and the 25 words stay; every reveal, neutral, clue and guess is wiped, the turn budget is re-read from setup and seat A clues again. Someone who wants a genuinely blind board has **New game**, the next item down in the same menu. Any player, mid-game or at terminal; mid-game the FE confirms. pgTAP: `replay_test.sql`.

### `codenamesduet.end_game(target_game uuid) → void`

The friends' explicit "we're done" button — `act-end-game`, placed as both the header-menu row (declared by codenamesduet's PlayArea via `ctx.menu.setGameSections` + `buildGameMenu`) and the info-column button, which is the SAME binding rather than two things firing one handler. Its question (`END_GAME_CONFIRM`) is asked once by the shared run, mid-game only, and it grays itself at terminal. codenamesduet has plenty of *automatic* terminals (won / lost_*), so this is purely the escape hatch for abandoning an in-progress game early.

Same shape as `submit_timeout` — accepts both active states (`playing` / `sudden_death`), same `require_game_player` gate, same idempotency (a second call raises `P0001 'game is not in progress'`, swallowed by the FE). Differences: it writes `play_state = 'ended'` with `status->>'outcome' = 'manual'`, and every player's `common.game_players.result = {won: false}` (cooperative game: nobody wins a manually-stopped game — agreeing to stop is a valid outcome, not a loss).

The terminal renders **neutral**, not as a loss: `buildTerminalMessage('ended')` (`lib/terminal.ts`) returns the shared `gameEndedTerminalMessage('coop')` — a neutral below-board verdict reading "Game ended" — and the manifest's `STATUS_LABEL` map renders the club-card line as `Ended` (`ended: outcome('Ended')`).

**Realtime touch at the tail**: a no-op self-write on `codenamesduet.games` (`set turn_number = turn_number`) so the FE's schema-scoped `useGame` subscription wakes to refetch and flip into review mode — the uniform trick documented at [common.md → Manual end, step 6](../common.md#manual-end--every-gametypes-end_gametarget_game). (`submit_timeout`'s `current_clue_giver = null` write provides the same wake incidentally.) Tested in `tests/codenamesduet/end_game_test.sql`.

### `codenamesduet.get_clue_context(target_game uuid)`

Read-only RPC for the [`codenamesduet-suggest-clue`](#edge-function-codenamesduet-suggest-clue) Edge Function. Returns the caller's unrevealed greens/neutrals/assassin words + the history of previous clues. Authorization: caller must be the current clue-giver of a playing (or sudden-death) game; the Edge Function inherits that gate by calling this as the user.

**What it answers.** [An envelope](../envelopes.md):

| | | |
|---|---|---|
| `ok` · `{result: 'context', greens, neutrals, assassins, previous_clues}` | | the four lists, unchanged — what the model is given |
| `PN388` "Game over" | `race` | the partner ended it, or the clock expired |
| `PN389` "Your partner is giving the clue now" | `race` | the giver flipped under a stale form |
| `PN387` "That game no longer exists" | `fault` | nothing to race against |

**The two races are `submit_clue`'s PN370 and PN371, word for word.** The AI button and the Submit button share the below-board row and lose exactly the same races, so a player must not be able to tell which one they hit by the sentence.

Its gate is `_require_clue_giver`, which `log_hint` shares, so the two cannot disagree about who may ask. The seat check there reads `caller_seat is distinct from current_clue_giver` — NULL-safe, so a caller seated in neither column is rejected rather than waved through. That is why the gate needs no seat check of its own where the three turn-loop RPCs each grew one (PN384–PN386). `previous_clues` is read from the `clue` events.

### `codenamesduet.log_hint(target_game uuid)`

Called by the edge function **after** the model has returned a suggestion, so a hint the model declined or was cut off on leaves no row. Logs a `hint` event (`took_turn` false) with no payload — the suggestion names the agents it targets, and stored where the partner's client can read it, it would spoil their guessing. Same gate as `get_clue_context`; one `ok`, `{result: 'logged'}`, and a refusal is the edge function's to relay untouched.

The edge function **unwraps** the `ok` rather than relaying it — the board is the first step of its work, not its answer — and relays any `not-ok` untouched. Both go through `runRpc` (`supabase/functions/_shared/dbResult.ts`), which also owns "the RPC never ran" and "it answered something unreadable", so the function has no codes of its own for either.

### Helpers (not callable from the client)

| function | role |
|---|---|
| `codenamesduet._require_clue_giver(target_game uuid) → text` | The gate `get_clue_context` and `log_hint` share: the game exists, the caller plays in it, it is running, and the caller holds the clue seat. Returns that seat; raises PN387–PN389 otherwise. |
| `codenamesduet._end_turn(target_game uuid) → jsonb` | Shared by `submit_guess` (on neutral) and `pass_turn`. Decrements `turns_remaining`, increments `turn_number`, advances `current_clue_giver` to the partner **unless the partner has no unfound agents left** (in which case the current giver keeps the clue — the finished-player hand-off rule), calls `common.update_state(target_game, 'sudden_death', …)` when turns_remaining hits zero. **Returns the turn state it wrote** — `{turn_number, turns_remaining, clue_giver, play_state}` — which both callers put in their answer's `data`; it is the only place that knows the next giver and whether the budget ran out. Underscore-prefixed by convention to signal "internal." |

codenamesduet doesn't define its own `is_player_in_game` helper — authorization in the RPCs uses `common.require_game_player(target_game)` (which checks `common.game_players` for the caller). Seat derivation after the membership check is inline: `case caller_id when g_row.user_a_id then 'A' when g_row.user_b_id then 'B' end` reads off the games row.

## Row-level security

Every `codenamesduet.*` table has RLS enabled. SELECT policies all gate on `common.is_club_member(club_handle)` (via the game's `club_handle`, joined through `codenamesduet.games` for the child tables) — history is **club-wide**: any club member can see every game in the club, whether or not they sat down at this specific one. "Is in this game" is a gameplay question handled by `common.require_game_player` at the RPC layer for *actions*, not a visibility question. No INSERT/UPDATE/DELETE policies anywhere — writes go through the RPCs.

`word_pool` has **no policies at all and no grants** for `authenticated`. Only the `create_game` security-definer RPC reads from it. There's no need for clients to see the word pool.

`grant select on codenamesduet.games to authenticated` exposes BOTH `key_card_a` and `key_card_b` columns to any club member — a player's RLS check passes the partner's key column along with their own. Friends-only trust model (see [CLAUDE.md → Trust model](../../CLAUDE.md#trust-model--server-authoritative-for-cleanliness-not-anti-cheat)): the convention is "read your own column, don't query the partner's," not "the partner's column is unreadable." A column-restricted grant could harden this if the audience ever grew; not planned for the friends-alpha posture.

## Timer (server-authoritative ticks)

Standard `<SetupTimerSection>` + `useGameTimer` setup — see [`common.md → The game clock`](../common.md#the-game-clock) for the design rationale and drift bounds.

**Distinct from the rulebook's turn budget.** Duet has its own clock (the 9 starting turns, decremented at turn-end); that's the `turns_remaining` column and `lost_clock` terminal status. The wall-clock countdown is an *additional* opt-in pressure mechanism — a per-game setup choice on `setup.timer`. Per terminal status:

- `lost_clock` — Duet's rulebook ending (sudden death + non-green reveal).
- `lost_timeout` — wall-clock countdown hit 0.

Behaviors per `setup.timer.kind`:

- **`none`**: no wall-clock rendered. The default, since the rulebook's pacing already comes from the turn budget.
- **`countup`**: informational. Header shows elapsed MM:SS. Never expires.
- **`countdown`**: ticks down from `setup.timer.seconds`. When it hits 0, the FE fires `codenamesduet.submit_timeout`, which flips status to `lost_timeout`. Idempotent on the server side — multiple peers racing to fire is fine.

## Pause-on-disconnect

Inherited unchanged from the common shell. The only codenamesduet-relevant note: PauseBoundary's child-unmount means codenamesduet's per-tab postgres-changes channel tears down and reconnects on every pause cycle, with the on-SUBSCRIBED refetch in `useBoard` / `useGame` covering the gap. See [`states.md → paused`](../states.md#paused) for the canonical write-up.

## Edge Function: `codenamesduet-suggest-clue`

The "AI" button (`act-suggest-clue` — its own id rather than scrabble's `act-suggest-move`, since what comes back is a word and a number for the partner to read, not a play to stage) in the FE calls this. The function:

1. Invokes `codenamesduet.get_clue_context(target_game)` as the user (RLS applies — only the current clue-giver gets through). The RPC lives in the `codenamesduet` schema, so the call is `.schema('codenamesduet').rpc('get_clue_context', …)` — an un-qualified `rpc()` hits `public`, misses, and 403s.
2. Calls Claude Sonnet 5 (`claude-sonnet-5`) with **structured outputs** (`output_config.format`, a `json_schema`) — the typed-JSON guarantee the old forced-tool call gave us, minus the tool. The schema asks for `{clue, count, agents, reasoning}`, and the model must commit to specific agent words. Dropping the forced tool is what lets **native adaptive thinking** (`thinking: {type:'adaptive', display:'summarized'}`, `effort: 'high'`) run — the model deliberates in real thinking blocks (logged server-side, never sent to the player) instead of the discarded scratchpad field the old tool schema carried, so the returned `reasoning` stays a clean final explanation. `max_tokens` is generous (8192) so the thinking budget never truncates the final JSON. A `console.log` of the raw Anthropic response is kept intentionally as a debugging aid.
3. Returns the JSON payload to the FE (the thinking stays server-side).

Requires `ANTHROPIC_API_KEY` in the function's runtime env (set via `supabase secrets set`). Local dev uses `supabase/functions/.env` (gitignored).

The function lives in [`supabase/functions/codenamesduet-suggest-clue/index.ts`](../../supabase/functions/codenamesduet-suggest-clue/index.ts). Naming follows the `<game>-<feature>` convention since Edge Functions are a flat namespace.

The trust model here is "we're not the gatekeeper of cheating" — a clue-giver could ask Claude themselves in another browser tab, so we're not adding friction. The function exists for convenience and for the better prompting we can do server-side (the prompt has the actual board state, not what the user typed).

## The one outcome decision (`lib/turnOutcome.ts`)

**codenamesduet has no `lib/answer.ts`** (waffle is the other game without one,
for its own reason), because nothing here shows a single guess's outcome.

A guess answers with a REVEAL, and the board says it — so the pill deliberately
stays silent on all five `ok` answers. Where the event log prints the guessed
words it draws them in the **key-card palette** (`--codenamesduet-agent` and its
two siblings), which is this game's own vocabulary and deliberately outside
`--outcomes-*`; the PDF does the same with its `Mark` (agent / neutral /
assassin, drawn as ✓ / – / ✗). Neither is an outcome.

The one thing wearing an outcome is the **turn**, and `turnOutcome` is where it
is decided: any assassin → `lost`, only bystanders → `lost`, mixed → `near`, all
agents → `won`, no guesses → `neutral`. Joel ruled (2026-09-16) that the bar
reads the TURN rather than its last guess — `near` for a mixed turn is a rule the
turn owns and no single guess can express.

It folds over the key LETTERS because its three questions are about the key card
— did anything end the game, did we advance, did we waste a word — and not about
what a guess was worth. `submit_guess`'s answers carry no outcome: they state
what was turned over, and this fold is the only place it becomes one.

The rule this follows is [outcomes.md → One event, one
outcome](../outcomes.md#one-event-one-outcome--and-who-decides-it).

## Frontend

### Folder layout

```
src/codenamesduet/
  manifest.ts             GameManifest registration. Lazy-loads ./components/PlayArea
                          directly (no Root.tsx).
  db.ts                   export const db = supabase.schema('codenamesduet')
  theme.css               codenamesduet-specific color tokens (greens, reds, neutrals). Imported by PlayArea.tsx so it loads with the chunk.

  logo.svg                Placeholder square logo used by the GamePage header's
                          <GameLogo gametype="codenamesduet" />. Imported via ?url in manifest.ts.

  components/
    PlayArea.tsx          The thin two-column coordinator on the common
                          `PlayArea.module.css` scaffold (`shared.layout` /
                          `.boardCol` / `.infoCol`). **Decomposed** into a `BoardCol`
                          (the Board + the clue move-zone; owns the **guess**
                          `submit_guess` RPC — the guess is a board click, so it stays
                          with the board's input engine, while CluePanel keeps the clue
                          RPCs) and an `InfoCol` (the shared readouts + GameEventLog).
                          PlayArea loads via the three hooks, derives phase, and owns the
                          cross-column bits: the below-board local feedback slot (both
                          columns show into it), the header's turn status (`useTurnStatus`),
                          and the turn-history `isViewingHistory` state keyed by `turn_number`.
                          The info column runs the shared readouts in the canonical order
                          (`.infoState` = "{green}/15 agents · n/cap turns spent", then the
                          finished-player banners, `.infoActions` = End, `.infoHelp` =
                          phase copy, and the setup disclosure = turn cap + first
                          clue-giver) above the GameEventLog. **Turn-history viewer:**
                          clicking a log `#N` hands Board the `lib/history.ts` board
                          for that turn (its own cells ringed) with input frozen until
                          you leave (a keystroke / click / ✕).
                          Pops the shared `<CelebrationBlockingModal>` on a win (only) and renders
                          the AI `<CodenamesduetAISuggestCompanion>` at the `.layout` level (a
                          floating panel must mount high — see ui.md → Components).
                          Mounted by <GamePage> as its play surface;
                          cross-cutting chrome (logo, chat-bubble, players strip,
                          pause, timer, suspend-confirm, the global UserMenu) lives
                          on <GamePage> / App.
    BoardCol.tsx          The board column: Board + the below-board CluePanel move-zone.
                          Owns the guess dispatch (a tile click → `submit_guess`) and takes
                          the board to render — the live denormalized board OR a `lib/history`
                          snapshot — plus `readOnly` while viewing a past turn.
    BoardCol.module.css
    InfoCol.tsx           The info column: the shared readouts (state / finished banners /
                          End / help / setup) above the GameEventLog. Near-zero state —
                          arranges shared pieces + emits `onShowHistory` / `onEndGame` up.
    InfoCol.module.css
    StateLine.tsx         The core live-state readout — "3/15 agents · 3/9 turns spent"
                          ("sudden death" replaces the turn counter once the budget
                          is spent). Its own component because it renders TWICE, in
                          two places that must never drift: the info column's
                          `.infoState` line (desktop) and the mobile
                          <MobileStatusBar> above the board.
    PlayArea.module.css
    PlayArea.test.tsx     The synchronous guess in-flight guard (a second tile
                          click while a guess is in flight fires no second
                          submit_guess) + tile input gating (clickable on my
                          guess turn, blocked at terminal).
    Board.tsx         The 5×5 board, PRESENTATIONAL: receives the board to render
                          (live or a history snapshot) + `pendingPos` + an
                          `onGuess(position)` callback (BoardCol owns the submit) + an
                          optional ring for a viewed turn's own cells. Each tile composes the shared `.tile`/`.tileWord`
                          chrome with a per-game `.overlayTile` (adds
                          `position: relative` for the corner overlays) + a
                          token-override fill class (`.bgWhite`/`.bgNeutral`/
                          `.bgAgent`/`.bgAssassin` re-set the `--tile-*` tokens —
                          the TILE_BG KeyLabel→class map lives here). The keycard
                          squares, neutral triangles, and pending "…" are
                          absolutely-positioned overlays that scale with the tile
                          (cqi). Fills the column height via the shared grid
                          (repeat(5, 1fr)); word auto-fits via container queries.
                          See Board tile colors below.
    Board.module.css
    CluePanel.tsx         The below-board move-zone — rendered into PlayArea's
                          `.inputRow` slot (NOT the info column). ONE horizontal
                          line per state: the clue FORM (count + word `<input>` +
                          Submit + "AI") for the giver; the active clue +
                          Pass (`act-end-turn`, bound by the local `PassButton`
                          in this file) for the guesser; a muted "● moth guessing" /
                          "Waiting for moth to give a clue…" line otherwise; the
                          sudden-death notice. Live-uppercases the
                          clue. The "AI" button (`act-suggest-clue`, sparkles + amber)
                          calls the edge function and opens the
                          AI suggestion in a <FloatingPanel> (the
                          `CodenamesduetAISuggestCompanion`, mounted by PlayArea at `.layout`
                          level); errors surface in that dialog or the local flash,
                          never as a second row (the slot is fixed-height — the
                          board must not reflow).
    CluePanel.module.css
    CluePanel.test.tsx    Pins the data-game-input tag on both clue inputs
                          (count + word) so the global / ? ~ shortcuts still
                          fire while typing a clue.
    GameEventLog.tsx       Turn-by-turn replay in the shared <EventLog> panel.
                          Its bar's word is lib/turnOutcome.ts's — see "The one
                          outcome decision" above.
                          codenamesduet renders its OWN rows (row anatomy is the
                          game's — see playarea.md → Event log): a TWO-<tr> turn per
                          turn_number (grouped client-side). Row 1 = real columns
                          [<EventLogOutcomeBar> ⇣rowSpan 2] | `#n` (the shared <EventLogNumber>
                          history handle, keyed by turn_number — click to replay that
                          turn on the board) | {count} {WORD} | the
                          clue-giver via <ActorDot> (right-aligned by <EventLogActor>);
                          row 2 spans those content columns with the guesses (each
                          in its key-card color: agent / bystander / assassin, not
                          an outcome) — or "(clue given)" while the
                          turn is still live, "(no guesses)" once it ended empty.
                          gameEventLog.divider on row 1 draws the between-turns
                          line. Per-turn outcome from lib/turnOutcome.ts.
                          Header carries the shared "whose turns?" picker
                          (useEventLogPlayerPicker — Team + both players; duet is
                          coop-only). A turn is filed under its CLUE-GIVER — the
                          person row 1's actor column already names — so picking
                          someone answers "which clues did I give?". The #n
                          handle addresses a turn by turn_number — duet's log is
                          a table of turns — so filtering renumbers what is
                          shown without changing what a handle opens.
    GameEventLog.module.css
    GameEventLog.test.tsx
    SetupForm.tsx         The setup form mounted in the common SetupGameModal.
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
    useBoard.ts           Loads words (denormalized board state) + every
                          event (lib/events.ts types them) + the caller's key;
                          subscribes to realtime on both `words` and `events`.
                          Returns `failure` — the envelope of a read that died.
    useBoard.test.ts

  lib/
    phase.ts              Pure derivation: from (game state, caller seat) → 'clue' | 'guess' | 'over' | 'wait'.
    phase.test.ts         Pure unit test of the above.
    agents.ts             Pure `agentsAllContacted(key, words)` — has a seat found all its 'G's?
                          Powers useBoard's myAgentsDone / peerAgentsDone (finished-player banners).
    agents.test.ts        Pure unit test of the above.
    labels.ts             KeyLabel type ('G' | 'N' | 'A') — single-letter agent /
                          neutral / assassin role.
    setup.ts              CodenamesduetSetup type + DEFAULT_CODENAMESDUET_SETUP. PlayArea
                          casts `ctx.setup as CodenamesduetSetup` to read the turn cap.
    turnOutcome.ts        Pure per-turn outcome verdict for the GameEventLog bar:
                          any assassin → lost; only bystanders → lost (a wasted
                          turn is a setback); mixed agent+bystander → near; all
                          agents (≥1) → won; no guesses (passed) → neutral. See
                          "The one outcome decision" above.
    turnOutcome.test.ts   Pure unit test of the above.
    history.ts            The turn-history replay (pure + unit-tested). Given the fixed 25
                          board words + the guess log + a turn's clue, reconstruct the board
                          at the END of any past turn — ADD-style (a guess only ADDS a reveal,
                          so a past board folds every guess up to that turn onto the fixed
                          words), boundary **inclusive** (viewing turn N shows the board AFTER
                          N's guesses, with N's own cells ringed). The reveal alphabet is the
                          denormalized board state: the GLOBAL `revealed_as` ('G'/'A') plus the
                          PER-SEAT `neutral_a`/`neutral_b` (a neutral only locks the guesser's
                          direction — the Duet per-direction rule). Keyed by **`turn_number`**
                          (a game-wide turn ordinal — duet's log is a table of TURNS, not of
                          rows), which is the `#N` the log shows. Clicking a `GameEventLog` `#N` opens
                          that turn on the board via the shared viewer.
    history.test.ts       Unit tests for the fold + per-seat neutral handling + inclusive boundary.
```

**Terminal state.** **No modal carries the verdict** ([ui.md → Terminal results](../ui.md#terminal-results--the-moment-vs-the-record)): a dialog would duplicate the below-board pill exactly — same verdict string, same moment — so it would only cost a dismiss. The result lives in-page, the shared way: the below-board slot swaps the clue UI for a permanent outcome-colored pill carrying the per-status verdict — "You win!" / "Lost: assassin" / "Lost: out of turns" / "Lost: out of time" / "Game ended" (terse, so the fixed-height slot doesn't wrap on a phone) — and the info-column action row swaps the End button for a bold outcome-colored line ("You won!" / "Assassin revealed" / …) + icon-only Reveal, Restart and New game, then the primary back-to-club button ([ui.md → Info-column readouts](../playarea.md#info-column-readouts)).

A **win** additionally pops the shared `<CelebrationBlockingModal>` (title "You win! 🎉"), driven by `useCelebration(playState === 'won')` — once, at the moment the 15th agent is contacted, on both clients via the realtime refetch. It deliberately never fires on mount, so opening an already-won game is quiet review. Losses and the manual end pop nothing.

### Board tile colors

The board sits on the shared `.tile` / `--tile-*` system ([ui.md → Interactive tile states](../ui.md#interactive-tile-states)): each cell re-sets the `--tile-*` tokens for its state rather than fighting the shared `.tile` rule. The **revealed** states use codenamesduet's own result palette (`--codenamesduet-{agent,neutral,assassin}`, see `theme.css`): agent = green, assassin = red, and **neutral/bystander = a warm tan (`#b4986e`)**.

The **never-selected** (unrevealed) cell is a **deliberate exception** to the project default. Every other game leaves an untouched tile at the shared resting beige (`--tile-slot-fill-color`, `#f0e6d2`) — codenamesduet does **not**, because that beige is close enough to the neutral tan that an unrevealed beige tile would read as "already guessed neutral." So an unrevealed cell instead uses a **lighter, grayer warm off-white** (`#f4f1ec` fill / `#e6e1d7` border): still in the tile-color family (a hint of warmth, not flat gray), but clearly "not touched yet" against the tan. It's set on `.bgWhite` in `Board.module.css`. This is the one place we override the standard tile color; the default elsewhere stays the shared beige.

### Feedback: header pill (peer) vs local flash (you), and sudden death

codenamesduet follows the shared [local-vs-group feedback split](../ui.md#feedback-pill). Your **own** action's result shows in the local feedback slot (the `<FeedbackPill>` centered in the below-board slot via the shared `.localFeedback`) — not-ok-only here (a rejected guess / clue / pass, or an end-game not-ok, each with its ×), since a successful guess shows on the board + event log instead; the terminal verdict shows there too, filled. The GamePage **header** (the global slot) reports what the **other** player is doing — "● moth writing clue", "● moth guessing", "● moth waiting for clue", "● moth waiting for you" — a `peerStatus` message, neutral, with a **leading** player-color disc, that an owner effect (`useTurnStatus`) keeps up until the state changes. The text is deliberately **telegraphic** (no verb): the header shares its row with the logo + chat bubble, so on a 390px phone it fits ~26 characters and silently ellipsizes the rest. These are *peer status*, not your to-do list: the board itself tells you when it's your move. (Header = leading disc; the event-log's `<ActorDot>` puts the disc *after* the name — a deliberate placement difference.)

**Sudden death** shows below the board and in the info column, and says nothing in the header. The below-board CluePanel replaces itself with a persistent tinted notice (`.suddenDeath`) — there are no more clues, so the strip that normally holds the clue UI has nothing else to show — and the info-column help leads with a red **SUDDEN DEATH:** before the explanation. The header stays out of it on purpose: a message parked there holds for the rest of the game, and while one sits in that slot it outranks chat lines and narrations and keeps the players strip hidden. It deliberately does **not** frame the whole board in red either — that would shrink the `flex: 1` board ([ui.md → Layout stability](../ui.md#layout-stability)); the two redundant signals carry it instead.

One gap, known and left: the below-board notice and the local feedback pill share that slot, so while a not-ok is open the notice is off screen and the info column is the only place sudden death shows — and that column is off-canvas on a phone. It comes back when the × is pressed.

### Hooks: realtime patterns

Both codenamesduet data hooks ([`useGame`](../../src/codenamesduet/hooks/useGame.ts), [`useBoard`](../../src/codenamesduet/hooks/useBoard.ts)) drive off the shared [`useRealtimeRefetch`](../../src/common/realtime/useRealtimeRefetch.ts) factory — the per-effect UUID-suffixed channel name, the SUBSCRIBED-driven refetch, the cleanup flag are all owned there. Each hook just declares its tables + writes its `load({ mounted })` callback. See `code-conventions.md` → "Realtime data hooks" for the factory contract and when to reach for it (vs hand-rolling) when porting a new game.

One codenamesduet-specific wrinkle worth knowing: the roster query in `useGame.ts` fetches profiles in a **separate** PostgREST call rather than via embedded-resource syntax — PostgREST's schema cache doesn't resolve cross-schema FKs (the `codenamesduet.games.user_a_id → common.profiles.user_id` embed fails with PGRST200), so we fetch the (≤ 2) profiles in a second query inside the same `load()` and merge in JS. See the inline comment.

**Every read goes through [`readRows`](../envelopes.md), and each hook returns the `failure` envelope of its own.** All five reads across the two hooks share one shape: one branch per read (the envelope's `detail` names WHICH one died, the only fact nobody can recover afterwards), a `setFailure(null)` on a load that works — these refetch on every realtime event, so an outage that ends takes its sentence with it — and zero rows handled as its own answer rather than as an error. The loader takes the first of the failures and renders `<EnvelopeErrorPage>` in place of the board: a failed read is NOT a missing game, and "Game not found." about a dead connection is a confident wrong answer.

Two of them deserve their own note. `useBoard`'s `games` read dropped its `.single()` — that treats zero rows as an error, so a game this pair cannot see arrived looking exactly like a broken connection; now zero rows clears the key cards, which is what makes the loader render the no-such-game page instead of drawing from the last load. And for the events read, zero rows is the ORDINARY case — turn 1 before the giver has spoken looks identical — which is precisely why a failed read had to stop being an empty list.

### Phase derivation

[`src/codenamesduet/lib/phase.ts`](../../src/codenamesduet/lib/phase.ts) takes `(game, callerSeat)` and returns a discriminated union of `'clue' | 'guess' | 'over' | 'wait'`. The decision tree is explicit and exhaustive; the test file walks through every branch.

Components consume the phase as a single value and render accordingly. Centralizing the derivation here means no component has to know that "active + I'm the clue-giver + no clue this turn" maps to the same UI state as "active + I'm the clue-giver + already submitted but waiting for guesses" (which it doesn't — they're different phases).

### Post-game peer-key reveal

During active play, each player's own `key_card` is what tints the board ([`useBoard.ts`](../../src/codenamesduet/hooks/useBoard.ts) → `myKey`). The partner's `key_card` is **not** fetched — even though RLS would technically allow it (see [Row-level security](#row-level-security) on the trust-model framing), the convention is "don't ask, don't see."

Once the game is over, the partner's card becomes available — but **it is not opened automatically** (2026-08-03), and since 2026-08-15 that holds for a clean win too. Every ending waits for **Reveal**, offered both as the red boxed-eye button in the terminal action row and as a game-menu item, and **Hide** covers it up again.

The reveal is **local to each player** (`useSolutionReveal` — [ui.md → Terminal results](../ui.md#terminal-results--the-moment-vs-the-record)). Sharing it — on the reasoning that the partner is the person you're doing the post-mortem *with* — cuts the other way: a Duet post-mortem is two people thinking out loud — *"wait, I was about to pick APPLE"* — and that conversation only happens while the card is still covered, so one player opening it would end the other's thinking mid-sentence. Each of you looks when you're ready. Nothing is written either way; both key columns are club-readable under the friends trust model.

That gate is not about protecting a replay — Duet deliberately has none, its board *being* the secret. It protects the **seconds right after an assassin**: "wait, I was about to pick APPLE next" is the best part of a Duet post-mortem, and that conversation only happens while the card is still covered. Reveal opens it and the post-mortem continues with everything on the table.

Once revealed, `PlayArea` renders each unrevealed cell with **two stripes** — A's label on top, B's on bottom — so a reader can compare what each cell actually was on both views. The "would we have lost on this assassin?" review is the load-bearing UX for this.

The same split-stripe rendering is reused **during play** for a neutral'd cell (`neutral_a` / `neutral_b`): the viewer's own keycard color on top, the "guessed as a bystander" neutral color on the bottom. Both players see the split, but only the one who *didn't* hit it as a neutral can still click it (it may be their agent) — `Board` gates `clickable` on `!iNeutraled`. See the per-direction rule above.

The implementation detail worth knowing: `peerKey` is a **derived value**, not a piece of state we set/clear. It's `null` whenever `revealPeer` is false OR the cached fetch doesn't match the current `(gameId, userId)` pair. `revealPeer` is the viewer's own reveal toggle (`useSolutionReveal`) rather than a bare `isTerminal`, so the gate above rides the same derivation with no extra state — covering the card again is just the toggle going false. Today `<GamePage>` is keyed by `gameId` at the route level, so a navigation between games remounts the hook from scratch — the derived-value contract isn't exercised in practice, but the test in `useBoard.test.ts` pins it as a guard against future refactors that keep the hook alive across game changes.

### Code-splitting

Standard — codenamesduet's `PlayArea` / `help` ship as their own lazily-loaded chunks. See [common.md → Code-splitting](../common.md#code-splitting).

## codenamesduet testing

See [`testing.md`](../testing.md) for the theory and shared setup. codenamesduet-specific notes:

### pgTAP files

| file | covers |
|---|---|
| `tests/codenamesduet/create_game_test.sql` | Auth, membership, happy path, club-size check, `setup.turns` validation, `setup.timer` shape spot-checks (full grid lives in connections' test), active-flag tracking via common.games, key-card distribution. Doubles as the pgTAP primer for the rest of the suite. |
| `tests/codenamesduet/game_loop_test.sql` | The active-play turn loop: clue/guess/pass phase rejections, green-continues, neutral-ends-turn, turn decrement, clue-giver swap, turn-number advance, assassin reveal flips to `lost_assassin`. |
| `tests/codenamesduet/clue_giver_handoff_test.sql` | The finished-player hand-off rule: when one seat's agents are all contacted, `_end_turn` keeps the clue with the seat that still has agents instead of swapping to the finished one (both directions), with a both-seats-live control swap. Forces "seat done" by marking its greens `revealed_as = 'G'` (via `reset role`, same poke as `sudden_death_test`). |
| `tests/codenamesduet/cross_direction_test.sql` | The per-seat neutral rule: a neutral sets the guesser's `neutral_*` flag (not global `revealed_as`); the partner can still guess the word and contact it as their agent; a globally-contacted agent is locked for both; both-neutral locks for both; each guess is logged as an event. Also pins the two locks' DIFFERENT answers — PN382 for the board's reveal, PN383 for your own bystander. |
| `tests/codenamesduet/win_test.sql` | The 15-greens-found win check. Drives through revealing greens via PL/pgSQL loops over positions. |
| `tests/codenamesduet/sudden_death_test.sql` | Sudden-death rules: no more clues, green continues, any non-green is `lost_clock`. Forces the game into sudden_death directly via UPDATE rather than playing nine real turns. |
| `tests/codenamesduet/submit_timeout_test.sql` | `submit_timeout` happy path from both `playing` and `sudden_death` → `lost_timeout`; idempotency on terminal state; non-player rejection via `require_game_player`; status.reason plumbing. |
| `tests/codenamesduet/end_game_test.sql` | `end_game` happy path: `playing` → `ended`, `is_terminal=true`, `status.reason='manual'`, both players' `result={won:false}`; idempotency on terminal state; non-player rejection via `require_game_player`. |
| `tests/codenamesduet/rls_test.sql` | The single highest-value security check: dee (not a player) sees zero rows from every game-scoped table, mutating RPCs refuse her (PN253, a fault), direct INSERTs are blocked at the grant layer. Includes a positive baseline (ada CAN see the game) so "dee sees nothing" is meaningful. |
| `tests/codenamesduet/events_test.sql` | What each move writes to `codenamesduet.events`: a clue, an agent, a hint (and `log_hint`'s gate), a pass, a bystander — each row's payload and `took_turn`; the order; a game on turn N holding N − 1 turn-taking events; the one-clue index and the payload CHECK; sudden death spending nothing. |
| `tests/codenamesduet/clue_context_test.sql` | `get_clue_context` auth gates as envelope assertions (PN253 fault, PN388/PN389 races) + the shape check: `result: 'context'`, 9 greens, 3 assassins (the regression guard for the old `limit 1` that hid two). |

### codenamesduet-specific test helpers

Four helpers shared across codenamesduet tests, promoted to [`supabase/tests/codenamesduet/setup.psql`](../../supabase/tests/codenamesduet/setup.psql) per the promotion threshold in [`testing.md`](../testing.md). Each codenamesduet test starts with two includes — `\ir ../_shared/setup.psql` for the personas + `as_user`, then `\ir setup.psql` for these:

- **`pg_temp.find_position(g uuid, s text, target text) → int`** — "Find the first board position whose label on seat `s`'s view is `target`." The key card is random per-game, so tests can't hardcode positions.
- **`pg_temp.find_position_set(g uuid, s text, target text) → int[]`** — array-returning variant. Used by `win_test.sql` to walk all 9 green agents on a side. The positional `unnest with ordinality` avoids the `row_number()`-vs-SRF trap.
- **`pg_temp.codenamesduet_setup(turns int default 9, first_user uuid default ada) → jsonb`** — build a valid `create_game` setup payload. Defaults to the standard 9-turn game with ada as first clue-giver and `timer.kind = 'none'`; override turns or first_user to test variations (`codenamesduet_setup(11)`, `codenamesduet_setup(9, bea_uuid)`). Timer-specific tests pass a literal jsonb so the timer mode is explicit.
- **`pg_temp.codenamesduet_players() → uuid[]`** — the standard 2-player roster (`[ada, bea]`), passed as `create_game`'s `player_user_ids` argument so tests don't repeat the two persona UUIDs.

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
| `src/codenamesduet/lib/phase.test.ts` | Every branch of phase derivation. Pure, no DOM. |
| `src/codenamesduet/lib/turnOutcome.test.ts` | Every branch of the per-turn outcome verdict (assassin / only-neutrals / mixed / all-agents / passed). Pure, no DOM. |
| `src/codenamesduet/hooks/useBoard.test.ts` | The board hook's data flow — initial fetch, realtime append, refetch on resubscribe — plus the failed read: the envelope is kept rather than left as an empty board (verified by planting a swallowed not-ok). |
| `src/codenamesduet/components/GameEventLog.test.tsx` | Per-turn grouping (each turn = two `<tr>`s), oldest-first chronological order, within-turn guess sort by `id`, the guess-line state ("(clue given)" while the turn is the current live one vs "(no guesses)" once it has ended, or the game is over), and the shared player picker (Team + both handles, defaulting to Team; picking a player narrows to the turns they CLUED). |
| `src/codenamesduet/components/PlayArea.test.tsx` | The synchronous `guessInFlight` guard — a second tile click while a guess is in flight fires no second `submit_guess` (the pending-tile disable is async, so it misses a same-tick double-tap, and only disables the one clicked tile) — plus tile input gating: clickable on my guess turn, blocked at terminal. |
| `src/codenamesduet/components/CluePanel.test.tsx` | The two-kinds-of-text-input contract: both clue inputs (count + word) carry `data-game-input`, so the global `/ ? ~` shortcuts still fire while typing a clue. (`isNonGameField`'s logic is covered in `common/keyboard/editableField.test.ts`; this pins that the actual inputs carry the tag.) |

**Plus four Playwright e2e specs** — each a deliberate, narrow exception to the "e2e = realtime/presence only" charter, guarding real-browser behavior jsdom can't see:

- [`e2e/codenamesduet.e2e.ts`](../../e2e/codenamesduet.e2e.ts) — guards a real **layout** property jsdom can't see (`getBoundingClientRect` is all zeros there): the below-board slot is fixed-height, so the `flex: 1` board must not change height as the slot cycles through its states (clue form → waiting → own-action flash → clue + Pass). It also asserts the AI suggestion `<FloatingPanel>` renders fully on-screen — the regression guard for the react-rnd static-position gotcha (see [ui.md → Components](../ui.md#components)).
- [`e2e/codenamesduet-clueform.e2e.ts`](../../e2e/codenamesduet-clueform.e2e.ts) — the clue form keeps Tab to itself: the form declares its two inputs (count + word) as its tab ring, so Tab and Shift+Tab toggle between them and nowhere else — without it, Tab walks off onto the event-log `#N` handles, page links, and the browser tab bar. Native Tab traversal is a real-browser behavior jsdom can't simulate.
- [`e2e/codenamesduet-history.e2e.ts`](../../e2e/codenamesduet-history.e2e.ts) — the turn-history viewer: clicking an event-log row replays that turn's board (the reveal state after that turn's guesses, the history frame, the turn's own cells ringed, the description banner overlaying the below-board slot) — and pins the invariant the decomposition rides on: the board must **not** reflow when the viewer opens (the banner overlays the fixed-height slot; it doesn't grow it).
- [`e2e/codenamesduet-mobile.e2e.ts`](../../e2e/codenamesduet-mobile.e2e.ts) — the phone layout: the board stays full-size and the page scrolls (the clue-giver needs the board's key-card colors while composing in the keyboard-raising clue input, so the board is deliberately not shrunk or clamped), the page doesn't scroll at rest, the info column is the collapsed off-canvas sheet, and the below-board action buttons go icon-only.

## Printing the board (PDF)

`src/codenamesduet/pdf/` — a **"Print board (PDF)"** GamePage menu item, the
eleventh and last game to print (common/pdf/doc.md). Event-log family: the 5×5 board in
the left column, the clue log beneath.

**It exists to be thought about away from a screen**, which drives the one place
it deliberately shows MORE than the app: the board hides your own key while
you're mid-guess (it's a distraction there), and the print always shows it.

Three independent facts share every tile, and none may lean on color — a mono
printer flattens the palette to one gray. So each becomes a drawn mark (✓ agent /
– bystander / ✗ assassin from [`common/pdf/marks.ts`](../../src/common/pdf/marks.ts)),
separated by **position**, matching the screen's corners:

| corner | fact |
|---|---|
| top-left mark (+ the tile's border color) | what HAPPENED here (contacted / assassin / burned / untouched). Drawn largest of the three — it's what you scan the grid for |
| bottom-left inset | **your** key. Small on purpose: a reference you consult, kept out of the word's way |
| top-right inset | your **partner's** key — terminal only |

The two bystander **triangles** print as well (yours below the word, your
partner's above). They're not decoration: a word your partner burned is still
yours to guess, while one you burned is locked to you, and that asymmetry is
exactly what clue-planning turns on.

The partner's key is **terminal-only**, twice over: `useBoard` only surfaces it
when this viewer has asked at terminal (`revealPeer`), and the print model
refuses it before terminal
regardless — so a refactor there can't put the other half of the answer on paper
mid-game. That's the main thing `model.test.ts` pins.

A legend prints under the board, because the marks are a private vocabulary and
a printout gets read where nothing else explains them.

## Deferred

The register lives in [`src/codenamesduet/todo.md`](../../src/codenamesduet/todo.md),
the game folder's own, won't-dos included, as connections', psychicnum's,
spellingbee's and wordle's do.

## File locations

| asking… | look at… |
|---|---|
| What does an RPC do | [`supabase/migrations/20260615000001_codenamesduet.sql`](../../supabase/migrations/20260615000001_codenamesduet.sql) |
| What does an RPC say it does | this file + [`supabase/tests/codenamesduet/*_test.sql`](../../supabase/tests/codenamesduet/) |
| What does the board look like | [`src/codenamesduet/components/Board.tsx`](../../src/codenamesduet/components/Board.tsx) (presentational per-tile render + corner overlays; calls `onGuess`) |
| What does the page composition look like | [`src/codenamesduet/components/PlayArea.tsx`](../../src/codenamesduet/components/PlayArea.tsx) (mounted as `<GamePage>`'s play surface; owns the `submit_guess` dispatch, the header pill, and the in-page terminal verdict + win celebration) |
| How does state flow on the FE | [`src/codenamesduet/hooks/useGame.ts`](../../src/codenamesduet/hooks/useGame.ts), `useBoard.ts` |
| What's the phase logic | [`src/codenamesduet/lib/phase.ts`](../../src/codenamesduet/lib/phase.ts) |
| How does the AI clue suggestion work | [`supabase/functions/codenamesduet-suggest-clue/index.ts`](../../supabase/functions/codenamesduet-suggest-clue/index.ts) |
