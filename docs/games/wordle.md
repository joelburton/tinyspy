# wordle

A NYT-Wordle-style guess-the-word game. **WordNerd** is the user-facing brand; **`wordle`** is the codename everywhere in code (schema, folder, gametype strings).

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
- **A guess must be a real word** — `len = 5 AND difficulty ≤ setup.legal_guess` (band 1–6) in `common.words` (no dialect/slang/crude/slur filter; Wordle is permissive on guesses — only the band gates). A guess that's malformed, not a word, or already on the board is **soft-rejected and does NOT cost a guess** (classic Wordle "not in word list").
- **The target** is set by `setup.answer_source`: **0** = the curated NYT-Wordle answer list (`common.words.wordle`, any crude/slur level — the classic feel, default), or **1–6** = any clean 5-letter word of that difficulty band or easier (a higher band can be obscure). `legal_guess` must reach the answer's hardest band (the Wordle list tops out at band 2), so every possible answer is itself a legal guess.
- **Lifecycle.** Win = guess the word. Lose = exhaust the budget. A countdown timer (optional) ends the game on expiry; either player may hit **End game** for a neutral stop.

### Coop vs compete

**Coop** — ONE shared board. Either player guesses; once submitted, the guess (and its colors) is visible to both. The budget is shared. The team wins together when anyone solves it.

**Compete** — same target, **independent boards**. Players don't see each other's guesses until the game ends (RLS hides them). The game ends once **every** player is done (solved or out of guesses); the winner is whoever solved in the **fewest** guesses, tie-break **earliest** solve. A player who can no longer win still plays their board out. The OpponentStrip shows each opponent's **guess count** (not their letters).

## Vocabulary

| term | meaning |
|---|---|
| **target** | The hidden 5-letter answer. Stored on `wordle.games`, HIDDEN via a column grant, revealed post-terminal through `games_state`. |
| **guess** | A submitted 5-letter word. Accepted ones land in `wordle.guesses` with their `colors`. |
| **colors** | The 5-char `g`/`y`/`x` feedback string (`common.wordle_colors`), the single source of truth — the FE renders it, never recomputes it. |
| **soft reject** | A guess that's malformed / not-a-word / duplicate: feedback, but no guess consumed and no row written. |

## Schema (`wordle.*`)

Mirrors waffle's hidden-answer pattern (a HIDDEN `target`) plus spellingbee's per-guess log with mode-aware RLS.

| table | purpose |
|---|---|
| `wordle.games` → `common.games(id)` | `mode` (`coop`/`compete`), **`target char(5)` HIDDEN** (column-grant revoked; revealed post-terminal via `games_state` + the `_target_for` SECURITY DEFINER helper), `max_guesses`, `legal_guess` (the band a guess is checked against — stored here so `submit_guess` reads it off the locked row). |
| `wordle.players` PK `(game_id, user_id)` | `guesses_used`, `solved`, `solved_at`. Coop: lock-step (shared budget). Compete: independent. |
| `wordle.guesses` PK `(game_id, user_id, seq)` | `guess`, `colors`, `is_correct`. **RLS** (mirrors `spellingbee.found_words`): coop → club sees all; compete → see your own, opponents revealed only at `is_terminal`. |

- **`common.wordle_colors(guess, answer) → text`** — the two-pass green-then-yellow algorithm with duplicate-letter accounting. Lives once in `common` (the shared layer), called by both wordle's `submit_guess` and waffle's `compute_colors` — one shared implementation rather than a per-game duplicate.
- **`wordle.games_state`** (`security_invoker`) — the game header with `target` only post-terminal.
- Realtime on `wordle.{games, players, guesses}`.

## RPCs (all SECURITY DEFINER; **no edge function** — picking a random target is one SQL line)

