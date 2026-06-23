# WordNerd

A NYT-Wordle-style guess-the-word game. The seventh registered gametype. **WordNerd** is the user-facing brand; **`wordle`** is the codename everywhere in code (schema, folder, gametype strings).

For the shared layer (clubs, profiles, routing, the registry) see [`common.md`](../common.md); for testing conventions see [`testing.md`](../testing.md).

**Manifest declarations.** Two-manifest family (sibling pattern) — `wordleCoopGame` (`wordle_coop`, `[1,6]`) and `wordleCompeteGame` (`wordle_compete`, `[2,6]`). Both share `baseGametype: 'wordle'`, one schema, and one PlayArea / SetupForm / Help; the mode branches at render time on `game.mode`.

## What the game is

A hidden **5-letter target**. Players type 5-letter guesses; each guess comes back colored per letter:

- **Green** — right letter, right spot.
- **Yellow** — in the word, wrong spot.
- **Gray** — not in the word.

with the standard duplicate-letter accounting (a letter only earns a yellow if there's an unconsumed copy left after greens are claimed). Win by guessing the word within the budget.

### Rules

- **Guess budget:** 5–8 (set at create-game; **6** is classic). Coop: shared by the team. Compete: each player's own.
- **A guess must be a real word** — `len = 5 AND difficulty ≤ 4` in `common.words` (no dialect/slang/slur filter; Wordle is permissive on guesses). A guess that's malformed, not a word, or already on the board is **soft-rejected and does NOT cost a guess** (classic Wordle "not in word list").
- **The target** is a random word from the curated Wordle answer list (`common.words.wordle`, minus the lone slur-flagged entry — a slur as the secret answer is worse than allowing it as a guess). Every answer is `len = 5, difficulty ≤ 4`, so it's always typeable.
- **Lifecycle.** Win = guess the word. Lose = exhaust the budget. A countdown timer (optional) ends the game on expiry; either player may hit **End game** for a neutral stop.

### Coop vs compete

**Coop** — ONE shared board. Either player guesses; once submitted, the guess (and its colors) is visible to both. The budget is shared. The team wins together when anyone solves it.

**Compete** — same target, **independent boards**. Players don't see each other's guesses until the game ends (RLS hides them). The game ends once **every** player is done (solved or out of guesses); the winner is whoever solved in the **fewest** guesses, tie-break **earliest** solve. A player who can no longer win still plays their board out. The OpponentStrip shows each opponent's **guess count** (not their letters).

## Vocabulary

| term | meaning |
|---|---|
| **target** | The hidden 5-letter answer. Stored on `wordle.games`, HIDDEN via a column grant, revealed post-terminal through `games_state`. |
| **guess** | A submitted 5-letter word. Accepted ones land in `wordle.guesses` with their `colors`. |
| **colors** | The 5-char `g`/`y`/`x` feedback string (`wordle.compute_colors`), the single source of truth — the FE renders it, never recomputes it. |
| **soft reject** | A guess that's malformed / not-a-word / duplicate: feedback, but no guess consumed and no row written. |

## Schema (`wordle.*`)

Mirrors waffle's hidden-answer pattern (a HIDDEN `target`) plus freebee's per-guess log with mode-aware RLS.

| table | purpose |
|---|---|
| `wordle.games` → `common.games(id)` | `mode` (`coop`/`compete`), **`target char(5)` HIDDEN** (column-grant revoked; revealed post-terminal via `games_state` + the `_target_for` SECURITY DEFINER helper), `max_guesses`. |
| `wordle.players` PK `(game_id, user_id)` | `guesses_used`, `solved`, `solved_at`. Coop: lock-step (shared budget). Compete: independent. |
| `wordle.guesses` PK `(game_id, user_id, guess_index)` | `guess`, `colors`, `is_correct`. **RLS** (mirrors `freebee.found_words`): coop → club sees all; compete → see your own, opponents revealed only at `is_terminal`. |

- **`wordle.compute_colors(guess, answer) → text`** — the two-pass green-then-yellow algorithm with duplicate-letter accounting (a duplicate of `waffle._wordle_colors`; the removability invariant forbids cross-game refs).
- **`wordle.games_state`** (`security_invoker`) — the game header with `target` only post-terminal.
- Realtime on `wordle.{games, players, guesses}`.

## RPCs (all SECURITY DEFINER; **no edge function** — picking a random target is one SQL line)

- **`create_game(club, setup, players, mode)`** — validate (`max_guesses` 5..8, timer, mode); pick `target` = random `where wordle and not slur`; store; seed players; `update_state 'playing'`.
- **`submit_guess(game, guess) → jsonb`** — `FOR UPDATE` lock (coop serialization). Soft rejects (no burn, no row): `invalid` (not 5 a–z), `notAWord` (not in `len=5, difficulty≤4`), `duplicate`. A valid fresh word → compute colors, log it, `guesses_used++` (coop: all rows; compete: caller), set `solved`. Terminal: coop → `won`/`lost`; compete → when every player is done, winner = fewest guesses (tie earliest) → `won_compete`/`lost_compete`. Returns `{ result, colors, guesses_used, solved, terminal }`; `result ∈ correct | incorrect | notAWord | duplicate | invalid`.
- **`submit_timeout`** / **`end_game`** — mirror waffle's (countdown loss / race-resolve; manual neutral `ended`). Both fire a realtime "touch" on `wordle.games` so the FE refetches the now-revealed target.

## Frontend (`src/wordle/`)

`manifest` (sibling pair; `startGameInClub` calls `create_game` directly), `db.ts`, `hooks/useGame` (games_state + players + guesses, refetch pattern), and components:

- **WordleGrid** — `max_guesses × 5` colored-tile board (submitted rows colored by the server feedback; the active row shows in-progress typing). A freshly-landed guess **flips its tiles over one at a time** (NYT-style), each painting its color at the midpoint of the flip; only rows that appear *after mount* animate (a mid-game refresh or revealed opponent history renders static), and `prefers-reduced-motion` skips the flip. The submitted letters stay on the board through the RPC round-trip — PlayArea passes them as a `pending` (uncolored) row that flips in place when the colored server row lands, so there's no blank flash between submit and reveal.
- **Keyboard** — the on-screen QWERTY, each key tinted with the strongest feedback that letter has earned (green > yellow > gray); feeds the same input path as the physical keyboard.
- **GuessList** (right column) — the `guesses-used / allowed` counter over the guess history (coop tags each guess with who entered it, in their member color).
- **PlayArea** — two columns (board + keyboard left; counter + guess list right). Handles typing (physical + on-screen), submits via `submit_guess`, flashes a timed pill on soft rejects, and renders the terminal reveal ("The answer was …") + GameOverModal. Compete adds an OpponentStrip of guess counts.
- **SetupForm** (guesses dropdown + `TimerField`), **Help**.

Chat / pause / timer / the End-game menu item are inherited via `<GamePage>` / `useCommonGame`.

## Tests

- **pgTAP** (`tests/wordle/`): `colors` (the algorithm incl. duplicates), `create_game` (validation + hidden-target grant), `gameplay` (coop soft-rejects don't burn, shared board, win + reveal), `compete` (independent boards, mid-game opponent-hidden RLS, fewest-guesses winner, post-terminal reveal), `end_game` (timeout → lost / manual → ended, idempotency, non-player rejected). Tests read the random target back as the superuser to craft a winning guess.
- **Vitest:** the colors render mapping + `manifest` label (the coloring algorithm itself is server-side, tested in pgTAP).
