# wordiply (WordWire)

**Status:** BUILT — the 13th game, live on `main`. Coop + compete sibling manifests over one
`wordiply` schema. This is the canonical reference doc (promoted from the build plan).

**Codename:** `wordiply` (one token, lowercase everywhere in code — schema, folder,
gametypes `wordiply_coop` / `wordiply_compete`). "Wordiply" is the recognizable name of
the Guardian game we're porting; the fun display **brand** is **WordWire**, and it lives
only in the manifest `BRAND` const.

**Source of truth for _what the game does_:** the Guardian's Wordiply. As with every game
here, the existing game is the spec; the work is fitting it into the Supabase + React
shell, not designing the rules. This is a **new build**, not a code port — but it borrows
its skeleton almost entirely from **wordwheel** / **spellingbee** (word-list games with
difficulty bands + an edge-function board builder) and its **hidden-solution** mechanics
from **wordle** / **waffle**.

---

## 1. Rules

- The system picks a short **base** (a.k.a. *starter*) — a **2–4 letter combination of
  letters, NOT necessarily a real word** (e.g. `AR`, `OWL`, `GNA`, `ZA`). It's just a
  fragment guesses must contain; there is no "base dictionary" or base-difficulty.
- Players enter **5 guesses**. Every guess **must contain the base as a contiguous
  substring** and be a valid dictionary word in the difficulty band, and must be **longer
  than the base** (you have to _extend_ the starter, not just retype it).
- Two readouts, **no single combined score**:
  - **Length score** — `round(100 × yourLongestGuessLength / longestPossibleWordLength)`.
    The denominator is the longest legal-band dictionary word that contains the base word,
    computed once at board-build time.
  - **Letter count** — the **sum of the lengths of all your guesses** (every guess counts,
    not just your longest).
