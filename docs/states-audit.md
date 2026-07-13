# End-states audit — every game's terminal states, triggers, feedback & listing labels

A cross-game reference for **how each game ends**, catalogued four ways for every gametype:

1. **How each terminal state is reached** — the trigger (timer expiry, mistakes exhausted, grid solved, concede, manual end…) and the RPC that writes it.
2. **Coop vs compete** — shown side-by-side; the two variants reach different terminal `play_state` values.
3. **In-game feedback at end-states** — the exact copy players see in the PlayArea when a game ends (the terminal modal verdict + the info-column message).
4. **Listing label** — the exact string `manifest.labelFor(row)` returns for the club-page games list (the "game-listing-state field"), for every play_state including mid-game — **plus what a shelved (non-terminal, suspended) game shows** (always the `playing` branch).

This is a snapshot; the source of truth is each game's `manifest.ts` (`labelFor`), its migration (`common.end_game` call sites), and its `components/PlayArea.tsx` (`buildOver`). See [states.md](states.md) for the view-state/play-state vocabulary this builds on.

---

## Shared mechanics (read this first)

These patterns recur across every game; the per-game sections below assume them.

### `play_state` / `is_terminal`
`play_state` is a free-text column on `common.games` (no DB enum) — each gametype defines its own vocabulary. Every gametype uses `'playing'` for the default mid-game state. Terminal transitions go through **`common.end_game(target_game, play_state, status, player_results)`**, which sets `play_state`, flips `is_terminal = true`, stamps `ended_at`, **overwrites `status` wholesale**, and writes per-player `result` jsonb. Non-terminal state writes go through `common.update_state(target_game, 'playing', status)`.

### The `_compete` suffix convention
Sibling coop/compete pairs name the compete terminal as the coop name + `_compete`: coop `won`/`lost` → compete `won_compete`/`lost_compete`. connections/waffle/wordle/etc. follow this; boggle is the documented exception (its sole terminal is `'ended'`, winner derived from points — no win-threshold state).

### The neutral `'ended'` terminal
Most games expose a manual **"End game"** that writes a uniform neutral terminal `play_state = 'ended'` with `status.outcome = 'manual'` and every player `{"won": false}`. Its feedback comes from the shared **`endedCopy(mode)`** (`src/common/lib/game/terminalCopy.ts:25-32`): coop verdict `'Game ended.'`, compete verdict `'Game ended — no winner.'`, both `message: 'Game over'`, `tone: 'neutral'`, `outcome: 'won'` (so the modal reads neutral-green, not a red loss). Exceptions: bananagrams has **no** `end_game` (retired for per-player concede); waffle/wordle/scrabble-coop/stackdown/etc. vary — noted per game.

### `concede` (compete only)
Each compete game exposes `<schema>.concede(target_game)` gating to compete, delegating to **`common.concede`**. A single conceder among several racers does **not** end the game — they take a real per-player loss and drop out (a *locally-terminal* look: below-board pill `"You conceded — the rest are still racing."` and an info-column `LocalTerminalRow` labeled `"You conceded"`), while the others race on. Only when the **last** active racer concedes does `common.concede` end the whole game — usually as a collective loss (`play_state 'lost'`/`'lost_compete'`, `status.outcome 'conceded'`, all `{"won": false}`).

### `submit_timeout` (timed games only)
Every timed gametype exposes `submit_timeout`, fired by **every** connected client the moment the browser countdown hits 0. It's idempotent on the terminal-state guard (first call ends the game; the rest raise "not in progress", which the manifest swallows). Games with `timerMode: 'none'` (crosswords) implement it for the interface but never fire it.

### Where the three feedback surfaces live
`buildOver()` in each `PlayArea.tsx` returns `{ outcome, verdict, message, tone }`. Conventionally:
- **`verdict`** → the `GameOverModal` (via `TerminalModal`) big line — modal title bar is always the literal `"Game over"`.
- **`message`** → the info-column outcome line (`TerminalActionRow`), colored by `tone`.
- The **below-board terminal pill** shows either `verdict` or `message` depending on the game (noted per game).

### The listing label & the shelved case
The club page lists games entirely from `common.games`; each row is handed to `manifest.labelFor(row)` → one string (the "status label" on `ClubGameCard`). **A shelved / suspended game is just a non-current, non-terminal game — its `play_state` is still `'playing'`**, so its listing label is exactly the `playing` branch of `labelFor`. There is no separate "suspended" play_state or label. `ClubGameCard` distinguishes `active` / `suspended` / `completed` purely by CSS + a corner-flag (orange = current, yellow = suspended/open, muted = terminal); the *text* is the same `labelFor` output. (`ClubPage` computes `state={g.isTerminal ? 'completed' : 'suspended'}` for non-current games.)

---

## codenamesduet (brand TinySpy) — `codenamesduet` — **coop only**

Cooperative, fixed 2-seat (`numberOfPlayers: [2, 2]`), no compete sibling. "You win together or you lose together."

### Play-state enum
| play_state | terminal? | meaning |
|---|---|---|
| `playing` | no | turn-based clue/guess loop |
| `sudden_death` | no | turn budget ran out, agents remain — still guessable |
| `won` | **yes** | all 15 greens revealed |
| `lost_assassin` | **yes** | assassin revealed |
| `lost_clock` | **yes** | a non-green reveal during sudden death (turns-exhausted loss) |
| `lost_timeout` | **yes** | wall-clock countdown hit 0 |
| `ended` | **yes** | manual "End game" (neutral) |

### How each terminal state is reached
All terminal writes go through `common.end_game`. In `codenamesduet.submit_guess`:
- **`won`** — the 15th green agent is contacted (`green_total >= 15`, migration `…001_codenamesduet.sql:767-774`, committed :790).
- **`lost_assassin`** — a guess reveals a word labeled `'A'` (`:759-762`, committed :790).
- **`lost_clock`** — during `sudden_death`, a guess reveals anything non-green (`:763-766`, committed :790). (`sudden_death` itself is entered non-terminally by `_end_turn` when `remaining <= 1`, `:295-312`.)
- **`lost_timeout`** — browser countdown hits 0 → `submit_timeout` → `common.end_game(…, 'lost_timeout', …)` (`:891-902`).
- **`ended`** — "End game" (confirm `"End the game now? You can't undo this."`, PlayArea.tsx:294) → `common.end_game(…, 'ended', …)` (`:978-983`).