- **`create_game(club, setup, players, mode)`** — validate (`max_guesses` 5..8, `answer_source` 0..6, `legal_guess` 1..6 ≥ the answer band, timer, mode); pick `target` from `where wordle` (source 0) or `len=5 AND difficulty ≤ answer_source AND clean` (1..6); store target + `legal_guess`; seed players; `update_state 'playing'`.
- **`submit_guess(game, guess) → jsonb`** — `FOR UPDATE` lock (coop serialization). Soft rejects (no burn, no row): `invalid` (not 5 a–z), `notAWord` (not in `len=5, difficulty ≤ games.legal_guess`), `duplicate`. A valid fresh word → compute colors, log it, `guesses_used++` (coop: all rows; compete: caller), set `solved`. Terminal: coop → `won`/`lost`; compete → when every player is done, winner = fewest guesses (tie earliest) → `won_compete`/`lost_compete`. Returns `{ result, colors, guesses_used, solved, terminal }`; `result ∈ correct | incorrect | notAWord | duplicate | invalid`.
- **`submit_timeout`** / **`end_game`** — mirror waffle's (countdown loss / race-resolve; manual neutral `ended`, coop's stop). Both fire a realtime "touch" on `wordle.games` so the FE refetches the now-revealed target.
- **`concede`** — the compete per-player drop-out (elimination game, like waffle): `common._set_conceded` then `wordle._maybe_finish_compete`, which counts a conceder as done and forfeits their win (fewest-guesses winner among solved, non-conceded players). `submit_timeout` also excludes conceders from the winner. See [common.md → Concede](../common.md#concede--per-player-drop-out). pgTAP: `concede_test.sql`.
- **`replay_board(game)`** — restart the SAME game — same word — from scratch for everyone. Two FE entry points, one handler (the waffle arrangement): the **"Replay board"** game-menu item (both modes, any state) and the terminal action row's **`RestartButton`** (left of Back-to-Club). Resets `wordle.players` (zeroed, unsolved), clears `wordle.guesses`, then `common.reset_game` (un-terminal, fresh initial status, clear results + concede, **shared clock zeroed** — a timed game restarts from the full countdown). The target **re-shields on its own** (`_target_for` gates on `is_terminal`, which the reset clears). The FE confirms mid-game only; at terminal there's nothing to lose. On the FE side the reset must land **entirely blank**: BoardCol drops its in-flight `pending` word + typing buffer when the live rows shrink (rows only ever shrink on a reset), else the finished run's last guess would resurrect as an uncolored top row and block input. pgTAP: `replay_test.sql`.
- **"New game"** (menu item + terminal `NewGameButton`, FE-only — no wordle RPC): start a **fresh game** — new id, new random target — with THIS game's setup + roster + mode, in the same club. A direct `create_game` RPC (wordle has no edge function), mirroring the manifest's `startGameInClub`; the creator jumps in via `ctx.goToGame`, peers arrive via the game-invitation toast, and this game un-currents into the club list (resumable) — no confirm.
- **`reveal_answer(game)`** — the **"Reveal answer"** game-menu item, mid-game: a group give-up. Unlike waffle's (which overwrites boards), wordle needs no state rewrite — the target unshields at terminal by itself — so this is `end_game` with the intent made legible: neutral `'ended'`, everyone `{"won": false}`, but `status.outcome='revealed'` (vs `'manual'`), **the flag the FE keys on to display the word**. At terminal the same menu item is FE-local instead (see Terminal flow below). pgTAP: `reveal_test.sql`.

### Title formula

Static: the string **`'New game'`**, passed verbatim by `create_game` in both
modes as `common.games.title` (the club-card heading; the brand is shown from
the FE manifest, not stored). There's nothing per-game to put in the club list —
the target is hidden (it can't sit in a club-wide-readable column), and the
gametype logo already identifies the game — so the title carries no
board-specific info.

## Frontend (`src/wordle/`)

`manifest` (sibling pair; `startGameInClub` calls `create_game` directly), `db.ts`, `hooks/useGame` (games_state + players + guesses, refetch pattern), and components. The play surface is **v3** — built on the shared PlayArea scaffold (`.layout` / `.boardCol` / `.infoCol` / `.actionSlot`, `.board > .grid`), so only what's wordle-specific lives in the game's own modules.

- **Board** — the `max_guesses × 5` colored-tile board, in the convention's `.board > .grid`. Unlike the other v3 boards (which flex-fill their column), wordle's **hugs its height via `aspect-ratio`** to keep the tiles square, because the on-screen keyboard shares the board column below it. A freshly-landed guess **flips its tiles over one at a time** (NYT-style), each painting its color at the midpoint of the flip; only rows that appear *after mount* animate (a mid-game refresh or revealed opponent history renders static), and `prefers-reduced-motion` skips the flip. The submitted letters stay on the board through the RPC round-trip — PlayArea passes them as a `pending` (uncolored) row that flips in place when the colored server row lands, so there's no blank flash between submit and reveal.
- **Keyboard** — the on-screen QWERTY, each key tinted with the strongest feedback that letter has earned (green > yellow > gray); feeds the same input path as the physical keyboard. It's the **widest** board-column child, so — inverting the usual rule where the board sets the column width — the keyboard drives `.boardCol`'s width (`min(--avail-w, 30rem)`) and the narrower grid centers above it.
- **GameTurnLog** — the guess history as the shared `<TurnLog>` table: one `<tr>` per guess (outcome bar `neutral`, green on the solving guess; `#n`; the guess as five colored letter-squares in the `.main` column; the guesser's `<ActorTag>` in the right-aligned `.who` column). Each guess is **click-to-define** (`useDefinePopover`) — the affordance rides the whole five-square WORD group, not the individual cells (every wordle guess is a legal dictionary word). This is wordle's only define surface; the board tiles are left alone. Its header carries a small understated **"whose guesses" dropdown** (the shared `<TurnLog headerAction>` slot): coop with 2+ players is one "Team"; every other case lists the players (viewer first + default + "You" when they're playing; a spectating club member sees the player's name instead) — the "see opponents' boards" affordance, with compete opponents RLS-hidden during play (the log reads "Hidden until game ends.") and revealed at terminal. The `#n` is the shared `<TurnLogNumber>` **turn-history handle** — but a *live* one (click to replay that row on the board) **only when the log shows the board that replays** (the coop team board / your own — `boardIsShown`); an opponent's revealed log (compete terminal) keeps a plain read-only `#n`, since there's no board of theirs on screen to replay onto.
- **`lib/history.ts`** — wordle's snapshot semantics for the shared turn-history viewer (mechanics in [playarea.md → Turn-history viewer](../playarea.md#turn-history-viewer)): the replay is pure + unit-tested, ADD-style like psychicnum (a guess only ADDS a colored row, so a past board is simply the first N guess rows — no fold), boundary **inclusive** (viewing turn N shows the board after N landed, N's row ringed history-yellow). Keyed by **log position** (= the displayed board row, 0-based; the viewer only ever replays the board you're looking at, where log position and board row line up 1:1). The below-board own-move pill is built from the shared **`common/lib/game/localPills.ts`** (`stickyPill` / `terminalPill` / `outOfRacePill`), used by BoardCol + PlayArea (like psychicnum's `ownMove`).
- **PlayArea** — the two-column surface. **Board column:** the board, a fixed-height **local feedback slot between the board and the keyboard** (the own-move pill — `error` for not-a-word / RPC failure, `warning` for duplicate / too-short; sticky, cleared by any keypress), then the keyboard. **Info column:** the guess-count state line, a compete `OpponentStrip` (guess counts), the action row — **ICON-ONLY, the waffle arrangement** (tooltips carry the labels; see [ui.md → Button iconography](../ui.md#button-iconography)): playing = semantic **End** / **Concede** + `BackToClubButton` (via the shell's suspend-confirm flow); terminal = the outcome line + `RestartButton` / `RevealButton` (the terminal-local reveal) / `NewGameButton` / primary back-to-club via `TerminalActionRow`'s `iconOnly`; compete locally-terminal = "Waiting for others" + Concede — then a help line, the setup disclosure, and the turn log. At terminal: a permanent verdict pill in the below-board slot plus the answer reveal in `terminalExtra` — but the word is **displayed only when earned or asked for** (see Terminal flow below): a win folds "Answer: CRANE." into the pill and shows the `terminalExtra` line; a loss / manual end shows neither. **Peer narration** in the global header pill: coop announces a teammate's accepted guess (neutral); compete announces an opponent's solve (green — tone follows the event). **Decomposed** into a `BoardCol` — the input engine (`current` / `pending` / `submitting` + the `submit_guess` RPC + `useCaptureKeys` + the on-screen keyboard + `keyStates`); it takes the LIVE rows + the `snap`, picks live-vs-snapshot itself, and computes `canGuess` from the game-state `guessingAllowed` PlayArea passes down — and an `InfoCol` (the guess-count state + OpponentStrip + action row + setup + terminal answer-reveal + GameTurnLog). PlayArea is the thin coordinator: `useGame`, the feedback channel (both columns write the below-board pill, resolved here and passed down as `localFeedbackMsg`), and the turn-history `viewing` state. **Turn-history viewer:** clicking a `#n` (on the shown board — see GameTurnLog) hands BoardCol the `lib/history.ts` snapshot with that row ringed and input frozen; keystroke-exit rides `useHistoryViewer`'s `exitOnKey` alongside `useCaptureKeys` (frozen while viewing), a click / ✕ also returns to live.
- **SetupForm** (guesses dropdown + two shared `DifficultyField`s — answer source with a "0: Wordle" option, and legal-guess band whose floor follows the answer; the manifest's `validate` gates Start until legal ≥ answer — + `TimerField`), **Help**.

Chat / pause / timer are inherited via `<GamePage>` / `useCommonGame`. **End game** is surfaced in both places, per the common convention (see [common.md → Manual end](../common.md#manual-end--every-gametypes-end_gametarget_game)): a semantic action-row button (`EndGameButton` coop / `ConcedeGameButton` compete) *and* a GamePage menu item wired through `buildGameMenu`.

**Terminal flow — the waffle treatment** ([celebration-ideas.md](../celebration-ideas.md); see [ui.md → Modals for terminal results](../ui.md#modals-for-terminal-results)). Wordle skips the shared `GameOverModal` — the verdict is carried in-page (below-board pill + action-row outcome line). A **coop solve** pops the shared **`CelebrationDialog`** via `useCelebration`, only at the moment of the win (the `playState → 'won'` flip; gated on playState alone — the waffle loading-race lesson), never on opening an already-won game. And **the word stays hidden on a loss** (and on a manual end): `answerShown` = won (either mode) OR `status.outcome='revealed'` OR this client clicked the terminal "Reveal answer". The losers' paths to closure sit in BOTH the menu and the terminal action row — **"Replay board"** / `RestartButton` (a genuine second try, which the hidden word keeps honest), **"Reveal answer"** / `RevealButton` (at terminal a *local* display toggle — no RPC, no confirm; the target is already on the client post-terminal, so showing it is a display decision under the friends trust model — and mid-game the group give-up RPC above), or **"New game"** / `NewGameButton` (the follow-up game).

## Tests

- **pgTAP** (`tests/wordle/`): `colors` (the algorithm incl. duplicates), `create_game` (validation incl. answer_source/legal_guess bands + the target-source routing + hidden-target grant), `legal_guess` (the same band-3 word is notAWord at legal_guess 2, legal at 6), `gameplay` (coop soft-rejects don't burn, shared board, win + reveal), `compete` (independent boards, mid-game opponent-hidden RLS, fewest-guesses winner, post-terminal reveal), `end_game` (timeout → lost / manual → ended, idempotency, non-player rejected), `replay` (full reset incl. the target re-shielding + same-word survival, mid-game replay, non-player rejected), `reveal` (ended + `outcome='revealed'` + unshield, idempotency, non-player rejected). Tests read the random target back as the superuser to craft a winning guess.
- **Vitest:** the colors render mapping + `manifest` label (the coloring algorithm itself is server-side, tested in pgTAP); **`PlayArea.test.tsx`** — render smoke tests (coop / compete / terminal mount without throwing — the guard we lacked when a removed prop shipped a blank page), peer narration (teammate-guess announced, own guess not, opponent-solve announced green), and the turn-log player picker (solo "You" vs spectator's player-name vs multi "Team"; opponent → "Hidden until game ends").
