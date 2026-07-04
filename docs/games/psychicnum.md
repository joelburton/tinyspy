# psychicnum

A tiny word-guessing game with two modes: **psychicnum_coop** (team plays together with a shared budget) and **psychicnum_compete** (players race independently). The second gametype family registered, kept as the minimal surface for exercising the multi-game architecture — now also the minimal surface for exercising the **coop/compete sibling-manifest pattern** that connections and spellingbee will follow. Read this file before touching anything in `psychicnum/` or `supabase/migrations/*_psychicnum_*.sql`.

For the shared layer see [`common.md`](../common.md). For testing theory + persona conventions see [`testing.md`](../testing.md). For comparison with the richer-shape gametype see [`codenamesduet.md`](codenamesduet.md).

## The sibling-manifest pattern

psychicnum exports two manifest entries from one folder:

| field                | `psychicnumCoopGame`     | `psychicnumCompeteGame`     |
|----------------------|--------------------------|------------------------------|
| `gametype`           | `psychicnum_coop`         | `psychicnum_compete`          |
| `schema`             | `psychicnum`              | `psychicnum`                  |
| `baseGametype`       | `psychicnum`              | `psychicnum`                  |
| `mode`               | `'coop'`                  | `'compete'`                   |
| `name`               | `psychicnum`              | `psychicnum`                  |
| `numberOfPlayers`    | `[1, 6]`                  | `[2, 6]`                      |