- The game **ends after the final (5th) guess** — coop after the team's 5th shared guess,
  compete once every active player has spent their 5 (see [§6](#6-modes-coop--compete)).

### Compete ordering (the formula)

There is no scalar "final score", so compete is a **lexicographic comparator**, not a sum:

1. **Higher length score wins.**
2. Tie → **higher letter count** wins. *(Rewards using long words across all five lines,
   not just landing one lucky long one. Direction is a flagged decision — see
   [Open decisions](#10-open-decisions).)*
3. Still tied **and the game is timed** → **less time wins** (earlier `finished_at`, i.e.
   the player who completed their five guesses in less elapsed time).
4. Still tied → **co-winners** (all tied-at-top marked won).

The comparator is **authoritative in the RPC**. `src/wordiply/lib/scoring.ts` carries a
parallel `compareCompetitors` — a **parity reference** pinned to the server order by its
Vitest, not wired to any live display (the FE reads the server-resolved `winner_user_id` /
`leaderboard`). It exists so a future client-side ordering has a ready, tested match; if
that never lands, it stays as executable documentation of the tiebreak order.

---

## 2. Why this shape — key design decisions

### Shipped-list + trusting-commit (per the friends-only trust model)

wordwheel / spellingbee / boggle ship their full legal word list to the FE and let it
validate + score locally (trusting-commit). **wordiply does the same.** Per Joel's trust
model **we don't care about cheating**, so it's explicitly fine to ship the whole legal set —
and with it the longest word — to the FE if that makes the build simpler or the FE UX better.
Here it does both:

- The edge fn ships the board's **legal matching-word list** (all clean dictionary words
  containing the base, in the legal band) alongside `max_word_length` + `longest_words`. The
  FE validates a guess locally (contains the base? in the legal set? longer than the base?)
  and knows its length instantly — no per-guess round-trip.
- The submit engine collapses into a **reuse of the shared `useWordSubmit`** (sync lookup +
  optimistic + trusting-commit), instead of the bespoke async-validated hook a
  server-validated design would have needed.
- For a 2-letter base the legal list can be a few thousand words — an acceptable payload
  (wordwheel / boggle ship comparable ones); cap or compress only if a base turns out
  pathological.

**Shipping the data is not the same as showing it.** Scores and the longest word are a
spoiler for the player's *own* experience, so the FE simply **doesn't render them until
terminal** (next subsection). That's a pure display choice, not a security boundary —
devtools would reveal it, and per the trust model that's fine.

What every player sees from the start: the **base word** and the **`max_word_length`**
number (the length-bar's eventual target — a hint, never the answer). Everything is
club-member-readable; nothing is column-hidden.

### Live readout = word length only; scores revealed at terminal

After each guess the player sees **only the length of that word** (a small badge on the
guess row). The two aggregate readouts — **length score %** and **letter count** — and the
**longest possible word** are shown **only at the end**. Mid-game the felt state is "I found
a 7-letter word"; the payoff ("that's 78% of the best — and the best was 9") lands at
terminal.

Compete mirrors this: mid-game an opponent surfaces only **guesses used (`n/5`)** — never a
length score, never their words. The length-score reveal is terminal-only for everyone.

### Substring containment, contiguous

"Contains the base word" means a **contiguous substring** (`position(base in word) > 0`):
base `AR` → `ARROW`, `PARTY`, `BAR` all count; `AVATAR`… yes; `A…R` spread out does **not**.
Only the **first** occurrence is highlighted in the UI (per the spec).

### Legal band is the clean band

The legal predicate (`wordiply.matching_words`) excludes slang / slurs / crude words
(`american and not slang and slur = 0 and crude = 0`) — because this set also determines the
**longest word**, and we don't want a slur to be the answer. One `difficulty` band governs it
(1..6). Word **length is NOT capped** — a long best word like `compartmentalizations` is a
legitimate target. Instead the edge builder throws out over-generous bases (see §5).

### No turn log, no history viewer

Like spellingbee / boggle, wordiply has no `GameTurnLog` and no `useHistoryViewer` — the
five guess lines on the board *are* the record. (Contrast the seven games that do have a
turn log; see docs/playarea.md.)

---

## 3. Schema (`wordiply` schema)

The migration is `supabase/migrations/20260713000000_wordiply.sql` (modeled on
`20260712000000_wordwheel.sql`: schema + grants → tables → RLS → view → publication → RPCs).

### `wordiply.games`

| column | type | notes |
|---|---|---|
| `id` | uuid PK → `common.games(id)` on delete cascade | |
| `club_handle` | text → `common.clubs(handle)` | |
| `mode` | text check (`coop`/`compete`) | denormalized for RLS + RPC branching |
| `base` | text not null, check `^[a-z]{2,4}$` | **public** — the 2–4 letter fragment (NOT a word) |
| `difficulty` | smallint not null | the dictionary band the legal child words are drawn from |
| `max_word_length` | int not null | **public** — the length-score denominator / bar target |
| `longest_words` | jsonb not null | the actual longest matching word(s), capped (top 3); **public** but the FE only *renders* it at terminal |
| `legal_words` | jsonb not null | the full clean legal matching-word list shipped to the FE for local validation (trusting-commit); club-member-readable |
| `created_at` | timestamptz default now() | |

**No hidden columns.** Because we don't care about cheating (trust model), nothing needs the
column-grant + terminal-reveal machinery waffle / wordle / crosswords use. A plain
`security_invoker` `wordiply.games` select (or a thin `games_state` view) exposes every
column — `max_word_length`, `longest_words`, `legal_words` — to club members from the start.
The "scores + longest word only at the end" rule is enforced in the **FE render**, not the
schema (see §2).

### `wordiply.guesses` (the wordwheel `found_words` analog)

| column | type | notes |
|---|---|---|
| `id` | bigint generated always as identity PK | |
| `game_id` | uuid → `wordiply.games(id)` on delete cascade | |
| `user_id` | uuid | who guessed |
| `word` | text not null | the full guessed word (lowercase) |
| `length` | int not null | `char_length(word)` — stored so max/sum are trivial |
| `seq` | smallint | 1..5 within the track (coop: shared 1..5; compete: per-user 1..5) |
| `guessed_at` | timestamptz default now() | doubles as the per-player finish time (5th row) |

- Backstop unique `(game_id, user_id, word)`; **mode-aware dedup** is enforced in
  `submit_guess` (coop dedups across the whole team, compete per-user) — a partial index
  can't express the mode branch, so the RPC owns it (same as wordwheel).

### RLS + realtime

- `games_select` — club members.
- `guesses_select` — **mode + terminal aware**, copied from `wordwheel.found_words_select`:
  coop → all members see all rows; compete → a player sees only their own rows **mid-game**,
  everyone's **at terminal** (the reveal).
- **⚠ Realtime publication invariant (load-bearing — see the memory + CLAUDE.md).** BOTH
  tables must be in `supabase_realtime`:
  ```sql
  alter publication supabase_realtime add table wordiply.games;
  alter publication supabase_realtime add table wordiply.guesses;
  ```
  `useGame` subscribes to `guesses` (live guesses) **and** `games` (replay/terminal touch);
  if either is missing the updated Realtime image drops the **whole** subscription and live
  updates silently die. Both memberships are pinned by the central
  `supabase/tests/common/realtime_publication_test.sql` (which `schema_test.sql`
  defers to).

---

## 4. RPCs (`security definer`, membership-checked)

Signatures mirror wordwheel one-for-one except the board shape and the validated-guess RPC.

- **`wordiply.create_game(target_club text, setup jsonb, player_user_ids uuid[], mode text, board jsonb) → table(id uuid)`**
  - Validates: membership; player counts (coop `[1,6]`, compete `[2,6]`); `mode`; **rejects
    `setup.target_rank`** (wordiply isn't a race-to-rank); one `difficulty` band 1..6;
    timer via `common.require_valid_timer`.
  - Validates `board`: `base` 2–4 lowercase letters; `max_word_length ≥ base_len + 2`
    (headroom gate); `longest_words` **and** `legal_words` non-empty. Board content is taken
    at face value (the edge fn computed it under the caller's JWT), structure is
    sanity-checked here.
  - Inserts `common.games` (gametype `'wordiply_' || mode`) + `wordiply.games`; seeds the
    `status` jsonb (below). **Title = just the uppercased `<BASE>`** (e.g. `"AR"`) —
    deliberately NOT `"<BASE> · best <N>"`: the club-page title shows before/during play,
    and the longest-word length is secret until terminal, so it must not leak there.

- **`wordiply.submit_guess(target_game uuid, word text) → jsonb`** — **trusting-commit**
  (wordwheel's `submit_word` twin; the FE already validated against the shipped legal list):
  1. Game must be `playing`; caller a player; not conceded; budget remaining (coop: team
     `< 5`; compete: caller `< 5`).
  2. **Free server guards** (no dictionary lookup — these catch a stale FE and cost nothing):
     `char_length(word) > base_len` and **contains base** (`position(base in word) > 0`), plus
     mode-aware **dedup**. Dictionary legality is **trusted from the FE** (shipped list),
     exactly as wordwheel trusts its FE. A guess that fails a guard returns `{ok:false,
     reason}` and records nothing.
  3. **Insert** the guess (next `seq`), recompute this track's leaderboard entry,
     check the **end condition**, and if met transition to terminal + (compete) **resolve the
     winner via the formula**. Return `{ok:true, length, guesses_used, is_terminal, ...}` —
     `length` (the one live readout); `length_score` / `letter_count` are returned only on the
     terminal response.
  - Because the FE validates locally, an *invalid* guess never reaches the server (it never
    consumes a line) — same retry-Wordiply-style behavior, now for free.
  - **Opt-in turn-by-turn coop** (setup `coop_style = 'turns'`): after the lock + caller,
    `submit_guess` gates on `common._require_turn`, and calls `common._advance_turn` only on
    an accepted, non-terminal guess — never on a guard reject (too-short / missing-base /
    duplicate) or the guess that ends the game. See
    [common.md → Turn-order](../common.md#turn-order--opt-in-turn-by-turn-for-coop-games).

- **Board-builder SQL helpers** (all `security invoker`, edge-fn-only):
  - **`wordiply.matching_words(base text, legal_band int) → table(word, len)`** — legal clean
    `common.words` **containing `base`** (substring `position()`), longer than the base. The
    one place the "what counts as a legal guess" predicate lives. `submit_guess` does NOT use
    it (it trusts the FE).
  - **`wordiply.candidate_bases(source_band int, n int) → table(base)`** — N random 2–4 letter
    substrings of common source words (so a base always has children, and reads naturally).
  - **`wordiply.try_base(base, legal_band, min_children, max_children, min_headroom) →
    table(max_word_length, longest_words, legal_words)`** — returns the board bits IFF the base
    clears the gate (child count in `[min,max]`, `max_word_length ≥ base_len + headroom`);
    ZERO rows otherwise (so a rejected base transfers nothing). The **max-children bound** is
    what throws out over-generous fragments (`in`/`an`/`ar` have tens of thousands of
    children).

- **`wordiply.submit_timeout(target_game) → jsonb`** — countdown expired → terminal. Coop →
  **`lost`** (`outcome:'timeout'`): the clock is the ONE way a coop table loses, because the
  team had a reachable end (spend the five shared guesses) and didn't reach it — see
  [states.md → When the clock is a LOSS](../states.md#when-the-clock-is-a-loss). Spending the
  guesses or stopping on purpose stay neutral `ended`. Compete → **resolve the formula on
  current scores** → `won_compete` (whoever leads; ties per the comparator) — **unless nobody
  guessed at all**, in which case there is no score to crown and it's `lost_compete` with
  everyone `won:false` (the same guard boggle's score race carries; see
  [states.md → Compete is different](../states.md#compete-is-different-the-clock-resolves-a-race)).

- **`wordiply.end_game(target_game)`** — the manual "we're done" stop, in **both** modes:
  coop → `_finish_coop(…, 'manual')`, the neutral `ended`; compete →
  `_finish_compete(…, 'manual', pick_winner => false)` — also `ended`, everyone
  `won: false`, **no winner crowned** (agreeing to stop isn't a race resolution).
  **`wordiply.concede(target_game)`** — compete per-player drop = a real loss (via
  `common.concede`; others race on). **`wordiply.replay_board(target_game)`** — same base
  word, wipe guesses, un-terminal (wordwheel parity).

### `status` jsonb

```jsonc
{
  "mode": "compete",
  "base": "ar",
  "max_word_length": 9,
  "leaderboard": [
    // mid-game each entry carries only user_id + guesses_used — no score leaks early;
    // length_score / letter_count / finished_at / won are written at terminal.
    { "user_id": "…", "length_score": 78,
      "letter_count": 22, "guesses_used": 5, "finished_at": "…", "won": true }
  ],
  "winner_user_id": "…",                            // compete terminal (null on co-winners)
  "winner_username": "alice",                       // cached at finish time — the club-list
                                                    // label is a pure function of this row
                                                    // and can't resolve a uuid
  "outcome": "complete" | "timeout" | "manual" | "conceded"
}
```
(coop status is simpler: `{ mode, base, max_word_length, guesses_used }`, plus
`length_score` / `letter_count` / `longest` / `outcome` at terminal. Leaderboard usernames
are resolved FE-side from the club roster; only the winner's is cached, in
`winner_username`.)

`labelFor` (manifest) reads this for the club-page row, in the shared status-label
vocabulary ([docs/game-status-labels.md](../game-status-labels.md)). Mid-game, coop shows
the shared budget — `Playing · 3/5 guesses` — while compete shows a bare `Playing`:
per-player progress is **deliberately withheld** (a status line may only say what every
player already sees, and compete counts are private). Terminal, coop (which has no win):
`Ended (out of guesses) · 78% · 22 letters` when the five guesses were spent,
`Ended · 78% · 22 letters` for a manual stop, and the one coop loss
`Lost (out of time) · 78% · 22 letters`. Terminal, compete: `Won by alice · 78%` /
`Won (co-winners) · 78%` (ties leave `winner_user_id` null, so the label counts the
`won` flags); `Lost (all conceded)` when the race emptied out;
`Lost (out of time) · nobody scored` when the clock ran out with no score to crown;
and `Ended · no winner` for a manual compete stop.

---

## 5. Edge function `wordiply-build-board`

A small orchestration over the two SQL helpers (auth → sample → try-until-one-passes →
`create_game` → `{id}`). Constants: `SOURCE_BAND=3`, `CHILD_MIN=20`, `CHILD_MAX=500`,
`MIN_HEADROOM=3`, `ATTEMPTS=40`.

1. Auth (caller JWT), parse `{ target_club, setup{difficulty, timer}, player_user_ids, mode }`;
   `difficulty` defaults to 5.
2. Read the club's **most-recent `wordiply.games.base`** (a repeat cap — don't hand out the
   same starter twice running).
3. `candidate_bases(SOURCE_BAND, ATTEMPTS)` → N candidate fragments (substrings of common
   source words, so they read naturally and always have children).
4. For each candidate (skip a repeat of the previous base): `try_base(base, difficulty,
   CHILD_MIN, CHILD_MAX, MIN_HEADROOM)`. The **first non-empty result wins** — try_base already
   returns the whole board (`max_word_length` + `longest_words` + `legal_words`), so no extra
   query. The **`CHILD_MAX` bound is load-bearing**: it rejects over-generous fragments so the
   board is a real puzzle with a sane payload; word LENGTH is not capped.
5. `board = { base, max_word_length, longest_words, legal_words }`; call
   `wordiply.create_game(...)`; return `{ id }`. (No board found in `ATTEMPTS` tries → 500.)

Env / auth: same as wordwheel (`SUPABASE_URL` / `SUPABASE_ANON_KEY` auto-injected; the caller's
JWT carries every authz signal; `common.words` + the helpers are authenticated-readable;
`create_game` is `security definer` re-checking membership). No service role.

---

## 6. Modes (coop / compete)

| | coop | compete |
|---|---|---|
| guesses | **5 shared** (the whole team fills the five lines together) | **5 per player** (each has their own five-line board) |
| visibility | everyone sees every guess live (each row shows its length); **scores + longest word revealed at terminal** | opponents' **guesses + scores hidden** mid-game (an opponent shows only **guesses used `n/5`**); full reveal at terminal |
| ends | after the team's 5th guess / timeout / manual `end_game` | once every active player has spent 5 / timeout / concede |
| terminal verdict | "Ended: **N%**, M letters" — neutral tone (coop has no win, you just did as well as you did; the info column fills in the LengthScoreBar + longest word). The clock is the exception: "Lost: out of time, **N%**" | "Won: N%" (co-winners "Won: tied at N%"); a loser sees who won, with their identity dot — "● moth won at 78%" |
| players | `[1, 6]` (solo allowed) | `[2, 6]` |

**Why coop = 5 _shared_ (not 5 each):** the FE board is a single five-row surface, and coop
here means the collaborative shared board (like spellingbee coop's shared find list). Five
shared lines makes a tight "let's find the best word together" puzzle that fits the one
board. Flagged in [Open decisions](#10-open-decisions) since it's a real fork.

---

## 7. Frontend

Folder `src/wordiply/`, mirroring `src/wordwheel/`. Two manifests, one schema, one folder
(the sibling-manifest pattern — psychicnum is canonical; wordwheel follows it line-for-line).

- **`manifest.ts`** — `wordiplyCoopGame` / `wordiplyCompeteGame`, a single `BRAND` const,
  shared lazy loaders (Help / PlayArea / SetupForm), `startGameInClub` →
  `invokeStartGameEdgeFn('wordiply-build-board', …)`, `submitTimeout` / `endGame` via
  `makeRpcDispatcher`, per-mode `labelFor`. Register both in the games registry + add to the
  CLAUDE.md doc map.
- **`db.ts`** — typed client on schema `wordiply`.
- **`lib/setup.ts`** — `WordiplySetup = CoopTurnSetup & { timer, difficulty }`: the
  intersected `CoopTurnSetup` carries the opt-in turn-by-turn fields (`coop_style`,
  `first_turn_user_id`) documented in §4's turn-order note. No `target_rank`, no base
  band. `wordiplySetupError` (difficulty 1..6). Both manifests default `difficulty 5`;
  the coop default seeds `coop_style: 'free-for-all'`.
- **`lib/scoring.ts`** — `lengthScore(longest, maxLen)`, `letterCount(lengths)`,
  `compareCompetitors(a, b, timed)` (the comparator, **documented as "must match
  `_finish_compete`"**).
- **`components/SetupForm.tsx`** — one `<DifficultyField>` ("Dictionary") + `<TimerField>` +
  the shared `<CoopStyleField>` (the coop free-for-all vs turn-by-turn picker, which also
  seeds `first_turn_user_id`). No rank picker, no base band, no custom-letters.
- **`hooks/useGame.ts`** — subscribe to `wordiply.guesses` (+ `wordiply.games` for the
  replay/terminal touch), fetch `games_state` + guesses; derive per-track length score +
  letter count (or read `status.leaderboard`).
- **Submit engine — reuse `useWordSubmit`.** Because the legal list ships to the FE, submit
  is the same **sync-lookup + optimistic + trusting-commit** engine wordwheel uses — the
  lookup is membership in the shipped `legalWords` Set (points = the word's **length**, so the
  hook's per-word value IS the length), `commit` calls the `submit_guess` RPC (and surfaces a
  server `{ok:false}` as a release). `minWordLength = base.length + 1`; `explainReject`
  distinguishes "must contain BASE" from "not a word". A rejected guess never hits the server.
  **Success feedback is dropped** (the row already shows the word + its length); only soft
  rejects show a pill.
- **`components/PlayArea.tsx`** — shared; reads `game.mode`; wires `BoardCol` + `InfoCol`,
  the submit hook, terminal copy (`buildOver`), and the coop peer-guess `useGlobalFeedback`.
- **`components/BoardCol.tsx` + the guess board**:
  - **On-screen keyboard, no text box.** wordiply plays on **touch alone** — input is the
    shared **`common/…/entry/GuessKeyboard`** (the Wordle-style QWERTY + Enter/Backspace,
    extracted so wordle + wordiply share one; wordle themes its per-key tints via `--kbd-*`
    CSS vars, wordiply uses neutral keys). A physical keyboard still works via `useCaptureKeys`
    feeding the same `word` state. The keyboard sits **below** the grid and **doubles as the
    feedback area**: a soft-reject line above the keys, and at terminal the keyboard is
    replaced by the verdict pill.
  - **`<GuessBoard>`** — exactly **5 fixed-height rows** (a HARD layout-stability rule; compact
    vertical rhythm so the keyboard fits on mobile). Completed rows render the guess via
    `<DimmedBaseWord>` + a small **length badge** (teal-on-white — the one live readout); the
    **active** row shows the word **live as it's typed** (`<DimmedBaseWord word={typed}/>` + a
    running length badge); remaining rows are empty placeholders with a medium-dark dashed
    outline.
  - **`<DimmedBaseWord base word>`** — splits `word` at the **first** occurrence of `base`;
    renders `prefix + <span dim>base</span> + suffix`. No occurrence yet (still typing) →
    nothing dimmed. Used by both completed rows and the live active row — one component.
  - The **base** is shown plainly above the grid (no "Starter" label).
- **`components/InfoCol.tsx`** — canonical order (docs/playarea.md): **state** — mid-game
  just **"guesses n/5"** (scores are terminal-only, §2); at terminal the same slot fills in
  the **`<LengthScoreBar>`** (percent fill to `max_word_length`, "best 7 / possible 9") + the
  **letter-count** stat. Then **`<OpponentStrip>`** (compete; mid-game `metricLabel="Guesses"`,
  value = each opponent's `n/5`; at terminal switch to length score %), then the **action row** —
  ICON-ONLY: playing = End (coop) / Concede (compete) + back-to-club; terminal = the outcome
  line + `RestartButton` / `NewGameButton` / primary Club via `TerminalActionRow iconOnly`;
  a conceded compete player (the others race on) gets the `LocalTerminalRow` "You conceded"
  + the below-board out-of-race pill —
  then the **`<SetupDisclosure>`** (difficulty band, timer), then the **terminal reveal**
  ("Best possible word: **HANGARS** (7)" — full-colour, no card) and, in compete, the
  **`<OpponentReveal>`** (`components/OpponentReveal.tsx`): each opponent's actual guessed
  words, rendered **only at terminal** — all game long a compete player sees opponents'
  guess *counts* only (the words are RLS-hidden and never ship); when the RLS opens the
  rows at terminal, this is where the words land. Self is excluded (my own words are
  already the board), coop never renders it (one shared live board), and each row mirrors
  the board's look — `<DimmedBaseWord>` + the plain teal length — so an opponent's row
  reads the same as one of mine. There is **no `<WordList>`**
  (the board rows are the words). **The info column is a FIXED width** (`--info-col-width` on
  `.layout`) so it never shifts as the state readout changes.
- **`components/Help.tsx`** — rules modal (shared by both manifests).
- **`theme.css`** — wordiply palette (ships with the chunk).

---

## 8. Tests

**pgTAP** (`supabase/tests/wordiply/`, ported from the wordwheel suite against a fixture in
`setup.psql`):
- `schema_test` — both gametypes registered; tables exist with RLS enabled + the
  `authenticated` SELECT grants; nothing is column-hidden — `games_state` exposes `base` /
  `difficulty` / `max_word_length` / `longest_words` / `legal_words` (the terminal-only
  reveal is an FE choice, §2). The realtime-publication memberships are guarded centrally
  in `common/realtime_publication_test.sql`.
- `create_game_test` — the coop + compete happy paths (rows, gametypes, seeded `status`
  shapes, title = just the uppercased base — no length leak); the guards: an outsider
  (42501), an **invalid positional `mode` arg**, `setup.target_rank`, compete `< 2`
  players, difficulty outside 1..6, malformed board (`base` not 2–4 lowercase letters,
  `max_word_length` below `base_len + 2`, empty `longest_words` / empty `legal_words`),
  player count over 6.
- `gameplay_test` — `submit_guess` trusting-commit: a valid guess → `{ok:true}` + one row +
  status bump; the **free server guards** (longer-than-base, contains-base, mode-aware
  dedup) reject **without inserting or spending budget**; dictionary legality is trusted
  from the FE (guesses in the test are synthetic non-words), so a non-word is a **Vitest**
  concern, not a pgTAP one; the 5-guess budget — **coop shared vs compete per-user**.
- `rls_test` — the compete `guesses_select` policy is a **game rule**, not just privacy:
  mid-game a player reads only their OWN guess rows (opponents surface as counts);
  everyone's open at terminal; coop shows all. Direct-INSERT setup so the read policy is
  exercised in isolation.
- `try_base_test` — the board-build gate (wordiply's board-quality logic is SQL, not TS,
  so it's pinned here): `try_base` returns one board row iff the child count is in
  `[min, max]` (the **max** bound is the load-bearing one) and
  `max_word_length ≥ base_len + headroom`, zero rows otherwise; plus `candidate_bases`.
  Assertions are deliberately count-independent of the real dictionary.
- `turn_order_test` — the opt-in turn-by-turn coop wiring: `create_game` seats the
  rotation on `setup.coop_style = 'turns'`; an out-of-turn guess is rejected; an accepted
  guess advances the pointer, a soft-reject doesn't; free-for-all leaves it null.
- `winner_test` — compete winner by length score; **tiebreak letter count**, then **time**;
  co-winner case; timeout resolves the formula.
- `terminal_test` — coop `end_game` (→ `ended`/`manual`); coop timeout (the one coop
  loss); `replay_board` wipes guesses + un-terminals; `concede`, including the
  last-racer's concede resolving the race rather than hanging it.
- `replay_test` — the dedicated replay suite (the shape every other replay game has).
  Deliberately overlaps `terminal_test` §3's coop pass and adds what it doesn't reach:
  the **compete** branch (`replay_board` hand-writes a zeroed per-player leaderboard —
  nothing else exercises that jsonb), `is_terminal`, the shared clock zeroing, that the
  terminal-only readouts (`length_score` …) do **not** survive into the fresh status,
  and the non-player rejection pinned to `42501`.

**Vitest** (`src/wordiply/`):
- `setup.test` — `wordiplySetupError` (difficulty 1..6) + defaults.
- `scoring.test` — `lengthScore`, `letterCount`, comparator ordering + every tie tier.
- `DimmedBaseWord.test` — splits at the **first** base occurrence; dims exactly it; handles
  no-occurrence and a repeated base (`ana` in `banana` → only the first dimmed).
- `PlayArea.test` — renders **5 rows always** (layout stability); the entry sits on the
  active row; each completed row shows its **length badge**; a valid guess fires
  `submit_guess` + shows the optimistic row; **all** rejects are local (missing base / too
  short / duplicate / not in the shipped list) → pill with **no RPC**; **scores stay hidden
  mid-game** (no `<LengthScoreBar>` / letter-count until terminal — only per-row lengths); the
  terminal reveal renders the bar + letter count + longest word; no reflow play→terminal.

---

## 9. Reuse map (don't rebuild these)

- **Shell / lifecycle:** `<GamePage>`, `useCommonGame`, the manifest/registry + sibling
  pattern, `common.concede` / `end_game` / timers / presence-pause (inherited).
- **Setup:** `<SetupGameDialog>`, `<SetupSection>`, `<DifficultyField>`, `<TimerField>`.
- **Entry + submit:** the shared **`common/…/entry/GuessKeyboard`** (the Wordle-style on-screen
  keyboard, shared with wordle) for touch input + **`useCaptureKeys`** for physical keys, both
  driving the same `word`. Submit reuses **`useWordSubmit`** (shipped-list, trusting-commit)
  with a wordiply validator (points = the word's length). No `<EntryRow>` / `<EntryBox>` (that
  needs a physical keyboard).
- **Feedback:** `useLocalFeedback` / `useGlobalFeedback` / `<GenericFeedbackPill>`.
- **Info column:** `<OpponentStrip>`, `<SetupDisclosure>`, `<Stats>`-style readout,
  `<TerminalActionRow>` / `<LocalTerminalRow>`, the button set
  (End/Concede/Restart/NewGame/BackToClub). A `<LengthScoreBar>` is likely new (or a thin
  reskin of wordwheel's `<RankBar>`, which is already "fill to a target percent").
- **RPC helpers:** `makeRpcDispatcher`, `invokeStartGameEdgeFn`.
- **Not applicable:** `useHistoryViewer` / `GameTurnLog` (no turn log), `WordList` (the
  board rows are the words), PDF print (candidate but deferred — see below).

---

## 10. Open decisions

Recommended default in **bold**; each is a real fork worth a nod before/at build.

1. **Brand name** — **resolved: "WordWire".** Lives only in the manifest `BRAND` const.
2. **Validation model** — **resolved: ship-list trusting-commit** (§2). Per the trust model
   we don't care about cheating, so the legal list ships to the FE (simpler build, reuses
   `useWordSubmit`, no per-guess round-trip). Scores + longest word are hidden until terminal
   as a *display* choice, not a security one.
3. **Letter-count tiebreak direction** — **higher wins** (more/longer words = more
   wordplay). Could argue lower = efficiency; confirm.
4. **Unresolved-tie result** — **co-winners** vs seat-order tiebreak.
5. **Coop budget** — **5 shared** (team fills one board, §6) vs 5-per-player. The shared
   choice is what makes the single five-row board coherent.
6. **Guess count** — **fixed at 5** (a constant, not a setup option). Could expose later.
7. **Legal-band cleanliness** — **exclude slang/slur/crude** (stricter than
   `candidate_words`' legal side) so a slur can't be the longest word. Confirm.
8. **What ships to the FE** — **resolved: everything** (`legal_words`, `longest_words`,
   `max_word_length` are all club-member-readable). The FE gates *display* of scores + the
   longest word to terminal (§2); the data itself isn't hidden.
9. **PDF print** — defer (a snapshot of base + 5 guesses + reveal is printable like
   spellingbee's, but not v1).
10. **Live readout** — **resolved: word length only during play**; length score %, letter
    count, and the longest word appear only at terminal (§2). Compete opponents show just
    guesses used mid-game.