No concede (it's coop).

### In-game feedback at end-states
From `buildOver()` (PlayArea.tsx:83-115). Modal shows `verdict`; info-column shows `message`.
| terminal state | modal `verdict` | info `message` | tone |
|---|---|---|---|
| `won` | `You win!` | `You won!` | won |
| `lost_assassin` | `You lost: assassin revealed` | `Assassin revealed` | lost |
| `lost_clock` | `You lost: out of turns` | `Out of turns` | lost |
| `lost_timeout` | `You lost: out of time` | `Out of time` | lost |
| `ended` | `Game ended.` | `Game over` | neutral |

Non-terminal notice worth recording: the sudden-death standing header pill `Sudden death — any non-green reveal loses` (PlayArea.tsx:163).

### Listing label (`labelFor`)
`labelFor: (row) => STATUS_LABEL[row.play_state] ?? row.play_state` (manifest.ts:106). Static strings — **no status placeholders** (Duet is coop; no winner name).
| play_state | label |
|---|---|
| `playing` | `in progress` |
| `sudden_death` | `sudden death` |
| `won` | `won` |
| `lost_assassin` | `lost (assassin)` |
| `lost_clock` | `lost (ran out of turns)` |
| `lost_timeout` | `lost (ran out of time)` |
| `ended` | `ended` |

### Shelved (non-terminal, suspended)
Fixed literal **`in progress`** (or `sudden death` if shelved mid-sudden-death). No counts, no interpolation.

---

## psychicnum (brand PsychicNum) — `psychicnum_coop` / `psychicnum_compete`

### Play-state enum
| play_state | mode | terminal? |
|---|---|---|
| `playing` | both | no |
| `won` | coop | **yes** |
| `lost` | coop | **yes** |
| `won_compete` | compete | **yes** |
| `lost_compete` | compete | **yes** |
| `ended` | both | **yes** (neutral manual) |

### How each terminal state is reached
Migration `…002_psychicnum.sql`, in `submit_guess` / `submit_timeout` / `concede` / `end_game`:
- **coop `won`** — team's distinct-correct set reaches all 3 secrets (`found_count >= total_secrets`, :666, committed :683-691).
- **coop `lost`** — the guess that drops total remaining budget to 0 (:704); **or** timer expiry (`submit_timeout` coop, :1003).
- **compete `won_compete`** — the caller's *own* distinct-correct set reaches 3 (:679); caller is winner, everyone else `{"won": false}`.
- **compete `lost_compete`** — all budgets exhausted (:711); **or** timer expiry (:1006); **or** last-player concede with nobody having won (:794).
- **`ended`** (both) — manual `end_game`, `outcome='manual'` (:1108-1113).

### In-game feedback at end-states
From `buildOver()` (PlayArea.tsx:420-462). A below-board pill also reveals the secrets: `The words were <A, B, C>` (BoardCol.tsx:227).
| state | verdict | message | tone |
|---|---|---|---|
| coop `won` | `You found all three!` | `You won!` | won |
| coop `lost` (budget) | `You lost: out of guesses` | `Out of guesses` | lost |
| coop `lost` (timer) | `You lost: out of time` | `Timer elapsed` | lost |
| compete `won_compete` (you won) | `You won the race!` | `You won!` | won |
| compete `won_compete` (beaten) | `Beaten to the punch.` | `${winnerName} won` | lost |
| compete `lost_compete` (budget) | `Out of guesses — nobody won.` | `Out of guesses` | lost |
| compete `lost_compete` (timer) | `Out of time — nobody won.` | `Timer elapsed` | lost |
| `ended` coop | `Game ended.` | `Game over` | neutral |
| `ended` compete | `Game ended — no winner.` | `Game over` | neutral |

### Listing label (`labelFor`)
Coop (manifest.ts:145-155) / compete (:186-196); `name = status.winner_username ?? 'someone'`.
| play_state | coop label | compete label |
|---|---|---|
| `playing` | `labelMidGame` (see below) | `labelMidGame` |
| `won` | `won — ${name} guessed it` | — |
| `won_compete` | — | `${name} won the race` |
| `ended` | `ended` | `ended` |
| `lost` / `lost_compete` (fall-through) | `lost` | `time/budget out — no winner` |

### Shelved (non-terminal, suspended)
`labelMidGame` (manifest.ts:104-109): **`${remaining} ${word} left`** — e.g. `5 guesses left`, `1 guess left`, `0 guesses left`. (`remaining = status.guesses_remaining ?? 0`.)

---

## connections (brand WordKnit) — `connections_coop` / `connections_compete`

### Play-state enum
| play_state | mode | terminal? |
|---|---|---|
| `playing` | both | no |
| `solved` | coop | **yes** |
| `lost` | coop | **yes** |
| `solved_compete` | compete | **yes** |
| `lost_compete` | compete | **yes** |
| `ended` | both | **yes** (neutral) |

### How each terminal state is reached
Migration `…003_connections.sql`:
- **coop `solved`** — a correct guess brings total correct to 4 categories (`matched_count >= 4`, :806-825).
- **coop `lost`** — 4 mistakes (`caller_mistakes >= 4`, :912-941); **or** timer expiry (`submit_timeout` coop, `outcome 'lost_timeout'`, :1075-1098).
- **compete `solved_compete`** — first player's own correct count hits 4 (`caller_matched >= 4`, :841-863); race ends, others lose.
- **compete `lost_compete`** — all players eliminated (4 mistakes each) or conceded, via `_maybe_finish_compete` (:615-646); **or** timer expiry (`outcome 'lost_compete_timeout'`, :1099-1111).
- **`ended`** (both) — manual `end_game`, `outcome='manual'` (:1155-1228).

A single player hitting 4 mistakes / conceding in compete is **not** a game terminal (survivors keep playing).

### In-game feedback at end-states
From `buildOver()` (PlayArea.tsx:420-474). Modal + below-board pill show `verdict`; info-column shows `message`.
| state | verdict | message | tone |
|---|---|---|---|
| coop `solved` | `You win!` | `You won!` | won |
| coop `lost` (mistakes) | `You lost: out of mistakes` | `Out of mistakes` | lost |
| coop `lost` (timer) | `You lost: out of time` | `Out of time` | lost |
| compete `solved_compete` (you won) | `You won the race!` | `You won!` | won |
| compete `solved_compete` (you, out of mistakes) | `You lost: out of mistakes` | `Out of mistakes` | lost |
| compete `solved_compete` (beaten, still racing) | `Beaten to the punch.` | `Opponent won` | lost |
| compete `lost_compete` (all eliminated) | `Everyone eliminated — nobody won.` | `All eliminated` | lost |
| compete `lost_compete` (timer) | `Out of time — nobody won.` | `Out of time` | lost |
| `ended` coop / compete | `Game ended.` / `Game ended — no winner.` | `Game over` | neutral |

Coop-only peer narration (non-terminal, `useGlobalFeedback`): `● found COLORS!` / `● was one away` / `● guessed wrong`.

### Listing label (`labelFor`)
Coop (manifest.ts:212-227) reads `status.matched_count` + `status.mistake_count`; compete (:265-275) is deliberately numeric-free, reads `status.winner_username`.
| play_state | coop label | compete label |
|---|---|---|
| `playing` | `${matched}/4 categories · ${mistakes}/4 mistakes` | `in progress` |
| `solved` | `solved · ${mistakes} mistakes` | — |
| `solved_compete` | — | `${name} won the race` (`name = winner_username ?? 'someone'`) |
| `ended` | `${matched}/4 categories · ended` | `ended` |
| `lost` / `lost_compete` (fall-through) | `lost · ${matched}/4 matched` | `time out — no winner` |

### Shelved (non-terminal, suspended)
- **coop:** `${matched}/4 categories · ${mistakes}/4 mistakes` — e.g. `1/4 categories · 0/4 mistakes`.
- **compete:** the literal `in progress`.

---

## spellingbee (brand FreeBee) — `spellingbee_coop` / `spellingbee_compete`

### Play-state enum
| play_state | mode | terminal? |
|---|---|---|
| `playing` | both | no |
| `won_compete` | compete | **yes** |
| `ended` | both | **yes** (win-less finish for coop; timeout/manual) |
| `lost` | compete | **yes** (all-conceded only) |

Coop has **no win terminal** — coop only ever reaches `ended` (there's no auto-end at 100% found). Compete's positive terminal is `won_compete`.

### How each terminal state is reached
Migration `…spellingbee.sql`:
- **compete `won_compete`** — a player's own score reaches the target rank (`caller_rank_idx >= current_target_rank`, :943), freezes the leaderboard, `end_game(…, 'won_compete', …)` (:970-990).
- **`ended` via timeout** (both) — countdown hits 0 → `submit_timeout` → `end_game(…, 'ended', outcome 'timeout')` (coop :1122, compete :1156).
- **`ended` via manual** (both) — `end_game` button → `outcome 'manual'` (coop :1259, compete :1295).
- **compete `lost` via all-conceded** — `common.concede` when the last racer drops (`outcome 'conceded'`, common `…1612-1616`).

### In-game feedback at end-states
From `buildOver()` (PlayArea.tsx:507-601). `rankLabel(name)` renders e.g. `rank "Solid"`.
| state | verdict | message | tone |
|---|---|---|---|
| coop `ended`, Genius (rank ≥ 6) | `Genius! ${foundScore}/${requiredScore} points.` | `Genius!` | won |
| coop `ended`, below Genius (timeout **or** manual) | `Stopped at ${rankLabel} — ${foundScore}/${requiredScore} points.` | `Stopped at ${rankLabel}` | neutral |
| compete `won_compete` (you won) | `You won the race — reached ${rankLabel(target)}!` | `You won!` | won |
| compete `won_compete` (beaten) | `${winnerName} beat you to ${rankLabel(target)}.` | `${winnerName} won` | lost |
| compete `ended` (timeout) | `Time's up — no winner at ${rankLabel(target)}.` | `Time up` | lost |
| compete `ended` (manual) | `Game ended — no winner at ${rankLabel(target)}.` | `Game ended` | neutral |

**Known quirk:** compete `lost` (all-conceded) has no dedicated `buildOver` branch — it falls through the `ended`-compete block and, since `outcome='conceded'` (not `'timeout'`), renders the **manual-end** copy (`Game ended — no winner…`, neutral), not a loss verdict.

### Listing label (`labelFor`)
Coop (manifest.ts:122-145) surfaces score+word counts; compete (:183-207) is rank-only.
| play_state / outcome | coop label | compete label |
|---|---|---|
| `playing` | `${foundScore}/${requiredScore} pts · ${foundCount}/${requiredCount} words` | `race to ${targetRankName}` |
| `won_compete` | — | `winner at ${targetRankName}` |
| terminal, `conceded` | — | `all conceded` |
| terminal, `timeout` | `time up · ${foundScore}/${requiredScore} pts · ${foundCount}/${requiredCount} words` | `time up · no winner at ${targetRankName}` |
| terminal, `manual` | `done · ${foundScore}/${requiredScore} pts · ${foundCount}/${requiredCount} words` | `ended · no winner at ${targetRankName}` |

### Shelved (non-terminal, suspended)
- **coop:** `${foundScore}/${requiredScore} pts · ${foundCount}/${requiredCount} words` — e.g. `40/93 pts · 22/61 words`.
- **compete:** `race to ${targetRankName}` — e.g. `race to Amazing`.

---

## bananagrams (brand MonkeyGrams) — `bananagrams` — **compete-only, single gametype**

No coop sibling; **no whole-table `end_game`** (retired for per-player `concede`). Winning = clearing your hand/board and peeling when the bunch can't refill.

### Play-state enum
| play_state | terminal? | how |
|---|---|---|
| `playing` | no | create / peel / dump |
| `won` | **yes** | a player goes out via `peel` (`…bananagrams.sql:794-800`) |
| `lost` | **yes** | `submit_timeout` (`outcome 'timeout'`, :1055-1059) **or** all-conceded via `common.concede` (`outcome 'conceded'`, :1088-1097) |

No `'ended'` state exists for bananagrams.

### How each terminal state is reached
- **`won`** — `bananagrams.peel`: caller must have an empty hand; if the bunch can't refill the table (`length(s_bunch) < needed`), the board is validated (connectivity always, words if `word_check <> 'off'`); if legal, `end_game(…, 'won', winner_username, …)`, caller `{"won": true}`, others `{"won": false}` (:686-801). If blocked, returns `'illegal'` and stays `playing`.
- **`lost` (timeout)** — countdown hits 0 with nobody out; every player `{"won": false}`, no winner (:1025-1069).
- **`lost` (conceded)** — the **last** active player concedes → `common.concede` ends it as a collective loss (:1088-1097). A non-last conceder just drops out.

### In-game feedback at end-states
From `buildOver()` → `over` (PlayArea.tsx:259-267). Below-board pill shows `verdict`; info-column shows `message`.
| state | verdict | message | tone |
|---|---|---|---|
| `lost` (timeout) | `⏰ Time's up — nobody went out.` | `Out of time` | lost |
| `lost` (all conceded) | `🏳️ Everyone conceded — no winner.` | `All conceded` | lost |
| `won` (you) | `🍌 Bananas! You went out first.` | `You won!` | won |
| `won` (opponent) | `${winnerName} went out — Bananas!` | `${winnerName} won` | lost |

Locally-terminal (you conceded, others race on — not a terminal play_state): below-board pill `You conceded — you're out of the race.`; info-column `You're out`. Concede confirm: `Concede? You'll drop out and take the loss — the others keep racing. You can't undo this.`

### Listing label (`labelFor`)
manifest.ts:92-108; `name = status.winner_username ?? 'someone'`.
| play_state | label |
|---|---|
| `playing` | `in progress` |
| `won` | `won — ${name} finished first` |
| `lost` (conceded) | `everyone conceded` |
| `lost` (timeout) | `time's up — nobody finished` |

### Shelved (non-terminal, suspended)
Flat literal **`in progress`** (progress lives on `bananagrams.progress`, not in `common.games.status`; no per-turn counts in the label).

---

## waffle (brand SyrupSwap) — `waffle_coop` / `waffle_compete`

Swap-to-solve. Coop shares one board; compete races private boards.

### Play-state enum
| play_state | mode | terminal? |
|---|---|---|
| `playing` | both | no |
| `won` | coop | **yes** |
| `lost` | coop | **yes** |
| `won_compete` | compete | **yes** |
| `lost_compete` | compete | **yes** |
| `ended` | both | **yes** (neutral — manual or reveal-answer) |

### How each terminal state is reached
Migration `…waffle.sql`:
- **coop `won`** — a swap makes the shared board equal the solution (`did_solve`, :663-701).
- **coop `lost`** — out of swaps (`new_swaps >= max_swaps`, :685-687); **or** timer expiry (`submit_timeout` coop, `outcome 'timeout'`, :789-798).
- **compete `won_compete`** — race over (nobody still racing) with an eligible solver; winner = fewest swaps then earliest `solved_at`, via `_maybe_finish_compete` (:519-558); **or** timer expiry (:802-823).
- **compete `lost_compete`** — race over with no eligible solver (`winner_id is null`, :552-553); **or** timer expiry with no solver (:820-821).
- **`ended`** (both) — manual `end_game` (`outcome 'manual'`, :901-905); **or** `reveal_answer` / give-up (`outcome 'revealed'`, overwrites boards with the solution, :983-987).

Concede is not its own terminal — it flips the flag then re-runs `_maybe_finish_compete`.

### In-game feedback at end-states
From `buildOver()` (PlayArea.tsx:380-427). Below-board pill shows `verdict` (note: passes `verdict`, PlayArea.tsx:322). waffle uses its own inline `ended` copy (not shared `endedCopy`).
| state | verdict | message | tone |
|---|---|---|---|
| coop `won` | `Solved it! 🧇` | `Solved!` | won |
| coop `lost` (swaps) | `Out of swaps.` | `Out of swaps` | lost |
| coop `lost` (timer) | `Out of time.` | `Out of time` | lost |
| compete `won_compete` (you) | `You won — fewest swaps!` | `You won!` | won |
| compete `won_compete` (beaten) | `Beaten on swaps.` | `Opponent won` | lost |
| compete `lost_compete` (nobody) | `Nobody solved it.` | `No winner` | lost |
| compete `lost_compete` (timer) | `Out of time — no winner.` | `Out of time` | lost |
| `ended` coop / compete | `Game ended.` / `Game ended — no winner.` | `Game ended` | neutral |

Locally-terminal (compete, game continues): pills `You conceded — the rest are still racing.` / `Solved — waiting on the rest.` / `Out of swaps — waiting on the rest.`; info-column `You conceded` / `Solved — waiting` / `Out of swaps`. Peer milestones (non-terminal): `● solved it` (success), `● is out of swaps` (warning).

### Listing label (`labelFor`)
manifest.ts:58-78 (one function; `modeLabel` only affects the mid-game default). `winner = status.winner_username`.
| play_state | label |
|---|---|
| `won` | `solved` |
| `won_compete` | `won by ${winner}` if present, else `winner decided` |
| `lost` | `out of swaps` |
| `lost_compete` | `no winner` |
| `ended` | `ended` |

### Shelved (non-terminal, suspended)
`default` branch — **coop:** `solving…` · **compete:** `racing…` (each with a trailing `…`).

---

## wordle (brand WordNerd) — `wordle_coop` / `wordle_compete`

Coop shares one board; compete races (fewest guesses, clock tie-break).

### Play-state enum
| play_state | mode | terminal? |
|---|---|---|
| `playing` | both | no |
| `won` | coop | **yes** |
| `lost` | coop | **yes** |
| `won_compete` | compete | **yes** |
| `lost_compete` | compete | **yes** |
| `ended` | both | **yes** (neutral) |

### How each terminal state is reached
Migration `…wordle.sql`:
- **coop `won`** — shared guess equals target (`did_solve`, :544-546).
- **coop `lost`** — guesses exhausted (`new_used >= max_guesses`, :547-549); **or** timer expiry (`submit_timeout` coop, `outcome 'timeout'`, :653-662).
- **compete `won_compete`** — race over (no player still racing) with a winner; winner = fewest `guesses_used`, then earliest `solved_at`, conceders excluded, via `_maybe_finish_compete` (:389-415); **or** timer expiry (:665-684).
- **compete `lost_compete`** — same moments, but `winner_id is null` (nobody eligible solved).
- **`ended`** (both) — manual `end_game`, `outcome 'manual'` (:734-742).

### In-game feedback at end-states
From `buildOver()` (PlayArea.tsx). Below-board pill = `${verdict} Answer: CRANE.`; info-column also shows `The answer was CRANE`.
| state | verdict | message | tone |
|---|---|---|---|
| coop `won` | `Solved! 🎉` | `Solved it!` | won |
| coop `lost` (guesses) | `Out of guesses.` | `Out of guesses` | lost |
| coop `lost` (timer) | `Out of time.` | `Out of time` | lost |
| compete `won_compete` (you, guesses) | `You won — fewest guesses!` | `You won!` | won |
| compete `won_compete` (you, clock tie) | `You won — same guesses, but faster! ⏱️` | `You won (faster)` | won |
| compete `won_compete` (beaten, guesses) | `Beaten on guesses.` | `Opponent won` | lost |
| compete `won_compete` (beaten, clock tie) | `Beaten on the clock — same guesses, just slower.` | `Opponent won (faster)` | lost |
| compete `lost_compete` (no solve) | `Nobody solved it.` | `No winner` | lost |
| compete `lost_compete` (timer) | `Out of time — no winner.` | `Out of time` | lost |
| `ended` coop / compete | `Game ended.` / `Game ended — no winner.` | `Game over` | neutral |

Peer narration (non-terminal): coop `● guessed CRANE` (neutral); compete `● solved it` (success).

### Listing label (`labelFor`)
manifest.ts:66-85. `winner = status.winner_username`.
| play_state | label |
|---|---|
| `won` | `solved` |
| `won_compete` | `won by ${winner}` if present, else `winner decided` |
| `lost` | `not solved` |
| `lost_compete` | `no winner` |
| `ended` | `ended` |

### Shelved (non-terminal, suspended)
`default` branch — **coop:** `guessing…` · **compete:** `racing…`.

---

## stackdown (brand StackDown) — `stackdown_coop` / `stackdown_compete`

Clear a 30-tile stack by spelling six words. Coop shares a board (each player builds words privately — selections are local, not broadcast; only completed submissions sync via realtime); compete races.

### Play-state enum
| play_state | mode | terminal? |
|---|---|---|
| `playing` | both | no |
| `won` | coop | **yes** |
| `lost` | coop | **yes** |
| `won_compete` | compete | **yes** |
| `lost_compete` | compete | **yes** |
| `ended` | both | **yes** (neutral) |

### How each terminal state is reached
Migration `…stackdown.sql`:
- **coop `won`** — team clears all six words (`team_found >= 6`, `submit_word`, :477-496).
- **coop `lost`** — countdown hits 0 unsolved (`submit_timeout` coop, `outcome 'timeout'`, :704-711).
- **compete `won_compete`** — first player clears all six (`new_found >= 6`, :497-511), winner named in status.
- **compete `lost_compete`** — timer expiry with no winner (:712-721); **or** last racer concedes (via `common.concede`, :786-796).
- **`ended`** (both) — manual `end_game`, `outcome 'manual'` (:739-772).

### In-game feedback at end-states
From `buildOver()` (PlayArea.tsx:442-479). Below-board pill shows `verdict`; info-column shows `message`. Terminal solution reveal in info-column: `The words were <WORD · WORD · …>`.
| state | verdict | message | tone |
|---|---|---|---|
| coop `won` | `Stack cleared! 🎉` | `Cleared!` | won |
| coop `lost` (timer) | `Out of time.` | `Out of time` | lost |
| coop `lost` (not cleared) | `Stack not cleared.` | `Not cleared` | lost |
| compete `won_compete` (you) | `You won — cleared it first!` | `You won!` | won |
| compete `won_compete` (beaten) | `Beaten to the clear.` | `Opponent won` | lost |
| compete `lost_compete` (timer) | `Out of time — no winner.` | `Out of time` | lost |
| compete `lost_compete` (nobody) | `Nobody cleared it.` | `No winner` | lost |
| `ended` coop / compete | `Game ended.` / `Game ended — no winner.` | `Game over` | neutral |

Locally-done (compete conceder, game continues): info-column `You conceded`.

### Listing label (`labelFor`)
manifest.ts:65-84. `winner = status.winner_username`.
| play_state | label |
|---|---|
| `won` | `cleared` |
| `won_compete` | `won by ${winner}` if present, else `winner decided` |
| `lost` | `not cleared` |
| `lost_compete` | `no winner` |
| `ended` | `ended` |

### Shelved (non-terminal, suspended)
`default` branch — **coop:** `stacking…` · **compete:** `racing…`. (The club-list *title* separately shows coop cleared words like `APPLE-BERRY-COMPY…`; compete keeps the title `"New game"` to avoid leaking the solution.)

---

## scrabble (brand RackAttack) — `scrabble_coop` / `scrabble_compete`

15×15 board, shared bag; compete has an AI opponent. Coop = one shared rack/board/score, no turns; compete = turn-based, private racks, highest score wins.

### Play-state enum
| play_state | mode | terminal? |
|---|---|---|
| `playing` | both | no |
| `won` | coop | **yes** |
| `won_compete` | compete | **yes** |
| `lost` | compete | **yes** (all conceded) |
| `ended` | compete | **yes** (neutral manual) |

**Coop never reaches `ended` or `lost`** — every coop terminal path (going out, timeout, manual End) funnels through `_finish` → `'won'`, distinguished only by `status.outcome`.

### How each terminal state is reached
Migration `…scrabble.sql`, all terminal writes via `scrabble._finish` → `common.end_game`:
- **coop `won`** — going out (bag empty + rack empty, `_commit_word` → `_finish(…, 'complete', null)`, :937-943); **or** timeout (`submit_timeout` → `_finish(…, 'timeout', null)`, :1369); **or** manual End (`_finish(…, 'manual', null)`, :1418-1428). (No pass/blocked path in coop.)
- **compete `won_compete`** — going out (`_finish(…, 'complete', p_seat)`); **or** blocked game (6 consecutive scoreless turns, `_commit_exchange`/`_commit_pass`, :1107, :1219); **or** timeout (leader wins). Winner = highest score among non-conceded seats; unique max → `winner_seat`, tie → null (co-winners) (`_finish`, :541-563).
- **compete `lost`** — everyone conceded (`concede` when `v_active = 0` → `_finish(…, 'conceded', null)`, `v_max is null` → `end_game('lost')`, :608-609, :1310-1313).
- **compete `ended`** — manual End (uniform neutral, no scoring, :1429-1434).

A single compete concede (others remain) is non-terminal — stays `playing`.

### In-game feedback at end-states
From `buildOver()` (PlayArea.tsx:445-481). Below-board pill shows `message` (not verdict); info-column shows `message`; modal shows `verdict`.

**Coop** (`score = game.teamScore`):
| outcome | verdict | message | tone |
|---|---|---|---|
| `complete` | `Board cleared — ${score} points! 🎉` | `${score} pts` | won |
| `timeout` | `Time's up — ${score} points.` | `${score} pts` | neutral |
| `manual` | `Game ended — ${score} points.` | `${score} pts` | neutral |

**Compete:**
| condition | verdict | message | tone |
|---|---|---|---|
| `ended` (manual) | `Game ended — no winner.` | `Ended` | neutral |
| all conceded | `Everyone conceded — no winner.` | `All conceded` | lost |
| you hold top score | `You won the game! 🎉` | `You won!` | won |
| another human won | `${nameOf(winner)} won.` | `${nameOf(winner)} won` | lost |
| AI won | `${name} won.` (`name = winner_username ?? 'The AI'`) | `${name} won` | lost |
| tie (null winner) | `It's a tie — co-winners!` | `Tie` | neutral |

Locally-terminal (compete conceder, others race on): info-column `You conceded`.

### Listing label (`labelFor`)
manifest.ts:59-84; reads `status.team_score`, `status.bag_count`, `status.winner_username`.
| play_state | label |
|---|---|
| `won` (coop) | `${team_score} pts` if set, else `finished` |
| `won_compete` | `won by ${winner_username}` if set, else `tie` |
| `lost` (compete) | `all conceded` |
| `ended` | `ended` |

### Shelved (non-terminal, suspended)
`default` branch (`left = '${bag_count} tiles left'` when present):
- **coop** (team_score set): `${team_score} pts · ${left}` (e.g. `120 pts · 34 tiles left`), or `${team_score} pts` when no `left`.
- **compete** (or coop without team_score): `${left}` (e.g. `34 tiles left`), falling back to `playing…` when `bag_count` absent.

---

## boggle (brand MothCubes) — `boggle_coop` / `boggle_compete`

Find words in a grid. **Sole terminal is `'ended'`** for both modes — no win-threshold play_state; the winner is *derived* (compete: most points, or the target-crosser; coop: neutral team total). The *reason* rides in `status.outcome` (`manual`/`timeout`/`target`), not in play_state.

### Play-state enum
| play_state | mode | terminal? |
|---|---|---|
| `playing` | both | no |
| `ended` | both | **yes (sole terminal)** |

### How each terminal state is reached
Everything funnels through `boggle._finish(target_game, outcome, winner_id)` → `common.end_game(…, 'ended', …)` (`…boggle.sql:545`). Four triggers tag `status.outcome`:
1. **Manual End** (`manual`) — `boggle.end_game` (:551-567). Coop's stop path.
2. **Timer expiry** (`timeout`) — `boggle.submit_timeout` (:597-616).
3. **Score target reached** (`target`) — inside `submit_word` when the required-only banked score crosses `ceil(win_percent/100 * required_words_score)`; coop = team win (no winner_id, :426); compete = the crosser wins outright (`caller_id`, :433).
4. **Concede** (compete, last-racer) — `boggle.concede` → `common.concede` ends as a collective loss when the last racer drops. A single conceder among several does not end it.

Coop has no concede.

### In-game feedback at end-states
From `buildOver()` (PlayArea.tsx:402-503). `reason = statusOutcome === 'timeout' ? "Time's up" : 'Game ended'`. Modal + below-board pill show `verdict`; info-column shows `message`.

**Coop** (always `outcome: 'won'` styling):
| case | verdict | message | tone |
|---|---|---|---|
| target reached | `Target reached! ${myCount} words, ${myScore} points.` | `Target reached!` | won |
| manual / timeout | `${reason} — ${myCount} words, ${myScore} points.` | `${reason}` (`Time's up` / `Game ended`) | neutral |

**Compete** (winner derived from most points, or named crosser):
| case | verdict | message | tone |
|---|---|---|---|
| you conceded | `${reason} — you conceded.` | `You conceded` | lost |
| target win (you) | `You won — reached the target with ${myScore} points!` | `You won!` | won |
| target win (other) | `${winnerName} reached the target first — you had ${myScore} points.` | `${winnerName} won` | lost |
| manual/timeout, no words | `${reason} — no words found.` | `No winner` | neutral |
| manual/timeout, you win | `You win — ${myCount} words, ${myScore} points!` | `You won!` | won |
| manual/timeout, you lost | `${winnerName} won — you had ${myCount} words, ${myScore} points.` | `${winnerName} won` | lost |

Confirms: End → `End the game now? You can't undo this.`; Concede → `Concede the game? You drop out and the others keep playing.`

### Listing label (`labelFor`)
Two functions. Coop `coopLabel` (manifest.ts:53-61) reads `status.found_words_count`, `status.score`, `status.outcome`; compete `competeLabel` (:64-74) reads `status.leaderboard`, `status.outcome`, `status.winner_username` (rank/winner-only, no per-player scores).

**Coop:**
| play_state / outcome | label |
|---|---|
| `playing` | `${words} words · ${pts} pts` |
| `ended`, target | `target reached · ${words} words · ${pts} pts` |
| `ended`, timeout | `time up · ${words} words · ${pts} pts` |
| `ended`, manual | `done · ${words} words · ${pts} pts` |

**Compete:**
| play_state / outcome | label |
|---|---|
| `playing` | `competing · ${players} players` (or `competing` if empty) |
| `ended`, target | `${winner} won` (or `won` if no winner_username) |
| `ended`, timeout | `time up` |
| `ended`, other (manual) | `ended` |

### Shelved (non-terminal, suspended)
Mid-game `playing` branch:
- **coop:** `${words} words · ${pts} pts` (e.g. `12 words · 34 pts`, or `0 words · 0 pts` fresh).
- **compete:** `competing · ${players} players` (or `competing` when the leaderboard is still empty).

---

## crosswords (brand CrossPlay) — `crosswords_coop` / `crosswords_compete`

Collaborative/competitive crossword. Coop = shared grid + peer cursors; compete = private grids, first-correct-wins. **No timer** (`timerMode: 'none'`), so `submit_timeout` never fires.

### Play-state enum
| play_state | mode | terminal? | note |
|---|---|---|---|
| `playing` | both | no | |
| `won` | coop | **yes** | shared grid solved |
| `ended` | coop | **yes** | manual whole-table end (neutral) |
| `won_compete` | compete | **yes** | first private grid solved |
| `lost` | compete | **yes** | everyone conceded |
| `lost_compete` | compete | **yes** | only via `submit_timeout` — **never fires** (no timer) |

### How each terminal state is reached
Migration `…crosswords.sql`; terminal transitions run under a row-lock re-checking `play_state='playing'` (so only the first solver wins):
- **coop `won`** — a `set_cell`/`reveal_cells` fill completes the shared grid correctly → `_maybe_finish` (:572) → `_finish_coop_won` → `end_game(…, 'won', outcome 'solved')` (:277-302).
- **coop `ended`** — coop-only "End game" button → `crosswords.end_game` (rejects if mode ≠ coop) → `end_game(…, 'ended', outcome 'finished')` (:893-927).
- **compete `won_compete`** — first player's own grid completes → `_finish_compete_won(target_game, caller)` → `end_game(…, 'won_compete', winner, winner_username)` (:306-331).
- **compete `lost`** — last active player concedes → `common.concede` → `end_game(…, 'lost', outcome 'conceded')`.
- **`lost` / `lost_compete` via timeout** — implemented (:952-984) but never invoked (no timer).

No concede in coop; no manual end in compete (compete drops out via non-eliminating `concede`).

### In-game feedback at end-states
From `buildOver()` (PlayArea.tsx:826-857). **Both** the modal and the below-board pill show `verdict` (this game does not render `message`). No CelebrationDialog — it uses the shared `GameOverModal`/`TerminalModal`.
| play_state | who | verdict | outcome / tone |
|---|---|---|---|
| `won` (coop) | everyone | `Solved!` | won / won |
| `won_compete` | winner | `You solved it first!` | won / won |
| `won_compete` | loser (winner known) | `Beaten to it by ${winnerName}.` | lost / lost |
| `won_compete` | loser (no name) | `Beaten to it.` | lost / lost |
| `lost_compete` | that player | `Out of the race.` | lost / lost |
| `lost` | everyone (all conceded) | `Everyone conceded.` | lost / lost |
| `ended` (coop) | everyone | `Game ended.` | won / neutral |

Non-terminal compete pill: a conceded-but-racing player sees `You conceded — the rest are still racing.`

### Listing label (`labelFor`)
Coop `coopLabel` (manifest.ts:92-97) / compete `competeLabel` (:100-108); `title = status.title ?? 'Crossword'`, `winner = status.winner_username`.

**Important caveat:** `common.end_game` overwrites `status` wholesale and the terminal status blobs **drop the `title` key**, so at every terminal state the title falls back to the literal `Crossword`. (Only `won_compete` preserves `winner_username`.)

**Coop:**
| play_state | label |
|---|---|
| `playing` | `${title}` (e.g. `Monday Mini`) |
| `won` | `${title} · solved` → at terminal: `Crossword · solved` |
| else (`ended`) | `${title} · ended` → `Crossword · ended` |

**Compete:**
| play_state | label |
|---|---|
| `playing` | `${title} · racing` (e.g. `Monday Mini · racing`) |
| `won_compete` (winner) | `${title} · ${winner} won` → `Crossword · alice won` |
| `won_compete` (no name) | `${title} · won` → `Crossword · won` |
| else (`lost`/`lost_compete`/`ended`) | `${title} · ended` → `Crossword · ended` |

### Shelved (non-terminal, suspended)
Mid-game `playing` (title still present in `status`):
- **coop:** bare `${title}` (e.g. `Monday Mini`), no suffix.
- **compete:** `${title} · racing` (e.g. `Monday Mini · racing`).

No percent-filled placeholder in either label (deliberately progress-free).

---

## wordwheel (brand MooseWheel) — `wordwheel_coop` / `wordwheel_compete`

A **targeted fork of spellingbee** — the end-state machinery (terminal states, `buildOver` copy, `labelFor` shapes) is identical to spellingbee's; only the board logic differs (a bounded **multiset** wheel of 9 tiles, +15 pangram, `s` allowed, per-game difficulty band). Coop shares one find-list toward a rank; compete races to a target rank. Timer is optional (`none` / `countup` / `countdown`, both modes).

### Play-state enum
| play_state | mode | terminal? |
|---|---|---|
| `playing` | both | no |
| `won_compete` | compete | **yes** |
| `ended` | both | **yes** (win-less finish for coop; timeout/manual) |
| `lost` | compete | **yes** (all-conceded only) |

Like spellingbee, coop has **no win terminal** — it only ever reaches `ended` (there's no auto-end at 100% found). Compete's positive terminal is `won_compete`; there is no `lost_compete` (the no-winner terminal is `ended`, all-conceded is the generic `lost`).

### How each terminal state is reached
Migration `…wordwheel.sql`:
- **compete `won_compete`** — a player's own score reaches the target rank (`caller_rank_idx >= current_target_rank`, `submit_word` :1000), freezes the leaderboard, `end_game(…, 'won_compete', …)` (:1028).
- **`ended` via timeout** (both) — countdown hits 0 → `submit_timeout` → `end_game(…, 'ended', outcome 'timeout')` (coop :1182, compete :1225).
- **`ended` via manual** (both) — `end_game` button → `outcome 'manual'` (coop :1342, compete :1383).
- **compete `lost` via all-conceded** — `common.concede` when the last racer drops (`play_state 'lost'`, `outcome 'conceded'`). A single conceder drops out locally; the rest race on.

### In-game feedback at end-states
From `buildOver()` (PlayArea.tsx:600-657). `rankLabel(name)` renders e.g. `rank "Solid"`. **Copy is identical to spellingbee.**
| state | verdict | message | tone |
|---|---|---|---|
| coop `ended`, Genius (rank ≥ 6) | `Genius! ${foundScore}/${requiredScore} points.` | `Genius!` | won |
| coop `ended`, below Genius (timeout **or** manual) | `Stopped at ${rankLabel} — ${foundScore}/${requiredScore} points.` | `Stopped at ${rankLabel}` | neutral |
| compete `won_compete` (you won) | `You won the race — reached ${rankLabel(target)}!` | `You won!` | won |
| compete `won_compete` (beaten) | `${winnerName} beat you to ${rankLabel(target)}.` | `${winnerName} won` | lost |
| compete `ended` (timeout) | `Time's up — no winner at ${rankLabel(target)}.` | `Time up` | lost |
| compete `ended` (manual) | `Game ended — no winner at ${rankLabel(target)}.` | `Game ended` | neutral |

**Known quirk (inherited from spellingbee):** compete `lost` (all-conceded) has no dedicated `buildOver` branch — it falls through the `ended`-compete block and, since `outcome='conceded'` (not `'timeout'`), renders the **manual-end** copy (`Game ended — no winner…`, neutral), not a loss verdict.

### Listing label (`labelFor`)
Coop (manifest.ts:123-146) surfaces score+word counts; compete (:184-208) is rank-only. `targetRankName = RANKS[target_rank]`; the terminal status re-emits `target_rank` (so timeout/manual labels name the real target rank, not `Start` — the M3 fix, shared with spellingbee).
| play_state / outcome | coop label | compete label |
|---|---|---|
| `playing` | `${foundScore}/${requiredScore} pts · ${foundCount}/${requiredCount} words` | `race to ${targetRankName}` |
| `won_compete` | — | `winner at ${targetRankName}` |
| terminal, `conceded` | — | `all conceded` |
| terminal, `timeout` | `time up · ${foundScore}/${requiredScore} pts · ${foundCount}/${requiredCount} words` | `time up · no winner at ${targetRankName}` |
| terminal, `manual` | `done · ${foundScore}/${requiredScore} pts · ${foundCount}/${requiredCount} words` | `ended · no winner at ${targetRankName}` |

### Shelved (non-terminal, suspended)
- **coop:** `${foundScore}/${requiredScore} pts · ${foundCount}/${requiredCount} words` — e.g. `40/93 pts · 22/61 words`.
- **compete:** `race to ${targetRankName}` — e.g. `race to Amazing`.

---

## wordiply (brand WordWire) — `wordiply_coop` / `wordiply_compete`

Guardian-Wordiply-style base extender: a short **base** (a 2–4 letter combination) every guess must contain; **5 guesses** (coop = 5 shared; compete = 5 per player). Two readouts — a length score % + a letter count — plus the longest word are shown **only at terminal**; during play each guess shows only its length. Compete winner is a lexicographic **comparator** (length score → letter count → earlier-if-timed → co-winners), not first-to-a-threshold. Timer is optional (`none` default / `countup` / `countdown`).

### Play-state enum
| play_state | mode | terminal? |
|---|---|---|
| `playing` | both | no |
| `ended` | both | **yes** (coop: every finish; compete: manual "we're done", no winner) |
| `won_compete` | compete | **yes** (comparator winner) |
| `lost` | compete | **yes** (all-conceded only) |

wordiply has **no `lost_compete`** — the compete no-winner terminal is the neutral `ended` (via `_finish_compete(pick_winner=false)`), and the all-conceded terminal is the generic `lost` (via `common.concede`).

### How each terminal state is reached
Migration `…wordiply.sql`. Coop funnels through `_finish_coop` → `end_game(…, 'ended', …)` (:598-611); compete through `_finish_compete(outcome, pick_winner)` → `end_game(…, won_compete | ended, …)` (:631-731; `terminal_state = pick_winner ? 'won_compete' : 'ended'`, :653):
- **coop `ended`** — the team's 5th guess is submitted (`submit_guess` :843); **or** timer expiry (`submit_timeout` :947); **or** manual `end_game` (:994). All → `_finish_coop`.
- **compete `won_compete`** — every active (non-conceded) player has spent all 5 guesses → `submit_guess` (:877) → `_finish_compete('complete', true)`; **or** timer expiry (`submit_timeout` :949); **or** a concede that leaves all remaining active players out of guesses (`concede` :1104). The comparator resolves the winner; on an unbroken tie every tied player is a **co-winner** (`winner_user_id = NULL`, :715 — the M1 fix; picking one arbitrary tied player would tell the others they lost).
- **compete `ended`** — manual `end_game` (players agree to stop, no winner) → `_finish_compete(…, false)` (:996).
- **compete `lost`** — the **last** non-conceded player concedes with nobody having finished by guesses → `common.concede` → `end_game(…, 'lost', outcome 'conceded')`.

**Concede subtlety (H1 fix):** a finished-but-not-conceded player counts as "still active" to `common.concede`, so a concede can leave every remaining active player out of guesses with nobody able to re-fire the end check — hanging the game in `playing`. `wordiply.concede` therefore re-runs the all-active-done check itself after conceding (:1094-1105) and resolves the race (→ `won_compete`) instead of stalling.

### In-game feedback at end-states
From `buildOver()` (PlayArea.tsx:333-411). wordiply does **not** render the GameOverModal — feedback is the below-board indicator + the info-column message. `pct` = the length score %.

**Compete:**
| state | verdict | message | tone |
|---|---|---|---|
| `won_compete` (you won) | `You won — ${pct}%!` | `You won!` | won |
| `won_compete` (you co-won a tie) | `You tied for the win — ${pct}%!` | `You tied for the win!` | won |
| `won_compete` (opponent won) | `${winnerLabel} won with ${pct}%.` | `${winnerLabel} won` | lost |
| `won_compete` (opponents tied) | `${winnerLabel} tied for the win — ${pct}%.` | `${winnerLabel} tied` | lost |
| `ended` (manual) **or** `lost` (all-conceded) | `Game ended — no winner.` | `Game ended` | neutral |

`winnerLabel` is the winner's username, or co-winners joined with ` & ` (e.g. `alice & bob`). On a tie the FE reads the caller's own `won` flag (never an arbitrary picked id), so no co-winner is shown a loss (M1).

**Coop** (one branch, all outcomes — neutral, since coop has no clear "win"):
| state | verdict | message | tone |
|---|---|---|---|
| `ended` (any: done / timeout / manual) | `Length: ${pct}%, Letters: ${letters}.` | `Length ${pct}%` | neutral |

**Compete terminal reveal (M2):** `OpponentReveal.tsx` renders at the compete terminal only — heading `Opponents' words`, then each opponent's username + their guesses (the word with the base dimmed + a length badge), or `no guesses`. The longest word (`game.longestWords[0]`) also shows in the info column. During play, opponents' words are hidden (only per-guess length shows).

### Listing label (`labelFor`)
Coop (manifest.ts:87-95) / compete (:101-115). `ls = status.length_score`, `lc = status.letter_count`, `used = status.guesses_used`, `leaderboard` (per-player `guesses_used` / `won` / `length_score`) for compete.
| play_state / outcome | coop label | compete label |
|---|---|---|
| `playing` | `${used}/5 guesses` | leaderboard empty → `in progress`; else per-player `${g}/5 · ${g}/5 · …` |
| `won_compete` | — | co-winners → `co-winners · ${ls}%`; single → `winner · ${ls}%` |
| terminal, `conceded` | — | `all conceded` |
| terminal, `timeout` | `time up · ${ls}% · ${lc} letters` | — |
| terminal, other (`done` / `manual`) | `done · ${ls}% · ${lc} letters` | `ended · no winner` |

### Shelved (non-terminal, suspended)
- **coop:** `${used}/5 guesses` — e.g. `3/5 guesses`.
- **compete:** `in progress` (before anyone guesses), or the per-player `${g}/5 · ${g}/5` string once play starts.

---

## Cross-game summary

### Terminal `play_state` values by game
| game | coop terminals | compete terminals |
|---|---|---|
| codenamesduet | `won`, `lost_assassin`, `lost_clock`, `lost_timeout`, `ended` | *(coop only)* |
| psychicnum | `won`, `lost`, `ended` | `won_compete`, `lost_compete`, `ended` |
| connections | `solved`, `lost`, `ended` | `solved_compete`, `lost_compete`, `ended` |
| spellingbee | `ended` (only) | `won_compete`, `ended`, `lost` (all-conceded) |
| bananagrams | *(compete-only)* | `won`, `lost` (timeout/conceded) |
| waffle | `won`, `lost`, `ended` | `won_compete`, `lost_compete`, `ended` |
| wordle | `won`, `lost`, `ended` | `won_compete`, `lost_compete`, `ended` |
| stackdown | `won`, `lost`, `ended` | `won_compete`, `lost_compete`, `ended` |
| scrabble | `won` (only) | `won_compete`, `lost` (all-conceded), `ended` |
| boggle | `ended` (only) | `ended` (only) |
| crosswords | `won`, `ended` | `won_compete`, `lost` (all-conceded), `lost_compete`\* |
| wordwheel | `ended` (only) | `won_compete`, `ended`, `lost` (all-conceded) |
| wordiply | `ended` (only) | `won_compete`, `ended`, `lost` (all-conceded) |

\* crosswords `lost_compete` is reachable only via `submit_timeout`, which never fires (no timer).

Note the spellingbee-family shape (spellingbee, wordwheel, wordiply): coop has **no win terminal** (only `ended`), and compete has **no `lost_compete`** — its no-winner terminal is the neutral `ended` and its all-conceded terminal is the generic `lost`.

### How games end — the trigger families
- **Objective / threshold met** — all agents/categories/grid/stack/board solved or cleared, or a score threshold crossed (codenamesduet `won`, connections `solved`, waffle `won`, wordle `won`, stackdown `won`, crosswords `won`, scrabble going-out, bananagrams peel-out, spellingbee/boggle target, wordwheel target rank).
- **Countdown expiry** (`submit_timeout`) — codenamesduet, psychicnum, connections, spellingbee, bananagrams, waffle, wordle, stackdown, scrabble, boggle, and (optional timer) wordwheel / wordiply. (crosswords has no timer.)
- **Resource exhausted** — guesses/swaps/mistakes/budget run out (psychicnum budget, connections mistakes, waffle swaps, wordle guesses, wordiply's 5 guesses — coop ends, compete resolves the comparator).
- **Race decided** — first to the objective wins immediately (all `*_compete` win states); wordiply is the variant — the winner is a **comparator** run once every active player has spent their 5 guesses, not a first-past-the-post.
- **Manual "End game"** (`ended`) — everyone except bananagrams (and crosswords-compete, which has no manual end).
- **Concede** (compete) — a single conceder drops out (locally terminal); the *last* conceder ends the game as a collective loss (`common.concede` → `lost`).

### Shelved (non-terminal, suspended) labels at a glance
A suspended game is still `play_state = 'playing'` — its label is the `playing` branch of `labelFor`:
| game | coop shelved label | compete shelved label |
|---|---|---|
| codenamesduet | `in progress` | — |
| psychicnum | `${n} guesses left` | `${n} guesses left` |
| connections | `${m}/4 categories · ${k}/4 mistakes` | `in progress` |
| spellingbee | `${s}/${r} pts · ${w}/${rw} words` | `race to ${rank}` |
| bananagrams | — | `in progress` |
| waffle | `solving…` | `racing…` |
| wordle | `guessing…` | `racing…` |
| stackdown | `stacking…` | `racing…` |
| scrabble | `${team_score} pts · ${bag} tiles left` | `${bag} tiles left` |
| boggle | `${w} words · ${p} pts` | `competing · ${n} players` |
| crosswords | `${title}` | `${title} · racing` |
| wordwheel | `${s}/${r} pts · ${w}/${rw} words` | `race to ${rank}` |
| wordiply | `${used}/5 guesses` | `in progress` (or `${g}/5 · ${g}/5`) |