The two siblings share the same `name` — the coop/compete distinction is shown at presentation time via the `<ModePill>` (read from `mode`), not baked into the name string. See [ui.md → Mode pills](../ui.md#mode-pills).

Both ship the same `PlayArea`, `SetupForm`, `Help`, `useGame`, `theme.css`, and `logo.svg`. The mode branches at render time (`game.mode === 'coop'` vs `'compete'`). The DB inserts **two rows in `common.gametypes`** but a **single set of psychicnum tables** — the `psychicnum.games.mode` column is denormalized for RLS branching, and one `psychicnum.create_game(target_club, setup, player_user_ids, mode)` RPC routes both manifests' Start clicks.

`baseGametype: 'psychicnum'` is the family key — anywhere code wants "treat these as siblings" (docs lookup, future ClubPage side-by-side rendering), it filters on this field. See [`src/common/lib/games.ts`](../../src/common/lib/games.ts) → `GameManifest.baseGametype` + `mode`.

A timer that runs out is NOT what makes a game "compete" — compete needs an opposing PLAYER. Solo clubs (1 player) get only the coop button, but coop can still carry a countdown timer (where running out loses the game). The compete manifest's lower bound (2 players) hides it server-side too.

## The rules

> Spec the RPCs implement against. When the rules disagree with the code, fix this section first.

### Setup (both modes)

- A **board of N words** (N = `word_count`, 5–20, chosen at setup), sampled from `common.words` at create-game time under a clean (`crude=0 AND slur=0`) + `american` + non-`slang` + `difficulty ≤ band` filter. **Three of the board words are secret**; the same three for everyone, and players win by finding **all three** (by clicking a word tile or typing the word).
- The board words are **public** (you see and click them). The three secrets are **hidden server-side** — clients can't tell which words are secret during play even with devtools open — see [The hidden-secrets mechanic](#the-hidden-secrets-mechanic) below.
- A guessed word colors its board tile **permanently** — green if it's a secret, red if not. A guess must be one of the board words.
- **Two helpers, both free + logged amber in the turn log, neither finds the secret or decrements the budget:**
  - **Hint** (`request_hint`): shows the *clue* for an unfound secret (`common.words.hint` — a category/near-synonym nudge). Many words have no clue, so it falls back to the literal "No hint available". The clue (not the word) is what's logged, so a hint never leaks the answer.
  - **Reveal** (`request_reveal`): shows the *answer* — an unfound secret word itself. The toy "hint that's really the answer."
- Setup form collects: **guess budget** (one of 3/5/7/9), **words on the board** (`word_count`, 5–20), **word difficulty** (the shared `<DifficultyField>` band), **timer** (none/countup/countdown, MM:SS for countdown).
- The mode (coop vs compete) is **NOT** a setup field — it's locked at the gametype level, picked by which Start button the player clicks. See [The sibling-manifest pattern](#the-sibling-manifest-pattern) above.

### Coop gameplay

- All players share a single guess pool (initial value = `setup.guesses`) **and one board**.
- Every guess decrements **everyone's** budget — coop budgets always equal each other (the per-player rows just happen to track the same number, decremented in lock-step).
- Every guess (and hint) is visible to every club member (the turn log shows all of them). A teammate's guess is narrated in the header (green/red), and a teammate's hint request as "X asked for a hint" (amber).
- A number already taken (by anyone) can't be re-guessed.
- **Win:** the team collectively finds all three secrets. Whole team wins.
- **Lose:** the guess that takes the shared budget to zero before the set is complete. Whole team loses.
- **Timeout (if countdown set):** countdown hits zero → whole team loses.

### Compete gameplay

- Each player gets their own guess budget (initial value = `setup.guesses` per player) **and their own private board**; each races to find all three themselves.
- Each guess decrements only the submitter's budget.
- A player sees:
  - **Their own** guesses + results + hints (the turn log + board filter server-side via RLS).
  - **Opponents' remaining budget** (a strip in the action slot) AND a header pill when an opponent finds a secret — "X guessed a secret word" — the *count*, never *which* word (`players.secrets_found` is public; the values stay hidden).
  - **NOT** opponents' guesses, hints, or which numbers they've found.
- **Win:** the first player to find all three ends the game for everyone. That player wins; everyone else loses immediately, even if they had budget remaining.
- **Lose (collective):** all player budgets reach zero with nobody having completed the set. Everyone loses.
- **Timeout (if countdown set):** countdown hits zero → everyone loses.

### What the game is not

- **Not a turn-based game.** Any player can guess at any time. The server serializes simultaneous guesses via `SELECT ... FOR UPDATE` on the game row.
- **Not strategic.** There's no skill in the spec — it's "guess a random number." The "fun" parameter is left at zero.
- **Slated for removal after beta** — once the roster has filled in (Boggle, crosswords, etc.), the toy stops earning its keep. The removal will validate the **removability-in-three-actions** invariant for real: `rm -rf src/psychicnum/`, drop the two entries from `src/games.ts` AND drop the two `common.gametypes` rows from the schema, drop the migration file. If anything else breaks, the architecture leaked.

## Schema: `psychicnum.*`

### Tables

| table | purpose |
|---|---|
| `games` | One row per playing. `club_handle` ties to `common.clubs`. Holds `words text[]` (the N board words, PUBLIC), `secrets text[]` (the three secret words, a subset of `words`, hidden), and `mode` ('coop' or 'compete', denormalized for RLS branching). Play-state (`play_state` + `is_terminal`) and the setup blob both live on `common.games`. |
| `players` | Per-player budget + progress tracking. One row per (game, player), with `guesses_remaining` and `secrets_found` (0..3, public — the compete opponent-progress count). Seeded at create-game time from `setup.guesses`. Coop decrements every row in lock-step; compete decrements only the guesser's row. Per-player outcome (`won` / `lost`) is NOT here — it goes on `common.game_players.result` at game-end via `common.end_game`. |
| `guesses` | Append-only log of every guess **and helper**. One row per event, with `user_id`, `word`, `was_correct`, `kind` ('guess' \| 'hint' \| 'reveal'), `guessed_at`. `'reveal'` rows carry the answer word; `'hint'` rows carry the *clue text* in `word` (not the secret — no leak); both render amber in the turn log. Everything that computes from real guesses filters `kind='guess'`. RLS in compete mode scopes visibility to caller only. |

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
| **`submit_timeout` terminal**          | `play_state='lost'`, outcome `lost_timeout`                 | `play_state='lost_compete'`, outcome `lost_compete_timeout`          |
| **listing-label `status.guesses_remaining`** | Shared value (all rows have it; any row works)        | Sum of all rows (the listing label reflects "total remaining budget across the game") |
| **FE PlayArea header**                 | "X guesses left" (single shared number)                     | Budget strip: "You: X · Bea: Y · Cade: Z"                            |
| **FE GameTurnLog**                    | Every guess shown with username                             | Only caller's guesses shown (RLS filters server-side; FE doesn't need to filter) |
| **GameOverModal verdict copy**         | "You win!" / "You lost: out of guesses" (team)              | "You won the race!" / "Beaten to the punch." (per-self)              |

