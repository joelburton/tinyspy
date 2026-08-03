# psychicnum

A tiny word-guessing game with two modes: **psychicnum_coop** (team plays together with a shared budget) and **psychicnum_compete** (players race independently). The reference minimal surface for exercising the multi-game architecture — and the first to exercise the **coop/compete sibling-manifest pattern** that every multiplayer game now follows. Read this file before touching anything in `psychicnum/` or `supabase/migrations/*_psychicnum_*.sql`.

For the shared layer see [`common.md`](../common.md). For testing theory + persona conventions see [`testing.md`](../testing.md). For comparison with the richer-shape gametype see [`codenamesduet.md`](codenamesduet.md).

## The sibling-manifest pattern

psychicnum is a coop/compete sibling pair — the full pattern (two `common.gametypes` rows + two `src/games.ts` manifests over one folder, one schema, one `create_game(target_club, setup, player_user_ids, mode)` RPC, RLS branching on a denormalized `mode` column, why-per-variant-not-a-radio) is documented once in [common.md → The sibling-manifest pattern](../common.md#the-sibling-manifest-pattern), which uses psychicnum as its worked example. psychicnum's specifics:

| field             | `psychicnumCoopGame` | `psychicnumCompeteGame` |
|-------------------|----------------------|-------------------------|
| `gametype`        | `psychicnum_coop`    | `psychicnum_compete`    |
| `mode`            | `'coop'`             | `'compete'`             |
| `numberOfPlayers` | `[1, 6]`             | `[2, 6]`                |

Both siblings share the same display `name` — the brand, `PsychicNum`, read from the manifest's one `BRAND` const — over one `src/psychicnum/` folder and one schema; the coop/compete distinction shows at presentation time via the `<ModePill>` (see [ui.md → Mode pills](../ui.md#mode-pills)). A timer that runs out is NOT what makes a game "compete" — compete needs an opposing PLAYER, which is why the compete manifest's `[2, 6]` floor hides it in solo clubs (coop can still carry a countdown timer there).

## The rules

> Spec the RPCs implement against. When the rules disagree with the code, fix this section first.

### Setup (both modes)

- A **board of N words** (N = `word_count`, 5–20, chosen at setup), sampled from `common.words` at create-game time under a clean (`crude=0 AND slur=0`) + `american` + non-`slang` + `difficulty ≤ band` filter. **Three of the board words are secret**; the same three for everyone, and players win by finding **all three** (by clicking a word tile or typing the word).
- The board words are **public** (you see and click them). The three secrets are **hidden server-side** — clients can't tell which words are secret during play even with devtools open — see [The hidden-secrets mechanic](#the-hidden-secrets-mechanic) below.
- A guessed word colors its board tile **permanently** — green if it's a secret, red if not. A guess must be one of the board words.
- **Two helpers, both free + logged amber in the turn log, neither finds the secret or decrements the budget:**
  - **Hint** (`request_hint`): shows the *clue* for an unfound secret (`common.words.hint` — a category/near-synonym nudge). Many words have no clue, so it falls back to the literal "No hint available". The clue (not the word) is what's logged, so a hint never leaks the answer.
  - **Spoiler** (`request_reveal`): shows the *answer* — an unfound secret word itself. The toy "hint that's really the answer." The FE button is the amber bare-eye `SpoilerButton`; the red boxed-eye `RevealButton` is a different thing (the whole board's secrets, terminal only). The RPC keeps its `request_reveal` name — only the player-facing vocabulary moved.
- Setup form collects: **guess budget** (one of 3/5/7/9), **words on the board** (`word_count`, 5–20), **word difficulty** (the shared `<DifficultyField>` band), **timer** (none/countup/countdown, MM:SS for countdown).
- The mode (coop vs compete) is **NOT** a setup field — it's locked at the gametype level, picked by which Start button the player clicks. See [The sibling-manifest pattern](#the-sibling-manifest-pattern) above.

### Coop gameplay

- All players share a single guess pool (initial value = `setup.guesses`) **and one board**.
- Every guess decrements **everyone's** budget — coop budgets always equal each other (the per-player rows just happen to track the same number, decremented in lock-step).
- Every guess (and hint) is visible to every club member (the turn log shows all of them). A teammate's guess is narrated in the header (green/red) as "● X Correct: WORD" / "● X Wrong: WORD", and a teammate's hint request as "● X got hint" (amber).
- A number already taken (by anyone) can't be re-guessed.
- **Win:** the team collectively finds all three secrets. Whole team wins.
- **Lose:** the guess that takes the shared budget to zero before the set is complete. Whole team loses.
- **Timeout (if countdown set):** countdown hits zero → whole team loses.

### Compete gameplay

- Each player gets their own guess budget (initial value = `setup.guesses` per player) **and their own private board**; each races to find all three themselves.
- Each guess decrements only the submitter's budget.
- A player sees:
  - **Their own** guesses + results + hints (the turn log + board filter server-side via RLS) — until the game ends, when every player's log opens and the turn log's player picker can read them back.
  - **Opponents' remaining budget** (a strip in the action slot) AND a header pill when an opponent finds a secret — "● X guessed a word" — the *count*, never *which* word (`players.found_secrets_count` is public; the values stay hidden).
  - **NOT** opponents' guesses, hints, or which numbers they've found.
- **Win:** the first player to find all three ends the game for everyone. That player wins; everyone else loses immediately, even if they had budget remaining.
- **Lose (collective):** all player budgets reach zero with nobody having completed the set. Everyone loses.
- **Timeout (if countdown set):** countdown hits zero → everyone loses.

### What the game is not

- **Not a turn-based game.** Any player can guess at any time. The server serializes simultaneous guesses via `SELECT ... FOR UPDATE` on the game row.
- **Not strategic.** There's no skill in the spec — it's "guess a random number." The "fun" parameter is left at zero.
- **Slated for removal after beta** — the roster has filled in, so the toy no longer earns its keep. The removal will validate the **removability-in-three-actions** invariant for real: `rm -rf src/psychicnum/`, drop the two entries from `src/games.ts` AND drop the two `common.gametypes` rows from the schema, drop the migration file. If anything else breaks, the architecture leaked.

## Schema: `psychicnum.*`

### Tables

| table | purpose |
|---|---|
| `games` | One row per playing. `club_handle` ties to `common.clubs`. Holds `words text[]` (the N board words, PUBLIC), `secrets text[]` (the three secret words, a subset of `words`, hidden), and `mode` ('coop' or 'compete', denormalized for RLS branching). Play-state (`play_state` + `is_terminal`) and the setup blob both live on `common.games`. |
| `players` | Per-player budget + progress tracking. One row per (game, player), with `guesses_remaining` and `found_secrets_count` (0..3, public — the compete opponent-progress count). Seeded at create-game time from `setup.guesses`. Coop decrements every row in lock-step; compete decrements only the guesser's row. Per-player outcome (`won` / `lost`) is NOT here — it goes on `common.game_players.result` at game-end via `common.end_game`. |
| `guesses` | Append-only log of every guess **and helper**. One row per event, with `user_id`, `word`, `is_correct`, `kind` ('guess' \| 'hint' \| 'reveal'), `guessed_at`. `'reveal'` rows carry the answer word; `'hint'` rows carry the *clue text* in `word` (not the secret — no leak); both render amber in the turn log. Everything that computes from real guesses filters `kind='guess'`. RLS in compete mode scopes visibility to caller only. |

There is no separate `boards` table. The "board" (the static starting state — see [`codenamesduet.md`](codenamesduet.md) for the gametype/game/board distinction) is just the `words` array on the game row, too small to warrant its own table.

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
| **`submit_guess` set-complete terminal** | all three found by the team → `play_state='won'`, every player `result={won: true}` | the caller found all three → `play_state='won_compete'`, caller `result={won: true}`, others `{won: false}` |
| **`submit_guess` all-exhausted terminal** | `play_state='lost'`, every player `result={won: false}`  | `play_state='lost_compete'`, every player `result={won: false}`      |
| **`submit_timeout` terminal**          | `play_state='lost'`, outcome `timeout`                      | `play_state='lost_compete'`, outcome `timeout`                       |
| **listing-label `status.guesses_remaining`** | Shared value (all rows have it; any row works)        | Sum of all rows (the listing label reflects "total remaining budget across the game") |
| **FE PlayArea header**                 | "X guesses left" (single shared number)                     | Budget strip: "You: X · Bea: Y · Cade: Z"                            |
| **FE GameTurnLog**                    | "Team" + each player in the shared picker                   | "All" + each player; RLS still hides opponents' rows until terminal |
| **Terminal outcome line** (info column) | "You won!" / "Out of guesses" / "Timer elapsed" (team)      | "You won!" / "${winner} won" (per-self)                              |

The shape that's the same in both modes:
- The `psychicnum.games` table (modulo the `mode` value).
- The `psychicnum.players` table (one row per player; structurally identical).
- The `psychicnum.guesses` table (rows look the same; RLS hides them differently).
- The setup blob (`PsychicnumSetup` = `CoopTurnSetup & { guesses, word_count, difficulty, timer }` — see `lib/setup.ts`) — same fields, same defaults (`coop_style: 'free-for-all'`; the turn toggle only means something in coop).
- The hidden-secrets mechanic — both modes unshield the three secrets post-terminal via `games_state`. The FE then rings them only when `common.games.solution_revealed` says so — a clean win or an explicit Reveal: `replay_board` hunts the SAME three again, so auto-ringing a lost board would leave Restart nothing to find (docs/ui.md → Terminal results). The flag is common, shared, and cleared by `reset_game`.
- `common.games.title` formula (the first three board words — see [Title formula](#title-formula)).
- `common.game_players.result` shape (`{ won: bool }`).
- `common.update_state` mid-game listing-label payload structure.

### Play-state enum

`common.games.play_state` carries psychicnum's lifecycle enum. Different vocabularies per mode:

**Coop:**
- **playing** — guesses being submitted. Default.
- **won** — the team found all three secrets. Terminal.
- **lost** — collective budget exhausted (before the set was complete) OR timer expired. Terminal.

**Compete:**
- **playing** — guesses being submitted. Default.
- **won_compete** — a player found all three secrets. Terminal. That player's `common.game_players.result = {won: true}`; everyone else's `= {won: false}`.
- **lost_compete** — all players exhausted their budgets OR timer expired with nobody having completed the set. Terminal. Everyone's `result = {won: false}`.

**Both modes:**
- **ended** — a player pressed the **End** button (`psychicnum.end_game`, `outcome='manual'`), shown in **coop**. Terminal, neutral: nobody won, nobody lost, everyone's `result = {won: false}`. Deliberately the *uniform* value the other games use for manual stops (not `'lost'`/`'lost_compete'`) so the cross-game terminal vocabulary stays consistent; the FE has explicit `'ended'` branches that render it green ("Game ended") rather than as a loss.
- **compete: Concede, not End.** `psychicnum.concede` is the compete-mode per-player drop-out. psychicnum is an **elimination** game (each player has an independent guess budget; the game ends only when every budget is exhausted or someone finds the whole set), so concede calls `common._set_conceded` then ends the game as a collective loss iff no non-conceded player still has budget (a conceder's leftover budget is excluded — `submit_guess`'s all-exhausted check sums only non-conceded players too). That terminal is `lost_compete` with `status.outcome = 'conceded'` only when **every** player conceded; a mixed table writes `'exhausted'`, because somebody played their budget out. FE: `<ConcedeGameButton>` in compete, conceder "out" in the OpponentStrip, folded into the existing out-of-guesses locally-terminal look. See [common.md → Concede](../common.md#concede--per-player-drop-out). pgTAP: `concede_test.sql`.

The mode-specific suffixes mirror what spellingbee did for its planned compete mode. Future games' compete-mode terminal states should follow this convention.

## The hidden-secrets mechanic

The most architecturally interesting piece of psychicnum is how it hides the `secrets` array from clients. Two layers, working together:

### Layer 1 — column-level grant (storage gate)

The base table grants SELECT to `authenticated` on every column *except* `secrets`:

```sql
grant select
  (id, club_handle, mode, words, created_at)
  on psychicnum.games to authenticated;
```

A direct `SELECT secrets FROM psychicnum.games WHERE id = ?` as `authenticated` raises SQLSTATE 42501 ("permission denied for column secrets"). The RPCs (which run as `postgres` via `security definer`) can still read it. This is tested in [`tests/psychicnum/create_game_test.sql`](../../supabase/tests/psychicnum/create_game_test.sql).

(`players.found_secrets_count` is a deliberately *public* companion — the count of secrets each player has found, 0..3. It leaks how many, never which: enough for compete opponent tension, the smallest "show progress, not answers" surface.)

### Layer 2 — `psychicnum.games_state` view + `_secrets_for` helper (conditional exposure)

The FE never reads from `psychicnum.games` directly anymore — it reads from a view that conditionally exposes `secrets` based on `common.games.is_terminal`:

```sql
create or replace view psychicnum.games_state
  with (security_invoker = true) as
select g.id, g.club_handle, g.mode, g.words, g.created_at,
       psychicnum._secrets_for(g.id) as secrets
  from psychicnum.games g;
```

Two settings carry the design:

- **`security_invoker = true`** on the view means RLS is evaluated as the *caller*, not the view-owner — so the `is_club_member` policy on `psychicnum.games` decides row visibility normally.
- **`psychicnum._secrets_for(uuid)`** is a `SECURITY DEFINER` helper that runs as `postgres`. It bypasses the column-grant (which only binds the `authenticated` role) and returns the array — but **only when `common.games.is_terminal` is true**:

  ```sql
  -- inside _secrets_for(g_id uuid):
  select case when c.is_terminal then p.secrets else null end
    from psychicnum.games p
    join common.games c on c.id = p.id
   where p.id = g_id;
  ```

The net effect: one FE query (`db.from('games_state').select(...)`) returns the row with `secrets` populated once terminal, `null` while playing. Row visibility is gated by RLS (invoker); column exposure is gated by the helper's CASE.

### Why this matters as a pattern

This is the canonical recipe for **"expose a column the invoker can't see directly, gated on row state."** The recipe:

1. Grant SELECT on safe columns to `authenticated`; omit the secret. (Storage lock stays as defense-in-depth.)
2. Write a `SECURITY DEFINER` helper that reads the secret and returns it conditionally — running as `postgres`, it bypasses the column grant.
3. Define a view with `security_invoker = true` so RLS still gates row visibility, and call the helper for the secret column.
4. Point the FE at the view, not the base table.

Future games with conditional-reveal state (post-game key cards in codenamesduet, end-of-round reveals in a future Boggle, etc.) should reach for this shape first. See [`code-conventions.md` → SECURITY DEFINER helper + security_invoker view](../code-conventions.md#security-definer-helper--security_invoker-view) for the brief cross-reference.

codenamesduet doesn't use this pattern (yet) because both players' key cards are equally readable via RLS during the game; per-player filtering is by convention rather than enforcement (see [`codenamesduet.md → Row-level security`](codenamesduet.md#row-level-security)).

## RPCs

All `security definer`, granted only to `authenticated`, search_path pinned to `psychicnum, common, public, extensions`.

### `psychicnum.create_game(target_club text, setup jsonb, player_user_ids uuid[], mode text) → table(id uuid)`

Caller must be a club member. **One RPC for both modes** — the `mode` parameter:

- Routes the gametype string to `'psychicnum_coop'` or `'psychicnum_compete'` on `common.games.gametype`.
- Lands on `psychicnum.games.mode` for RLS branching.
- Triggers the player-count check (`compete` requires ≥2 players).

Each FE manifest's `startGameInClub` passes its own per-manifest mode constant — the caller doesn't pick mode interactively.

After validation, samples `word_count` distinct board words from `common.words` (clean + american + non-slang + `difficulty ≤ band`), then three of those as the secrets, then calls `common.create_game(...)` for the common header half (see [common.md → Game-RPC helpers](../common.md#game-rpc-helpers-called-by-per-game-rpcs)), then inserts the psychicnum.games row (`words` + `secrets`), then inserts one `psychicnum.players` row per player_user_ids entry with `guesses_remaining` seeded from `setup.guesses`. Finally it **seeds `common.games.status`** in the same shape `submit_guess` maintains — coop `{guesses_remaining, found_secrets_count: 0, required_secrets_count}`, compete just the SUMMED `{guesses_remaining}` (a shared found-count would leak how close an opponent is). Without that seed the status stayed NULL until the first guess and a brand-new game rendered a bare `Playing` in the club list while every other game showed its opening state (fixed 2026-08-01; pinned in `create_game_test.sql`).

**Player-count gates:**
- Coop: `common.require_player_count_max(player_user_ids, 6)`. Matches `numberOfPlayers: [1, 6]`.
- Compete: same max-6 plus an explicit `array_length >= 2` check. Matches `numberOfPlayers: [2, 6]`.

Reject reasons: not authenticated; not a member; `mode` not in `{coop, compete}`; compete with <2 players; >6 players; `setup.guesses` not in {3, 5, 7, 9} or missing; `setup.word_count` not 5..20 or missing; `setup.difficulty` not 1..6 or missing; bad `setup.timer` shape (see [Timer](#timer-server-authoritative-ticks) below).

### Title formula

The first three **board** words alphabetically, uppercased and dash-joined (e.g. `APPLE-BERRY-CHERRY`) — so the game row in a club list is recognizable by what's on its board.

It must **not** reference the secrets, because `common.games.title` is club-wide readable and would put them in plain sight — and it doesn't: the board words are shown to every player anyway, and three of them in alphabetical order say nothing about *which* three are secret. The column-level grant on `psychicnum.games.secrets` (described in [The hidden-secrets mechanic](#the-hidden-secrets-mechanic)) stays the canonical "true server-side secret." (We don't care about friends peeking via devtools — see [CLAUDE.md → Trust model](../../CLAUDE.md) — but the secrets shouldn't sit in a label-shaped column that exists for a different purpose.)

### `psychicnum.submit_guess(target_game uuid, guess text) → text`

The only mid-game guess action. The guess must be one of the board words (compared case-folded — the player clicks a tile or types a board word). There are three secrets; players win by finding all three, so a correct guess no longer ends the game by itself — only the one that completes the set does. Returns one of:

- `'won'` — found the last needed secret; caller (compete) / team (coop) wins. Terminal.
- `'correct'` — found a secret. Usually the game continues; it can also be the guess that empties the budget, which ends the game — still `'correct'`.
- `'wrong'` — missed.

The FE flashes green for `'won'`/`'correct'`, red for `'wrong'`; the terminal transition it observes via realtime, not the return value.

**The return value is the caller's verdict on their own guess, never the game's fate.** There's deliberately no `'lost'`: the budget-exhausting guess used to return one whichever way the guess itself went, so a *correct* guess that happened to empty the budget flashed a red "Incorrect" for a beat before the terminal verdict replaced it. Every other way this game ends (timeout, concede, a compete opponent finishing) already reaches the FE by realtime; the exhaustion loss now does too, and the RPC's three values answer only "did I hit a secret?" *(Fixed 2026-08-02.)*

**Mode-aware budget decrement:**
- Coop: decrements every `psychicnum.players` row.
- Compete: decrements only the caller's row.

A correct guess bumps the caller's `players.found_secrets_count`. "Found all three" is scoped per mode — coop counts the **team's** distinct correct guesses; compete counts the **caller's** own.

**Mode-aware terminal-on-set-complete:**
- Coop: the team found all three → `play_state='won'`, every player's `result = {won: true}`.
- Compete: the caller found all three → `play_state='won_compete'`, caller's `result = {won: true}`, everyone else's `result = {won: false}`. Game ends for everyone — opponents with remaining budget no longer get to try.

**Mode-aware terminal-on-all-exhausted:**
- Coop: the guess that takes the shared count to 0 before the set is complete → `play_state='lost'`.
- Compete: `play_state='lost_compete'` only when the sum of all players' budgets reaches 0 (everyone's exhausted, nobody completed the set).

Locks the gametype row with `SELECT ... FOR UPDATE` to serialize concurrent guesses. If two compete-mode players complete their sets at the same instant, whichever transaction commits first wins; the second sees `play_state != 'playing'` and raises `'game is not active'`.

Records every guess in `psychicnum.guesses` (`kind='guess'`, `word` lowercased, `is_correct` set). A word already taken (game-wide in coop, caller's own in compete) is **rejected** (`'word already guessed'`) — the FE disables guessed tiles, this is the server guard. Hint rows don't count, so a hinted word can still be guessed.

Reject reasons:

- not authenticated
- not a word on the board
- game not found
- not a game player
- game status ≠ playing
- word already guessed (in scope)
- caller has 0 guesses remaining

**Opt-in turn-by-turn coop.** The coop sibling supports the common turn-order primitive (setup `coop_style = 'turns'`): `submit_guess` gates on `common._require_turn` right after the row lock + caller resolution (out-of-turn → `'not your turn'`), and calls `common._advance_turn` only on an accepted, non-terminal guess — so a soft-reject (not-a-board-word, duplicate, exhausted) lets the same player retry, and the pointer isn't touched when the guess ends the game. As the reference minimal game, psychicnum was the pilot for this common feature; see [common.md → Turn-order](../common.md#turn-order--opt-in-turn-by-turn-for-coop-games).

### `psychicnum.request_hint(target_game uuid) → text` and `request_reveal(target_game uuid) → text`

Two helper RPCs, both: pick an as-yet-unfound secret (scoped like the win check — coop = the team's, compete = the caller's — via the shared `_unfound_secret(g, caller)` helper); log a row that flows into the turn log over realtime; cost **nothing** (no budget decrement) and do **not** find the secret. Coop teammates get a header pill; compete scopes the row to the caller via RLS. Guarded like a move (game player, status = playing).

- **`request_reveal`** logs a `kind='reveal'` row with the secret **word** (the answer) and returns it. Teammate pill: "X revealed a word". Surfaced as the mid-game **Spoiler** button.
- **`request_hint`** looks up that word's **clue** (`common.words.hint`), logs a `kind='hint'` row with the *clue text* (or the literal "No hint available" when the word has none — the row never carries the secret word), and returns the clue. Teammate pill: "● X got hint".

### `psychicnum.submit_timeout(target_game uuid)`

Fires when the FE's count-down timer expires. Calls `common.end_game` with:
- Coop: `play_state = 'lost'`, `status->>'outcome' = 'timeout'`.
- Compete: `play_state = 'lost_compete'`, `status->>'outcome' = 'timeout'`.

The outcome names the **cause** and never repeats the play_state, so both modes say `timeout`; the win writes `solved` in both modes too.

Either way, **everyone loses** — `common.game_players.result = {won: false}` for every player. Compete-mode players were racing; the clock running out before anyone won is a collective loss.

Idempotent on the terminal-state guard: a second concurrent call from a racing client raises `P0001 'game is not active'`, which the FE swallows. See [Timer](#timer-server-authoritative-ticks).

Reject reasons: not authenticated; not a game player; game not found; game status ≠ playing.

### `psychicnum.replay_board(target_game uuid)`

The **Restart** button in the terminal action row + the "Restart" menu item. Resets the working state on the SAME game row: the frozen puzzle (`words` / `secrets` / `mode`) stays, so it's the same board and the same three secrets hunted again, and everything the players did is wiped — guess log cleared, every player back to a full budget with `found_secrets_count = 0`. Any game player, from a finished game OR mid-game (mid-game confirms, since it wipes the group's progress; at terminal there's nothing left to lose).

The budget is re-read from `common.games.setup->>'guesses'`, **not** from `psychicnum.players` — those rows have been decremented all game and can't say what the budget was. Turn-order coop rewinds the pointer to the player seated first (`game_players.turn_seat = 0`); a free-for-all game's null pointer stays null. The common half (un-terminal, fresh status, per-player results + concede cleared, clock zeroed) is `common.reset_game`; the secrets re-hide on their own, since `games_state` gates them on `is_terminal`.

No realtime touch needed — the players update + guesses delete wake `useGame` directly. pgTAP: `replay_test.sql`.

### `psychicnum.end_game(target_game uuid)`

The **End** button in the info-column action row (coop; compete shows **Concede** instead — see the play-states above) fires this, behind the shared confirm dialog (`END_GAME_CONFIRM` via `useConfirmDialog`). It's the explicit manual stop — any current game player can decide the group is done. Like every game, it's surfaced in **both** the action row and the GamePage menu — the latter wired through `buildGameMenu` (see [common.md → Manual end](../common.md#manual-end--every-gametypes-end_gametarget_game)).

Unlike `submit_timeout`, a manual stop is **neither a win nor a loss**, so it writes the uniform terminal `play_state = 'ended'` with `status = {outcome:'manual', mode}` and `result = {won: false}` for every player (psychicnum tracks no per-player score, so there's nothing richer to record). Same shape across both modes. The FE renders `'ended'` neutrally — green "Game ended" copy, not the red loss treatment.

Idempotent on the terminal-state guard: a second concurrent call raises `P0001 'game is not in progress'`, which the FE swallows. **Realtime touch at the tail** — a no-op self-write on `psychicnum.games` (`set club_handle = club_handle`) wakes the FE's schema-scoped subscription to refetch the now-unshielded secrets (which the FE still holds back until a win or a Reveal) — the uniform trick at [common.md → Manual end, step 6](../common.md#manual-end--every-gametypes-end_gametarget_game).

Reject reasons: not authenticated; not a game player; game not found; game status ≠ playing.

## Setup

The start-game dialog collects these options from the players before `create_game` fires:

- **`guesses`**: total guess budget shared across all club members, one of `{3, 5, 7, 9}`. 7 is the default.
- **`word_count`**: how many words on the board, 5..20 (default 10). Three of them are secret.
- **`difficulty`**: dictionary band 1..6 (Universal..Expert, default 3), a `common.words.difficulty` value — the board is sampled at `difficulty ≤ this`. Rendered by the shared `<DifficultyField>`.
- **`timer`**: timer mode — `none`, `countup`, or `countdown` with a player-chosen MM:SS duration. Rendered by the shared `<TimerField>`, validated server-side by `common.require_valid_timer`. See [Timer](#timer-server-authoritative-ticks) below.
- **`coop_style`** (coop): `'free-for-all'` (the default) or `'turns'` — the common opt-in turn-by-turn pacing, rendered by the shared `<CoopStyleField>`. Picking `'turns'` adds **`first_turn_user_id`** (who goes first — must be one of the players; `create_game` rejects anyone else).

Shape stored on `common.games.setup` (jsonb): `{ "guesses": 3|5|7|9, "word_count": 5..20, "difficulty": 1..6, "timer": {…}, "coop_style": "free-for-all"|"turns" }` — plus `"first_turn_user_id"` when turns. The mutable `guesses_remaining` counter is initialized from `setup.guesses` at create-game time; the blob persists the original choices on the common header for end-of-game review. The saved club default (`common.create_game`'s last arg) is the same blob minus **only** `first_turn_user_id` — who goes first is a per-game pick, not a club preference, while the `coop_style` toggle itself round-trips so a club that likes turns keeps it.

The FE side: `src/psychicnum/lib/setup.ts` (the `PsychicnumSetup` type) and `src/psychicnum/components/SetupForm.tsx` (the form body, lazy-loaded inside the common `SetupGameDialog`). The server is the canonical authority for what shapes are accepted — the TypeScript narrowing is advisory.

## Timer (server-authoritative ticks)

Standard `<TimerField>` + `useGameTimer` setup — see [`common.md → Idle accounting`](../common.md#idle-accounting-timer-state-preservation) for the design rationale and drift bounds. Psychic-num-specific: countdown expiry calls `psychicnum.submit_timeout`, which flips `play_state` to `lost` (coop) / `lost_compete` (compete).

## Pause-on-disconnect

Inherited unchanged from the common shell — presence-pause + manual-pause both compose into a single `paused` flag, `PauseBoundary` unmounts children while paused. Psychic-num has no gametype-specific wiring beyond mounting the shared `<GamePage>`. See [`connections.md → Pause`](connections.md#pause-presence-driven--manual) for the canonical write-up.

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
         join common.games cg on cg.id = g.id
         where g.id = guesses.game_id
           and common.is_club_member(g.club_handle)
           and (g.mode = 'coop' or guesses.user_id = auth.uid() or cg.is_terminal)
      )
    );
  ```

  Coop: any club member sees any guess. Compete: club members see only their own **during play** — and everyone's **once the game is terminal** (2026-08-02, when the turn log gained the shared player picker; the same shape stackdown / connections / waffle use). Hiding an opponent's guesses mid-game is the real rule — their guesses are their strategy — but hiding them afterwards just withholds the interesting part.

  The `g.mode` read is denormalized expressly to avoid joining `common.games` for the mode; the terminal arm is what forces that join back in, since `is_terminal` lives on `common.games` and there's no point denormalizing a flag that flips mid-game. Guarded by [`rls_test.sql`](../../supabase/tests/psychicnum/rls_test.sql) — including that terminal widens the *mode* gate, not the *club* gate.

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
    PlayArea.tsx          Two-column composition on the SHARED PlayArea scaffold
                          (common/components/game/PlayArea.module.css, imported as `shared`;
                          shell + info-column readout classes + the shared .tile chrome —
                          PlayArea.module.css now holds only .inputMessage):
                            Board (grid of word tiles on the shared beige --tile-*
                              system; guessed tiles permanently green=secret / red=miss)
                            <EntryRow> (the shared capture-entry control: icon Delete +
                              EntryBox + icon Submit + keyboard) + submit_guess RPC — during play
                            info readouts (setup details / state / help) +
                              action row: Hint / Spoiler / End — playing
                            Shuffle button — FLOATS over the board top-right
                              (board-visual, not a turn action); always live
                            terminal: outcome line + "‹ club" button (in action row)
                            GameTurnLog (chronological guess + hint log, auto-scroll)
                            CelebrationDialog (shared) — pops on a COOP WIN only,
                              once, at the moment it happens; the only modal here
                          Mounted by <GamePage> as its render-prop child; receives
                          the GamePageCtx ({ session, gameId, players, playState,
                          isTerminal, timer, setup, goToClub, feedback, menu }).
                          Cross-cutting chrome (logo, chat-bubble, players strip,
                          pause, timer, suspend-confirm) lives on <GamePage>.
    PlayArea.module.css   (+ `.bigEntry` — psychicnum's one entry tweak: a 2rem font
                          on the shared <EntryRow>, since a single guess word reads large)
                          The word entry is now the SHARED common/components/game/entry/EntryRow
                          (icon Delete + EntryBox + icon Submit + the capture keyboard) —
                          psychicnum's old per-game GuessForm was deleted when it landed.
                          Clicking a board tile and typing drive the same pending word;
                          submit_guess dispatch lives in BoardCol.
    BoardCol.tsx          The board column (post-decomposition): the <Board> + the
    BoardCol.module.css   below-board slot (turn-viewer banner / guess entry / own-move
                          or terminal <GenericFeedbackPill>). Owns the guess dispatch
                          (submit_guess) + the local board shuffle. PlayArea hands it the
                          board to render (live results OR a history snapshot) + `viewing`.
    PlayArea.test.tsx     Component tests for the per-player concede flow (compete
                          shows Concede → psychicnum.concede, coop shows End →
                          end_game, a conceded opponent reads "out" in the strip,
                          my own concede gets the locally-terminal look), the
                          turn-order UI gating (waiting vs your-turn vs no line),
                          and click-to-define in the log (the guessed word, not
                          the hint sentence).
    InfoCol.tsx           The info column: setup details / state / Hint / Spoiler / End
                          action row / GameTurnLog / terminal outcome line.
    StateLine.tsx         The core live-state readout — "1/3 found · 4/7 guesses
                          used" (per-viewer in compete, team-wide in coop; the
                          caller resolves that and passes numbers). Its own
                          component because it renders TWICE, in two places that
                          must never drift: the info column's `.infoState` line
                          (desktop) and the mobile <MobileStatusBar> above the
                          board.
    Board.tsx         The board of clickable word tiles (with the floating Shuffle),
    Board.module.css  keyed by tile; rings the viewed turn's word in history mode.
    GameTurnLog.tsx      Renders its OWN single-<tr> rows in the shared <TurnLog>
                          panel (row anatomy is the game's — see ui.md → Turn log):
                          each row = the shared <TurnLogBar> cell (green=correct /
                          red=wrong / amber=hint+reveal) + `#n` (the shared
                          <TurnLogNumber> history handle — click to replay that turn
                          on the board) + word + result +
                          actor with their identity dot, and turnLog.turnLogDivider
                          for the between-turns line. A hint row collapses the
                          word+result columns into a colspan "Hint: <clue>". The
                          guessed/revealed WORD is click-to-define (useDefinePopover)
                          — a real dictionary word; the hint's clue sentence is NOT.
                          Header carries the shared "whose turns?" picker
                          (useTurnLogPlayerPicker — Team/All + each player); when a
                          single player is filtered out of a shared coop log the
                          `#n` handle goes inert, since the viewer indexes by
                          POSITION and a filtered row 3 isn't the board's turn 3.
    GameTurnLog.module.css
    SetupForm.tsx         The setup form (guesses + word_count + difficulty + timer)
                          mounted in the common SetupGameDialog. (No per-game .module.css.)
    Help.tsx              Per-game rules modal — opened from the common "Help"
                          item in the GamePage menu. Implements the manifest's
                          required `help: ComponentType<{ onClose }>` contract.

  hooks/
    useGame.ts            Loads the game row (from games_state, so secrets appear on
                          termination) + players + guesses, subscribes to realtime. No
                          longer owns presence / pause / members / timer — those live in
                          common's useCommonGame, consumed by GamePage.

  lib/
    setup.ts              PsychicnumSetup type + DEFAULT_PSYCHICNUM_SETUP + the
                          word_count picker bounds.
    capitalize.ts         Sentence-cases a raw RPC error message for the own-move pill.
                          (The pill builder itself is now the shared common/lib/game/
                          localPills `stickyPill`, not a psychicnum-local file.)
    history.ts            The turn-history replay (pure + unit-tested). Given the guess log
                          + a turn's **position** in it, reconstruct the `word → is_correct`
                          map as of that turn — ADD-style (a guess only ever ADDS a permanent
                          green/red mark, so a past board is the guesses folded up to that
                          turn), boundary **inclusive** (viewing turn N shows the board AFTER
                          N's guess, with N's guessed tile ringed). Hint / reveal turns mark no
                          tile. Keyed by **log position** (the `#N` the log shows). Clicking a
                          `GameTurnLog` `#N` opens that turn on the board via the shared viewer.
    history.test.ts       Unit tests for the fold + inclusive boundary + hint/reveal no-ops.
```

### `PlayArea`

A two-column composition. Reads `playState`, `isTerminal`, `timer`, `setup`, `status`, `goToClub`, `feedback` from `GamePageCtx`. The info column's non-log area is the four named readouts (see [`ui.md` → PlayArea layout](../playarea.md#playarea-layout)): **setup** (a `<details>` "Setup options" — tiles / secrets / difficulty), **state** ("X/3 found · used/total guesses used"), **help** (muted "Click or type a word…"), and the **action row** (**Hint** / **Reveal** / **Shuffle** / **End**). On terminal, the guess entry's slot (below the board) shows the verdict pill; setup + state stay; help hides; and the action row becomes a bold, outcome-colored result line ("You won!" green / "Out of guesses" red / "Game over" neutral) + a compact "‹ club" button. `<GameTurnLog>` always renders below it. **No modal carries the verdict** ([ui.md → Terminal results](../ui.md#terminal-results--the-moment-vs-the-record)): a dialog would duplicate what the page already says, so the terminal lives entirely in-page (the reveal pill + the outcome line). A **coop win** pops the shared `<CelebrationDialog>` ("You win! 🎉") — once, at the moment the third secret falls, never when opening an already-won game (`useCelebration`). Compete doesn't celebrate: `won_compete` means *someone* won, and telling my own win from a loss needs per-player data that's empty on the first render, so an already-won race would pop confetti at someone merely reviewing it. The below-board pill carries the terse `verdict` ("Won: all found" / "Lost: out of guesses" / "Lost: out of time" / "Won: the race" / "Beaten to the punch"), the shared sweep vocabulary — it only became free to do so when the **secret reveal moved onto the board** (see below). **Feedback splits local vs group** (see [`ui.md`](../ui.md) + [`deferred.md`](../deferred.md#feedback-channels-local-vs-group)): the player's own guess shows "Correct"/"Incorrect" as the shared below-board `<GenericFeedbackPill>` (`useLocalFeedback`, in the fixed-height `.localFeedback` slot, dismissed on the next move — local); teammates' guesses/hints (coop) and opponents-found-a-secret (compete) are header pills (group). Guessed tiles stay permanently green (secret) / red (miss). **Terminal secret reveal = the BOARD.** At game over `psychicnum.games_state` exposes `secrets`, and `<Board>` rings every secret's tile bright green (`--psychicnum-secret-ring`, an `outline` — the background is untouched, so a found secret keeps its green result fill and a never-guessed one keeps the plain tile: "was it an answer?" and "did we find it?" stay separately legible). This replaced the old below-board word list ("The words were APPLE, RIVER, STONE"), which had no room on a phone and made the player map words back to tiles by eye. Guarded by [`psychicnum-terminal.e2e.ts`](../../e2e/psychicnum-terminal.e2e.ts) (exactly 3 rings, backgrounds unchanged, verdict in the pill). **Mobile status bar.** Below `--mobile` the info column moves off-canvas into the `<InfoSheet>`, taking the state readout with it — so `BoardCol` renders the shared `<MobileStatusBar>` above the board with the same `<StateLine>` the info column uses ("1/3 found · 4/7 guesses used"), one component so the two can't drift ([mobile.md → The mobile status bar](../mobile.md#the-mobile-status-bar--core-state-above-the-board)). It's CSS-hidden on desktop and costs the board a fixed 1.75rem on a phone. **Decomposed** into a `BoardCol` (the Board + `<EntryRow>` input engine + the below-board feedback + the `submit_guess` dispatch + Shuffle + the mobile status bar) and an `InfoCol` (the readouts + `GameTurnLog`); PlayArea is the thin coordinator (`useGame` + the turn-history `viewingIndex`). **Turn-history viewer:** clicking a log `#N` replays that turn — the guessed tile wears its green/red outcome color plus a yellow ring, input freezes until you leave (a keystroke / click / ✕). The snapshot is `lib/history.ts`; the own-move pill builder is the shared `common/lib/game/localPills` `stickyPill`. Everything cross-cutting (logo, chat, pause, timer, the global UserMenu) is the responsibility of `<GamePage>` / App.

### `useGame`

Reads from `psychicnum.games_state` (the view that exposes `secrets` conditionally on terminal status — see [The hidden-secrets mechanic](#the-hidden-secrets-mechanic)). `game.words: string[]` is the public board; `game.secrets: string[] | null` comes back `null` while active, the actual three words once terminal. No separate reveal effect. Also reads `players` (with the public `found_secrets_count` count) and `guesses` (each carrying `word` + `kind: 'guess' | 'hint'`).

Drives off the shared [`useRealtimeRefetch`](../../src/common/hooks/realtime/useRealtimeRefetch.ts) factory with a three-table subscription on `psychicnum.{games, players, guesses}`. The factory owns the per-effect UUID-suffixed channel name, the SUBSCRIBED-driven refetch, and the cleanup; this hook just declares its tables + writes the `load({ mounted })` callback. See `code-conventions.md` → "Realtime data hooks" for the factory contract.

The `members` array used by `GameTurnLog` for "[ada] guessed 7" attribution comes from `useCommonGame` (via GamePage's render-prop).

### Code-splitting

Standard — psychicnum's `PlayArea` ships as its own lazily-loaded chunk (~4 KB gzipped). See [common.md → Code-splitting](../common.md#code-splitting).

## Psychic-num testing

See [`testing.md`](../testing.md) for theory and shared setup. Psychic-num-specific notes:

### pgTAP files

| file | covers |
|---|---|
| `tests/psychicnum/create_game_test.sql` | Auth, membership, happy path, `setup.{guesses,word_count}` validation, `setup.timer` shape spot-checks (the shared validator's full grid lives in connections's create_game test), `is_current_view` flips via `common.games`, title formula, `word_count` board words + three secrets drawn from them, column-level grant blocks SELECT of `secrets`. |
| `tests/psychicnum/gameplay_test.sql` | Board-word guard (a word not on the board rejected), finding a secret returns `'correct'` and bumps `found_secrets_count`, finding the last returns `'won'` and flips `play_state`, wrong guess decrements (per-mode), re-guessing a taken word rejected, `request_hint` logs the clue (or "No hint available" fallback) and `request_reveal` logs the answer word — both `kind` rows, neither spends budget, budget-exhausted loss, `submit_timeout` happy path. |
| `tests/psychicnum/rls_test.sql` | dee (non-member) sees zero rows from both tables and from `games_state`, mutating RPCs throw. Members reading `games_state` see `secrets IS NULL` while active and the actual array once status is terminal — exercising both the `security_invoker` row-gating and the `_secrets_for` helper's CASE. |
| `tests/psychicnum/concede_test.sql` | The compete-only elimination concede: a concede keeps the game going while an opponent still has budget; everyone conceding ends it (`lost_compete`, no winner); coop is rejected. |
| `tests/psychicnum/end_game_test.sql` | The manual stop in BOTH modes: the uniform `play_state='ended'` + `status.outcome='manual'` + everyone's `result={won:false}`; idempotency (a second call raises P0001); non-player rejection. |
| `tests/psychicnum/replay_test.sql` | `replay_board`: the frozen puzzle (words/secrets/mode) stays while everything the players did is wiped, in both modes; the budget restored from `setup->>'guesses'` (not the decremented player rows); turn-order coop rewinds the pointer to seat 0; callable mid-game and at terminal; non-player rejected. |
| `tests/psychicnum/turn_order_test.sql` | The opt-in turn-by-turn coop wiring (psychicnum = the pilot): `create_game` seats the rotation on the chosen first player and rejects a non-player `first_turn_user_id`; an out-of-turn guess is `'not your turn'`; an accepted guess advances the pointer while a soft-reject (duplicate word) doesn't; free-for-all leaves the pointer null and ungated; a solo turn game wraps back to the lone player. |

### Pinning the board + secrets in tests

The board words + secrets are randomized at game creation, but tests need deterministic outcomes. The pattern is to override both `words` and `secrets` with known values (the guess must be one of `words`):

```sql
select pg_temp.as_user(...);
create temp table g on commit drop as
select * from psychicnum.create_game(
  (select handle from club),
  '{"guesses": 5, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
  array[ada_id, bea_id]::uuid[],
  'coop'  -- or 'compete'
);

-- Pin the board + secrets as postgres (RPC rolls them randomly; override directly)
reset role;
update psychicnum.games
   set words = array['alpha','bravo','charlie','delta','echo','foxtrot','golf','hotel'],
       secrets = array['alpha','bravo','charlie']
 where id = (select id from g);

-- Now play through the scenario...
select pg_temp.as_user(...);
select psychicnum.submit_guess((select id from g), 'alpha');  -- correct!
```

The `reset role` step is the noteworthy bit — clients can't write to `psychicnum.games` (no INSERT/UPDATE/DELETE grant on `authenticated`), so the test needs to drop back to `postgres` to do the override. This is only legal in tests; in production the RPC has the only path to write.

## Printing the board (PDF)

psychicnum joins the printable games — a **"Print board (PDF)"** GamePage menu item that
hands you a paper record of the game: the word board above the guess/hint log (flowing
newspaper-style down two columns). Each guessed tile also gets a drawn ✓/✗ shape mark, so
success/miss survives black-and-white printing rather than reading only in color
(`src/psychicnum/pdf/printPsychicnumPdf.ts`). The shared clean-printable design language +
helpers live in [docs/pdf.md](../pdf.md).

## Deferred

Nothing outstanding. (The budget-exhausting *correct* guess that flashed
"Incorrect" was fixed 2026-08-02 — see [`submit_guess`](#psychicnumsubmit_guesstarget_game-uuid-guess-text--text).)

## Won't do

Decided against, not queued — listed only so reviews don't re-propose them.

- **Anti-spam on guessing.** Friends-only audience; not a concern, and the
  7-guess cap caps the damage anyway.
- **A more visually interesting `.infoState` readout** (2026-08-02). The
  info-column state line ("N/3 found · M/9 guesses used") is plain on purpose;
  it doesn't need spellingbee's rank-ladder treatment.

## File locations

| asking… | look at… |
|---|---|
| What does an RPC do | [`supabase/migrations/20260615000002_psychicnum.sql`](../../supabase/migrations/20260615000002_psychicnum.sql) |
| What does the UI look like | [`src/psychicnum/components/PlayArea.tsx`](../../src/psychicnum/components/PlayArea.tsx) (word entry is the shared [`common/components/game/entry/EntryRow.tsx`](../../src/common/components/game/entry/EntryRow.tsx)) + `GameTurnLog.tsx` alongside; the coop-win celebration is the shared `common/components/game/CelebrationDialog.tsx` |
| How does state flow on the FE | [`src/psychicnum/hooks/useGame.ts`](../../src/psychicnum/hooks/useGame.ts) (reads from `games_state`) |
| Are the secrets really hidden? | column-level grant + `psychicnum.games_state` view with `_secrets_for` helper in the migration; SELECT-blocked test in [`tests/psychicnum/create_game_test.sql`](../../supabase/tests/psychicnum/create_game_test.sql) and view-behavior test in [`tests/psychicnum/rls_test.sql`](../../supabase/tests/psychicnum/rls_test.sql) |