The shape that's the same in both modes:
- The `psychicnum.games` table (modulo the `mode` value).
- The `psychicnum.players` table (one row per player; structurally identical).
- The `psychicnum.guesses` table (rows look the same; RLS hides them differently).
- The setup blob (`{ guesses, timer }`) — same fields, same defaults.
- The hidden-secrets mechanic — both modes reveal the three secrets post-terminal via `games_state`.
- `common.games.title` formula (a random `#NNNNNN` id — see [Title formula](#title-formula)).
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
- **compete: Concede, not End.** `psychicnum.concede` is the compete-mode per-player drop-out. psychicnum is an **elimination** game (each player has an independent guess budget; the game ends only when every budget is exhausted or someone finds the whole set), so concede calls `common._set_conceded` then ends the game as a collective loss iff no non-conceded player still has budget (a conceder's leftover budget is excluded — `submit_guess`'s all-exhausted check sums only non-conceded players too). FE: `<ConcedeGameButton>` in compete, conceder "out" in the OpponentStrip, folded into the existing out-of-guesses locally-terminal look. See [common.md → Concede](../common.md#concede--per-player-drop-out). pgTAP: `concede_test.sql`.

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

(`players.secrets_found` is a deliberately *public* companion — the count of secrets each player has found, 0..3. It leaks how many, never which: enough for compete opponent tension, the smallest "show progress, not answers" surface.)

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
  -- inside _secrets_for(g uuid):
  select case when c.is_terminal then p.secrets end
    from psychicnum.games p
    join common.games c on c.id = p.id
   where p.id = g;
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

After validation, samples `word_count` distinct board words from `common.words` (clean + american + non-slang + `difficulty ≤ band`), then three of those as the secrets, then calls `common.create_game(...)` — which inserts the `common.games` header (`is_current_view=true`, `play_state='playing'`, with `setup` persisted on `common.games.setup`), then inserts the psychicnum.games row (`words` + `secrets`), then inserts one `psychicnum.players` row per player_user_ids entry with `guesses_remaining` seeded from `setup.guesses`.

**Player-count gates:**
- Coop: `common.require_player_count_max(player_user_ids, 6)`. Matches `numberOfPlayers: [1, 6]`.
- Compete: same max-6 plus an explicit `array_length >= 2` check. Matches `numberOfPlayers: [2, 6]`.

Reject reasons: not authenticated; not a member; `mode` not in `{coop, compete}`; compete with <2 players; >6 players; `setup.guesses` not in {3, 5, 7, 9} or missing; `setup.word_count` not 5..20 or missing; `setup.difficulty` not 1..6 or missing; bad `setup.timer` shape (see [Timer](#timer-server-authoritative-ticks) below).

### Title formula

A random short numeric id, formatted `#NNNNNN` (six zero-padded digits, e.g. `#042317`). The title is purely a human-readable label for the game row in club lists — it must **not** reference the secrets, because `common.games.title` is club-wide readable and would put them in plain sight. The column-level grant on `psychicnum.games.secrets` (described in [The hidden-secrets mechanic](#the-hidden-secrets-mechanic)) is the canonical "true server-side secret." (We don't care about friends peeking via devtools — see [CLAUDE.md → Trust model](../../CLAUDE.md) — but the secrets shouldn't sit in a label-shaped column that exists for a different purpose.)

### `psychicnum.submit_guess(target_game uuid, guess text) → text`

The only mid-game guess action. The guess must be one of the board words (compared case-folded — the player clicks a tile or types a board word). There are three secrets; players win by finding all three, so a correct guess no longer ends the game by itself — only the one that completes the set does. Returns one of:

- `'won'` — found the last needed secret; caller (compete) / team (coop) wins. Terminal.
- `'correct'` — found a secret, but more remain. Game continues.
- `'wrong'` — missed. Game continues.
- `'lost'` — the guess (right or wrong) that exhausted the last available budget without completing the set. Terminal.

The FE flashes green for `'won'`/`'correct'`, red for `'wrong'`; the terminal transition it observes via realtime, not the return value.

**Mode-aware budget decrement:**
- Coop: decrements every `psychicnum.players` row.
- Compete: decrements only the caller's row.

A correct guess bumps the caller's `players.secrets_found`. "Found all three" is scoped per mode — coop counts the **team's** distinct correct guesses; compete counts the **caller's** own.

**Mode-aware terminal-on-set-complete:**
- Coop: the team found all three → `play_state='won'`, every player's `result = {won: true}`.
- Compete: the caller found all three → `play_state='won_compete'`, caller's `result = {won: true}`, everyone else's `result = {won: false}`. Game ends for everyone — opponents with remaining budget no longer get to try.

**Mode-aware terminal-on-all-exhausted:**
- Coop: the guess that takes the shared count to 0 before the set is complete → `play_state='lost'`.
- Compete: `play_state='lost_compete'` only when the sum of all players' budgets reaches 0 (everyone's exhausted, nobody completed the set).

Locks the gametype row with `SELECT ... FOR UPDATE` to serialize concurrent guesses. If two compete-mode players complete their sets at the same instant, whichever transaction commits first wins; the second sees `play_state != 'playing'` and raises `'game is not active'`.

Records every guess in `psychicnum.guesses` (`kind='guess'`, `word` lowercased, `was_correct` set). A word already taken (game-wide in coop, caller's own in compete) is **rejected** (`'word already guessed'`) — the FE disables guessed tiles, this is the server guard. Hint rows don't count, so a hinted word can still be guessed.

Reject reasons:

- not authenticated
- not a word on the board
- game not found
- not a game player
- game status ≠ playing
- word already guessed (in scope)
- caller has 0 guesses remaining

### `psychicnum.request_hint(target_game uuid) → text` and `request_reveal(target_game uuid) → text`

Two helper RPCs, both: pick an as-yet-unfound secret (scoped like the win check — coop = the team's, compete = the caller's — via the shared `_unfound_secret(g, caller)` helper); log a row that flows into the turn log over realtime; cost **nothing** (no budget decrement) and do **not** find the secret. Coop teammates get a header pill; compete scopes the row to the caller via RLS. Guarded like a move (game player, status = playing).

- **`request_reveal`** logs a `kind='reveal'` row with the secret **word** (the answer) and returns it. Teammate pill: "X revealed a word".
- **`request_hint`** looks up that word's **clue** (`common.words.hint`), logs a `kind='hint'` row with the *clue text* (or the literal "No hint available" when the word has none — the row never carries the secret word), and returns the clue. Teammate pill: "X asked for a hint".

### `psychicnum.submit_timeout(target_game uuid)`

Fires when the FE's count-down timer expires. Calls `common.end_game` with:
- Coop: `play_state = 'lost'`, `status->>'outcome' = 'lost_timeout'`.
- Compete: `play_state = 'lost_compete'`, `status->>'outcome' = 'lost_compete_timeout'`.

Either way, **everyone loses** — `common.game_players.result = {won: false}` for every player. Compete-mode players were racing; the clock running out before anyone won is a collective loss.

Idempotent on the terminal-state guard: a second concurrent call from a racing client raises `P0001 'game is not active'`, which the FE swallows. See [Timer](#timer-server-authoritative-ticks).

Reject reasons: not authenticated; not a game player; game not found; game status ≠ playing.

### `psychicnum.end_game(target_game uuid)`

The **End** button in the info-column action row (both modes) fires this, behind a `window.confirm`. It's the explicit manual stop — any current game player can decide the group is done. (Unlike most games, which put end-game on the GamePage menu via `useEndGameMenu`, psychicnum surfaces it as a visible button — so it does NOT register a per-game menu item.)

Unlike `submit_timeout`, a manual stop is **neither a win nor a loss**, so it writes the uniform terminal `play_state = 'ended'` with `status = {outcome:'manual', mode}` and `result = {won: false}` for every player (psychicnum tracks no per-player score, so there's nothing richer to record). Same shape across both modes. The FE renders `'ended'` neutrally — green "Game ended" copy, not the red loss treatment.

Idempotent on the terminal-state guard: a second concurrent call raises `P0001 'game is not in progress'`, which the FE swallows. **Realtime touch at the tail** (`update psychicnum.games set club_handle = club_handle …`) — same trick as `submit_timeout`: `common.end_game` only writes `common.games`, so the no-op self-set produces the WAL entry that wakes the FE's `psychicnum.games` subscription to refetch and reveal the secrets.

Reject reasons: not authenticated; not a game player; game not found; game status ≠ playing.

## Setup

The start-game dialog collects these options from the players before `create_game` fires:

- **`guesses`**: total guess budget shared across all club members, one of `{3, 5, 7, 9}`. 7 is the default.
- **`word_count`**: how many words on the board, 5..20 (default 10). Three of them are secret.
- **`difficulty`**: dictionary band 1..6 (Universal..Expert, default 3), a `common.words.difficulty` value — the board is sampled at `difficulty ≤ this`. Rendered by the shared `<DifficultyField>`.
- **`timer`**: timer mode — `none`, `countup`, or `countdown` with a player-chosen MM:SS duration. Rendered by the shared `<TimerField>`, validated server-side by `common.validate_timer`. See [Timer](#timer-server-authoritative-ticks) below.

Shape stored on `common.games.setup` (jsonb): `{ "guesses": 3|5|7|9, "word_count": 5..20, "difficulty": 1..6, "timer": {…} }`. The mutable `guesses_remaining` counter is initialized from `setup.guesses` at create-game time; the blob persists the original choices on the common header for end-of-game review.

The FE side: `src/psychicnum/lib/setup.ts` (the `PsychicnumSetup` type) and `src/psychicnum/components/SetupForm.tsx` (the form body, lazy-loaded inside the common `SetupGameDialog`). The server is the canonical authority for what shapes are accepted — the TypeScript narrowing is advisory.

## Timer (server-authoritative ticks)

Standard `<TimerField>` + `useGameTimer` setup — same as connections; see [`connections.md → Timer`](connections.md#timer-server-authoritative-ticks) for the design rationale and drift bounds. Psychic-num-specific: countdown expiry calls `psychicnum.submit_timeout`, which flips `play_state` to `lost`.

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
    PlayArea.tsx          Two-column composition on the SHARED PlayArea scaffold
                          (common/components/game/PlayArea.module.css, imported as `shared`;
                          shell + info-column readout classes + the shared .tile chrome —
                          PlayArea.module.css now holds only .inputMessage):
                            WordBoard (grid of word tiles on the shared beige --tile-*
                              system; guessed tiles permanently green=secret / red=miss)
                            <EntryRow> (the shared capture-entry control: icon Delete +
                              EntryBox + icon Submit + keyboard) + submit_guess RPC — during play
                            info readouts (setup details / state / help) +
                              action row: Hint / Reveal / End — playing
                            Shuffle button — FLOATS over the board top-right
                              (board-visual, not a turn action); always live
                            terminal: outcome line + "‹ club" button (in action row)
                            GameTurnLog (chronological guess + hint log, auto-scroll)
                            GameOverModal (shared) — pops on terminal entry
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
                          submit_guess dispatch lives in PlayArea.
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
    GameTurnLog.module.css
    SetupForm.tsx         The setup form (guesses + word_count + difficulty + timer)
                          mounted in the common SetupGameDialog.
    SetupForm.module.css
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
    ownMove.ts            Builds the caller's own below-board pill (Correct / Incorrect /
                          validation error) — pulled out of PlayArea so BoardCol and
                          PlayArea share one builder.
    history.ts            The turn-history replay (pure + unit-tested). Given the guess log
                          + a turn's **position** in it, reconstruct the `word → was_correct`
                          map as of that turn — ADD-style (a guess only ever ADDS a permanent
                          green/red mark, so a past board is the guesses folded up to that
                          turn), boundary **inclusive** (viewing turn N shows the board AFTER
                          N's guess, with N's guessed tile ringed). Hint / reveal turns mark no
                          tile. Keyed by **log position** (the `#N` the log shows). Clicking a
                          `GameTurnLog` `#N` opens that turn on the board via the shared viewer.
    history.test.ts       Unit tests for the fold + inclusive boundary + hint/reveal no-ops.
```

### `PlayArea`

A two-column composition. Reads `playState`, `isTerminal`, `timer`, `setup`, `status`, `goToClub`, `feedback` from `GamePageCtx`. The info column's non-log area is the four named readouts (see [`ui.md` → PlayArea layout](../ui.md#playarea-layout)): **setup** (a `<details>` "Setup options" — tiles / secrets / difficulty), **state** ("X/3 found · used/total guesses used"), **help** (muted "Click or type a word…"), and the **action row** (**Hint** / **Reveal** / **Shuffle** / **End**). On terminal, the guess entry's slot (below the board) shows the reveal — "The words were APPLE, RIVER, STONE"; setup + state stay; help hides; and the action row becomes a bold, outcome-colored result line ("You won!" green / "Out of guesses" red / "Game over" neutral) + a compact "‹ club" button. `<GameTurnLog>` always renders below it. The shared `<GameOverModal>` (see [`ui.md` → Modals for terminal results](../ui.md#modals-for-terminal-results)) pops on terminal entry with a per-status verdict — "You found all three!" / "You lost: out of guesses." **Feedback splits local vs group** (see [`ui.md`](../ui.md) + [`deferred.md`](../deferred.md#feedback-channels-local-vs-group)): the player's own guess shows "Correct"/"Incorrect" as the shared below-board `<GenericFeedbackPill>` (`useLocalFeedback`, in the fixed-height `.localFeedback` slot, dismissed on the next move — local); teammates' guesses/hints (coop) and opponents-found-a-secret (compete) are header pills (group). Guessed tiles stay permanently green (secret) / red (miss). **Decomposed** into a `BoardCol` (the WordBoard + `<EntryRow>` input engine + the below-board feedback + the `submit_guess` dispatch + Shuffle) and an `InfoCol` (the readouts + `GameTurnLog`); PlayArea is the thin coordinator (`useGame` + the turn-history `viewingIndex`). **Turn-history viewer:** clicking a log `#N` replays that turn — the guessed tile wears its green/red outcome color plus a yellow ring, input freezes until you leave (a keystroke / click / ✕). The snapshot is `lib/history.ts`; the own-move pill builder is `lib/ownMove.ts`. Everything cross-cutting (logo, chat, pause, timer, the global UserMenu) is the responsibility of `<GamePage>` / App.

### `useGame`

Reads from `psychicnum.games_state` (the view that exposes `secrets` conditionally on terminal status — see [The hidden-secrets mechanic](#the-hidden-secrets-mechanic)). `game.words: string[]` is the public board; `game.secrets: string[] | null` comes back `null` while active, the actual three words once terminal. No separate reveal effect. Also reads `players` (with the public `secrets_found` count) and `guesses` (each carrying `word` + `kind: 'guess' | 'hint'`).

Drives off the shared [`useRealtimeRefetch`](../../src/common/hooks/realtime/useRealtimeRefetch.ts) factory with a three-table subscription on `psychicnum.{games, players, guesses}`. The factory owns the per-effect UUID-suffixed channel name, the SUBSCRIBED-driven refetch, and the cleanup; this hook just declares its tables + writes the `load({ mounted })` callback. See `code-conventions.md` → "Realtime data hooks" for the factory contract.

The `members` array used by `GameTurnLog` for "[ada] guessed 7" attribution comes from `useCommonGame` (via GamePage's render-prop).

### Code-splitting

Same pattern as codenamesduet — the manifest's `PlayArea` is lazy-loaded. The build emits psychicnum's JS as its own chunk (~4 KB gzipped); users who only play codenamesduet never download it.

## Psychic-num testing

See [`testing.md`](../testing.md) for theory and shared setup. Psychic-num-specific notes:

### pgTAP files

| file | covers |
|---|---|
| `tests/psychicnum/create_game_test.sql` | Auth, membership, happy path, `setup.{guesses,word_count}` validation, `setup.timer` shape spot-checks (the shared validator's full grid lives in connections's create_game test), `is_current_view` flips via `common.games`, title formula, `word_count` board words + three secrets drawn from them, column-level grant blocks SELECT of `secrets`. |
| `tests/psychicnum/gameplay_test.sql` | Board-word guard (a word not on the board rejected), finding a secret returns `'correct'` and bumps `secrets_found`, finding the last returns `'won'` and flips `play_state`, wrong guess decrements (per-mode), re-guessing a taken word rejected, `request_hint` logs the clue (or "No hint available" fallback) and `request_reveal` logs the answer word — both `kind` rows, neither spends budget, budget-exhausted loss, `submit_timeout` happy path. |
| `tests/psychicnum/rls_test.sql` | dee (non-member) sees zero rows from both tables and from `games_state`, mutating RPCs throw. Members reading `games_state` see `secrets IS NULL` while active and the actual array once status is terminal — exercising both the `security_invoker` row-gating and the `_secrets_for` helper's CASE. |

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

## Open items

- **No anti-spam.** Friends-only audience; not a concern. The 7-guess cap caps damage anyway.

## File locations

| asking… | look at… |
|---|---|
| What does an RPC do | [`supabase/migrations/20260615000002_psychicnum.sql`](../../supabase/migrations/20260615000002_psychicnum.sql) |
| What does the UI look like | [`src/psychicnum/components/PlayArea.tsx`](../../src/psychicnum/components/PlayArea.tsx) (word entry is the shared [`common/components/game/entry/EntryRow.tsx`](../../src/common/components/game/entry/EntryRow.tsx)) + `GameTurnLog.tsx` alongside; the terminal modal is the shared `common/components/game/terminal/GameOverModal.tsx` |
| How does state flow on the FE | [`src/psychicnum/hooks/useGame.ts`](../../src/psychicnum/hooks/useGame.ts) (reads from `games_state`) |
| Are the secrets really hidden? | column-level grant + `psychicnum.games_state` view with `_secrets_for` helper in the migration; SELECT-blocked test in [`tests/psychicnum/create_game_test.sql`](../../supabase/tests/psychicnum/create_game_test.sql) and view-behavior test in [`tests/psychicnum/rls_test.sql`](../../supabase/tests/psychicnum/rls_test.sql) |
