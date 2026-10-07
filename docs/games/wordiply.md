# wordiply (WordWire)

**Status:** BUILT — the 13th game, live on `main`. Coop + compete sibling
manifests over one `wordiply` schema. This is the canonical reference doc
(promoted from the build plan).

**Codename:** `wordiply` (one token, lowercase everywhere in code — schema,
folder, gametypes `wordiply_coop` / `wordiply_compete`). "Wordiply" is the
recognizable name of the Guardian game we're porting; the fun display **brand**
is **WordWire**, and it lives only in the manifest `BRAND` const.

**Source of truth for _what the game does_:** the Guardian's Wordiply. As with
every game here, the existing game is the spec; the work is fitting it into the
Supabase + React shell, not designing the rules. This is a **new build**, not a
code port — but it borrows its skeleton almost entirely from **wordwheel** /
**spellingbee** (word-list games with difficulty bands + an edge-function board
builder) and its **hidden-solution** mechanics from **wordle** / **waffle**.

---

## 1. Rules

- The system picks a short **base** (a.k.a. *starter*) — a **2–4 letter
  combination of letters, NOT necessarily a real word** (e.g. `AR`, `OWL`,
  `GNA`, `ZA`). It's just a fragment guesses must contain; there is no "base
  dictionary" or base-difficulty. A player can also **name the base themselves**
  at setup — the challenge ("try wordiply with MOTH"). See
  [§5b](#5b-a-player-chosen-base-setupcustom_base).
- Players enter **5 guesses**. Every guess **must contain the base as a
  contiguous substring** and be a valid dictionary word in the difficulty band,
  and must be **longer than the base** (you have to _extend_ the starter, not
  just retype it).
- Two readouts, **no single combined score**:
  - **Length score** — `round(100 × yourLongestGuessLength /
    longestPossibleWordLength)`. The denominator is the longest legal-band
    dictionary word that contains the base word, computed once at board-build
    time.
  - **Letter count** — the **sum of the lengths of all your guesses** (every
    guess counts, not just your longest).
- The game **ends after the final (5th) guess** — coop after the team's 5th
  shared guess, compete once every active player has spent their 5 (see
  [§6](#6-modes-coop--compete)).

### Compete ordering (the formula)

There is no scalar "final score", so compete is a **lexicographic comparator**,
not a sum:

1. **Higher length score wins.**
2. Tie → **higher letter count** wins. *(Rewards using long words across all
   five lines, not just landing one lucky long one. Direction was a flagged
   fork, ratified 2026-08-03 — see [Decisions](#10-decisions).)*
3. Still tied → **the earlier last word wins**. Two words never land at the
   same instant, so this always resolves: there are no co-winners.

Only a player who didn't concede and scored is ranked; a race nobody scored
in ranks nobody. The comparator lives in the RPC alone
(`wordiply._finish_compete`), and `winner_test` pins it; the page reads the
ranking it wrote.

---

## 2. Why this shape — key design decisions

### Shipped-list + trusting-commit (per the friends-only trust model)

wordwheel / spellingbee / boggle ship their full legal word list to the FE and
let it validate + score locally (trusting-commit). **wordiply does the same.**
Per Joel's trust model **we don't care about cheating**, so it's explicitly fine
to ship the whole legal set — and with it the longest word — to the FE if that
makes the build simpler or the FE UX better. Here it does both:

- The edge fn ships the board's **legal matching-word list** (all clean
  dictionary words containing the base, in the legal band) alongside
  `max_word_len` + `longest_words`. The FE validates a guess locally
  (contains the base? in the legal set? longer than the base?) and knows its
  length instantly — no per-guess round-trip.
- The submit engine collapses into a **reuse of the shared
  `useFoundWordSubmit`** (sync lookup + optimistic + trusting-commit), instead
  of the bespoke async-validated hook a server-validated design would have
  needed.
- For a 2-letter base the legal list can be a few thousand words — an acceptable
  payload (wordwheel / boggle ship comparable ones); cap or compress only if a
  base turns out pathological.

**Shipping the data is not the same as showing it.** Scores and the longest word
are a spoiler for the player's *own* experience. The scores are written to the
page blobs only once the game has ended (null before), and the longest word,
though `game_data`'s puzzle carries it from create, is drawn only at the end and
only when asked for (next subsection). That's a display choice, not a security
boundary — devtools would reveal it, and per the trust model that's fine.

What every player sees from the start is the **base** — and nothing else about
the answer. `puzzle.maxWordLen` is NOT shown at kickoff: its readers draw it
only once the game has ended (`StateLine`'s `<LengthScoreBar>`, the reveal, the
PDF's `reveal`), and mid-game the state line shows only `n / 5 guesses`.
Everything is club-member-readable and nothing is column-hidden.

### Live readout = word length only; scores revealed at the end

After each guess the player sees **only the length of that word** (a small badge
on the guess line). The two aggregate readouts — **length score %** and **letter
count** — are shown **only at the end**. Mid-game the felt state is "I found a
7-letter word"; the payoff ("that's 78% of the best") lands when the game ends.

The **longest possible word** goes one step further: even at the end it waits
for the **Reveal best solution** button (`act-reveal`, one action carrying
both faces — the action row and the menu twin place the SAME one — see [ui.md →
Endings](../ui.md#endings--the-moment-vs-the-record)). The
score says how well you did *without naming the answer*, so a table that wants
to keep guessing at `_ _ _ _ _ _ _` can. The reveal is local and reversible —
mine alone, and the same button takes it back — so one impatient player can't
end everyone else's think.

Compete mirrors this: mid-game an opponent surfaces only **guesses used
(`n/5`)** — never a length score, never their words. The length scores arrive
for everyone when the game ends.

### Substring containment, contiguous

"Contains the base word" means a **contiguous substring** (`position(base in
word) > 0`): base `AR` → `ARROW`, `PARTY`, `BAR` all count; `AVATAR`… yes; `A…R`
spread out does **not**. Only the **first** occurrence is highlighted in the UI
(per the spec).

### Legal band is the clean band

The legal predicate (`wordiply.matching_words`) excludes slang / slurs / crude
words (`american and not slang and slur = 0 and crude = 0`) — because this set
also determines the **longest word**, and we don't want a slur to be the answer.
One `difficulty` band governs it (1..6). Word **length is NOT capped** — a long
best word like `compartmentalizations` is a legitimate target. Instead the edge
builder throws out over-generous bases (see §5).

### The event log, and what its history viewer is for

wordiply **does** have a `GameEventLog` (added 2026-08-02, making it the
eighth). The five board lines show *what* was guessed but not *who* guessed it,
which coop can't get any other way — and the log is also where **rejected**
guesses live, so the team can see that someone already tried a word. See
[§7b](#7b-the-event-log--and-why-rejects-are-stored).

It has a **`useHistoryViewer`** too, and what makes it worth having here is the
rejects. Replaying an *accepted* word shows you the board you are already
looking at — five rows, all visible at once, nothing hidden. But a reject is on
no board at all, and opening its `#N` is the only way to see the table as it
stood when that word was tried. So the replay
([`lib/history.ts`](../../src/wordiply/lib/history.ts) → `replayTurn`) finds
the addressed row among **all** of them, rejects included, and fills a line
only per accepted word. In compete it replays the author's own board.

---

## 3. Schema (`wordiply` schema)

The shape is `supabase/migrations/20260713000000_wordiply.sql`, with
`20260917000007_wordiply_events.sql` (the log) and
`20261004000004_wordiply_len_columns.sql` (the two `len` columns); the behavior
is `supabase/sql/wordiply.sql`.

### `wordiply.games`

| column | type | notes |
|---|---|---|
| `game_id` | uuid PK → `common.games(id)` on delete cascade | |
| `base` | text not null, check `^[a-z]{2,4}$` | the 2–4 letter fragment (NOT a word) |
| `max_word_len` | int not null | the length-score denominator / bar target |
| `longest_words` | jsonb not null | the actual longest matching word(s), capped (top 3) |
| `legal_words` | jsonb not null | the full clean legal matching-word list, for the page to judge a word itself (trusting-commit) |

The mode, the club and the start time are `common.games`'; the dictionary band
only chose the words, and stays in `setup.difficulty`.

**No hidden columns.** Because we don't care about cheating (trust model),
nothing needs the column-grant machinery waffle / wordle / crosswords use:
every column is granted to club members. The "longest word only at the end"
rule is the page's (see §2); the scores are null in the blobs until the end.

### `wordiply.events` — the event log

| column | type | notes |
|---|---|---|
| `id` | bigint generated always as identity PK | the order of play |
| `game_id` | uuid → `wordiply.games(game_id)` on delete cascade | |
| `user_id` | uuid | who submitted it |
| `word` | text not null | the word, lowercase |
| `len` | int not null | `char_length(word)` — stored so max/sum are trivial |
| `valid` | boolean not null | it counted: it spent a guess and fills a board line |
| `reason` | text | why it was refused — `missing_base` / `too_short` / `not_a_word`; null iff valid (a check pins the pair) |
| `kind` | text not null, check `in ('guess')` | one value: every row is a submission |
| `took_turn` | boolean not null | whether the submission cost the player their go — true on an accepted word and on a rules break (`too_short` / `missing_base`), false on a dictionary miss |
| `created_at` | timestamptz default now() | the last word's time breaks a compete tie |

- Backstop unique `(game_id, user_id, word)`; **mode-aware dedup** is enforced
  in `submit_guess` (coop dedups across the whole team, compete per-user) — a
  partial index can't express the mode branch, so the RPC owns it (same as
  wordwheel).

### RLS

Both tables need only the membership gate (`games_select`, `events_select`).
Who may see a rival's words mid-race is the page's rule — `makeGameData`'s
seat rule over `game_data` — and nothing reads the tables from the client.
Neither is in `supabase_realtime`: the page hears a move through the
`changed` Broadcast (src/common/realtime/doc.md).

### The page blobs

`wordiply._rebuild_data_cols` writes them at create, at Restart and at the end
of every move — a recorded reject included, since it is in everyone's log —
each assigned whole ([plans/seat-view.md](../../plans/seat-view.md) → The page
is written, not assembled): `shell_data` through `common._make_json_shell_data`,
and on top of the common part of every `game_data` this game's own. A track's
four numbers — `nGuessesUsed`, and `lengthScore`, `nLetters`,
`longestWordLen`, which are null until the game ends — are one helper's,
`wordiply._make_json_track`, over one player's accepted words or the whole
team's. `static_game_data`, what nothing after create changes, is written once
by `_write_static_game_data`, from `create_game` and the rebuild over every
game, never by a move ([common-schema.md → Title, statuses and the two
dates](../common-schema.md#title-statuses-and-the-two-dates)); the hook merges
it into `game_data`, each key in its place:

| blob | wordiply's part |
|---|---|
| `static_game_data` | `puzzle: {base, maxWordLen, longestWords, legalWords}`, frozen at create |
| `game_data` | `team`, the team's facts sent once — its track, the budget and the one board of accepted words — null in compete; `events`, every submission `{id, userId, word, valid, reason, tookTurn, at}`, rejects included, in the order of play; on each player their own facts: `maxGuesses` (5), their track, and a racer's `board: {words}`, null on a coop player |
| `summary_data` | `team: {nGuessesUsed, lengthScore, nLetters}`, null in compete; `maxGuesses`; `winnerLengthScore`, compete's once the race is won, null in coop |

**The client reads nothing from these tables.** The page is handed the blobs
off `common.games` and re-reads them as the shell delivers each rewrite. The
statuses (`game_status`, `player_status`, `clubpage_info`) are not written.

---

## 4. RPCs (`security definer`, membership-checked)

Signatures mirror wordwheel one-for-one except the board shape and the
validated-guess RPC.

- **`wordiply.create_game(p_club_handle text, p_setup jsonb, p_player_user_ids
  uuid[], p_mode text, p_board jsonb) → jsonb`**
  - Validates: membership; player counts (coop `[1,6]`, compete `[2,6]`);
    `mode`; **rejects `setup.target_rank`** (wordiply isn't a race-to-rank); one
    `difficulty` band 1..6; timer via `common._require_valid_timer`; and the
    optional **`setup.custom_base`** — its shape, plus the cross-check that
    `board.base` matches it ([§5b](#5b-a-player-chosen-base-setupcustom_base)).
    It is stripped from the club's saved default.
  - Validates `board`: `base` 2–4 lowercase letters; `max_word_len ≥
    base_len + 2` (headroom gate); `longest_words` **and** `legal_words`
    non-empty. Board content is taken at face value (the edge fn computed it
    under the caller's JWT), structure is sanity-checked here.
  - Inserts `common.games` (gametype `'wordiply_' || mode`) + `wordiply.games`;
    writes the page blobs (§3). **Title = just the uppercased `<BASE>`**
    (e.g. `"AR"`) — deliberately NOT `"<BASE> · best <N>"`: the club-page title
    shows before/during play, and the longest-word length is secret until
    the end, so it must not leak there.

- **`wordiply.submit_guess(p_game_id uuid, p_word text, p_fe_legal boolean
  default true) → jsonb`** — **trusting-commit** (the FE already validated
  against the shipped legal list):
  1. The game hasn't ended; caller a player; not conceded; the turn; budget
     remaining (coop: team `< 5`; compete: caller `< 5`).
  2. Mode-aware **dedup**, then the **free server guards** (no dictionary
     lookup — these catch a stale FE and cost nothing): `char_length(word) >
     base_len` and **contains base** (`position(base in word) > 0`). Dictionary
     legality is **trusted from the FE** (`p_fe_legal`). A guess that fails a
     guard is recorded as a reject and answers `{result: 'rejected', reason}`.
  3. **Insert** the guess and check the **ending**: coop's fifth accepted word
     ends `resource_exhausted` / `complete`, a win with the team ranked 1; a
     compete fifth word ends that racer (`resource_exhausted` / `complete`), and
     the race once nobody is left racing, **ranked by the formula**, the reason
     the last racer's act. Then the page blobs, and `{result: 'accepted'}` —
     what the word did, the page reads from the blobs.
  - Because the FE validates locally, an *invalid* guess never reaches the
    server (it never consumes a line) — same retry-Wordiply-style behavior, now
    for free.

  **What it answers** ([envelopes.md](../envelopes.md)). Two shapes split across
  the arms, because they differ in the one way that matters — whether anything
  was recorded:

  | | | |
  |---|---|---|
  | `{ result: 'accepted' }` | `ok` | the guess landed and spent a line |
  | `{ result: 'rejected', reason }` | `ok` | a guard refused it, an `events` row was written, and the go may have been spent. A verdict on a move that happened |
  | `PN365` `<WORD> — already found` | `race` | records NOTHING, so it refuses. `useFoundWordSubmit` dedups locally first, so reaching this means that list was stale |
  | `PN486` "Game over" · `PN483` "Already conceded" · `PN366` "No guesses left" | `race` | the frontend's own gates losing to the subscription that feeds them |
  | `PN485` "That game was already deleted" | `race` | a friend deleted the game mid-call — the shared race (`common._raise_game_deleted`), asked before the membership gate |
  | `PN367` `BUG: a guess the client called legal breaks the base rules` | `fault` | |

  `create_game`'s ten (**PN122**–**PN131**) are all `BUG:` faults. The two a
  player can actually cause — a starter that matches too many words, or too few
  — are raised by the build-board edge function as `form-validation` instead
  (PN133 / PN134), because they belong under the setup dialog's own field.
  - **Opt-in turn-by-turn coop** (setup `coop_style = 'turns'`): after the
    lock + caller, `submit_guess` gates on `common._require_turn`, and calls
    `common._advance_turn` on an accepted guess that doesn't end the game and on
    a rules break (too-short / missing-base) — never on a dictionary miss or a
    duplicate. See [common-schema.md →
    Turn-order](../common-schema.md#turn-order--opt-in-turn-by-turn-for-coop-games).

- **Board-builder SQL helpers** (all `security invoker`, edge-fn-only):
  - **`wordiply.matching_words(p_base text, p_legal_band int) → table(word, len)`**
    — legal clean `common.words` **containing `base`** (substring `position()`),
    longer than the base. The one place the "what counts as a legal guess"
    predicate lives. `submit_guess` does NOT use it (it trusts the FE).
  - **`wordiply.candidate_bases(p_source_band int, p_n int) → table(base)`** — N
    random 2–4 letter substrings of common source words (so a base always has
    children, and reads naturally).
  - **`wordiply.try_base(p_base, p_legal_band, p_min_children, p_max_children,
    p_min_headroom) → table(max_word_len, longest_words, legal_words)`** —
    returns the board bits IFF the base clears the gate (child count in
    `[min,max]`, `max_word_len ≥ base_len + headroom`); ZERO rows otherwise
    (so a rejected base transfers nothing). The **max-children bound** is what
    throws out over-generous fragments (`in`/`an`/`ar` have tens of thousands of
    children).

- **`wordiply.submit_timeout(p_game_id) → jsonb`** — countdown expired → the
  end. Coop → `timeout` / `timeout`, **lost**, nobody ranked: the team had a
  reachable end (spend the five shared words) and didn't reach it. Compete →
  **the formula on current scores**, ranking whoever leads — and nobody when
  nobody scored, a collective loss.

- **`wordiply.stop_game(p_game_id)`** — the Stop, in **both** modes, through
  `common._stop`: `stopped`, neutral, nobody ranked.
  **`wordiply.concede(p_game_id)`** — compete per-player drop = a real loss:
  locks the row, `common._concede`, then ends the race if every other racer has
  already spent their five (the reason `conceded`).
  **`wordiply.replay_board(p_game_id)`** — same base word, wipe guesses,
  `common._reset_game`.

### The club card

`summaryFor` (manifest) reads `summary_data` for the club-page row, in the
shared status-label vocabulary ([docs/game-summary.md](../game-summary.md)).
Mid-game, coop shows the shared budget — `Playing · 3/5 guesses` — while compete
shows a bare `Playing` (each racer's count is on the opponent strip; the label
names none). Ended, coop: `Ended (out of guesses) · 78% · 22 letters` when the
five guesses were spent — a win, but coop's words never say "Won" —
`Ended · 78% · 22 letters` for a Stop, and the one coop loss
`Lost (out of time) · 78% · 22 letters`. Ended, compete: `Won by alice · 78%`;
`Lost (all conceded)` when the race emptied out; `Lost (out of time) · nobody
scored` or `Lost (out of guesses) · nobody scored` when nobody scored; and
`Ended · no winner` for a Stop.

---

## 5. Edge function `wordiply-build-board`

A small orchestration over the two SQL helpers (auth → sample →
try-until-one-passes → `create_game` → `{id}`). Constants: `SOURCE_BAND=3`,
`CHILD_MIN=20`, `CHILD_MAX=500`, `MIN_HEADROOM=3`, `ATTEMPTS=40`.

1. Auth (caller JWT), parse `{ target_club, setup{difficulty, timer},
   player_user_ids, mode }`; `difficulty` defaults to 5.
2. Read the club's **most-recent `wordiply.games.base`** (a repeat cap — don't
   hand out the same starter twice running).
3. `candidate_bases(SOURCE_BAND, ATTEMPTS)` → N candidate fragments (substrings
   of common source words, so they read naturally and always have children).
4. For each candidate (skip a repeat of the previous base): `try_base(base,
   difficulty, CHILD_MIN, CHILD_MAX, MIN_HEADROOM)`. The **first non-empty
   result wins** — try_base already returns the whole board (`max_word_len` +
   `longest_words` + `legal_words`), so no extra query. The **`CHILD_MAX` bound
   is load-bearing**: it rejects over-generous fragments so the board is a real
   puzzle with a sane payload; word LENGTH is not capped.
5. `board = { base, max_word_len, longest_words, legal_words }`; call
   `wordiply.create_game(...)`; return `{ id }`. (No board found in `ATTEMPTS`
   tries → 500.)

Env / auth: same as wordwheel (`SUPABASE_URL` / `SUPABASE_ANON_KEY`
auto-injected; the caller's JWT carries every authz signal; `common.words` + the
helpers are authenticated-readable; `create_game` is `security definer`
re-checking membership). No service role.

---

## 5b. A player-chosen base (`setup.custom_base`)

The **challenge**: instead of letting the builder sample, a player types the
starter at setup — *"try wordiply with MOTH"*. Blank (the default) means the
random path above, unchanged. This is the same override spellingbee / wordwheel
(`custom_center` + `custom_letters`) and boggle (`custom_board`) already ship,
and it follows their rules: a `<SetupSection>` disclosure showing its own value,
a cleared input storing `undefined`, a relaxed quality gate, and **not** saved
as the club's next default (`create_game` strips it — otherwise every later game
in the club would silently default to `MOTH`).

### The gate

Same `try_base`, different arguments — the gate **function** doesn't branch:

| knob | random | custom | why |
|---|---|---|---|
| `CHILD_MIN` | 20 | **1** | you picked it; it only has to be playable |
| `CHILD_MAX` | 500 | **1000** | for a custom base this bound is purely about **payload** (the whole legal list ships to the FE and lands in the games row), not puzzle quality — which is your call. Deliberately NOT raised for random boards. |
| `MIN_HEADROOM` | 3 | **3** (unchanged) | the best word must still beat the base by ≥3 letters |

**Headroom is the load-bearing one here, and only here.** With the floor at 20
it never fires — a base with 20+ children essentially always has one 3+ letters
longer — so it reads like dead weight. At the custom floor of 1 it is the only
thing standing between you and a `MOTH` board whose best answer is `MOTHER`.
Measured on 500 real words it rejects `YAKS` (best: `kayaks`), `JOEY`, `IBEX`,
`ORGY`. `try_base_test.sql` §D pins this, and the assertion was verified by
breaking the gate first.

Measured over 500 random common 2–4 letter dictionary words at band 5, **450
(90%) yield a board**. The rejections are lopsided by length: short bases fail
for being too generous (9/10 two-letter, 20/118 three-letter), 4-letter bases
for being too sparse.

### Validation is split, deliberately

- **The FE checks SHAPE only** (`customBaseError`: 2–4 letters). Whether letters
  *yield* a board is a dictionary question it can't answer without a round trip,
  so it doesn't guess — the same deal boggle's generation constraints get.
- **The edge fn owns the dictionary question**, and rejects at Start with one of
  two player-reachable keys. `try_base` returns zero rows for *any* gate
  failure, so the reject path runs one extra `count`-only query (`head: true`,
  so a 20k-word base transfers nothing) to say which way it failed:

  | key | when | caption |
  |---|---|---|
  | `base-too-common` | children > 1000 | `ING matches too many words` |
  | `base-too-narrow` | 0 children, or best word < base+3 | `No long enough word contains YAKS` |

  Two rather than one because the fixes differ — too many wants a *longer*
  starter, too few a *different* one. Both are **`form-validation`** raised by
  the build-board edge function (**PN133** / **PN134**, `field: 'custom_base'`),
  so they land on the setup dialog's own error line under that field, not the
  below-board pill and not the fault modal.
- **A malformed base is checked FIRST**, before any dictionary query, and
  returns `bad-custom-base` — no copy, so it faults. Without that guard `m`
  matches most of the language and comes back as "matches too many words",
  advising a longer starter for what is really a broken client.
- **`create_game` cross-checks** that `board.base` is the base that was asked
  for (`base-mismatch`). Every downstream reader — title, board, scoring —
  trusts `board.base`, so a builder that ignored the request would hand the
  player a different game than they set up, and this is the only place that can
  catch it.

The **previous-base repeat cap is skipped** on this path: re-issuing the same
challenge to the same club is a legitimate thing to want, and the cap exists to
stop *random* boards repeating.

### Not built, on purpose

- **No live validity preview in the dialog.** It would have to show
  `max_word_len`, which is exactly the number the game hides until the end.
- **No compete-fairness mechanic.** Whoever picks the base may have a word in
  mind; that is what a challenge *is*, and the friends-on-a-Zoom-call framing
  settles it.
- **No "the base must not be a real word" rule.** The rules already say *not
  necessarily* a word — `MOTH` is fine, guesses just have to contain it and be
  longer.

---

## 6. Modes (coop / compete)

| | coop | compete |
|---|---|---|
| guesses | **5 shared** (the whole team fills the five lines together) | **5 per player** (each has their own five-line board) |
| visibility | everyone sees every guess live (each line shows its length); **scores + longest word revealed at the end** | opponents' **guesses + scores hidden** mid-game (an opponent shows only **guesses used `n/5`**); full reveal at the end |
| ends | after the team's 5th guess (a win) / timeout (a loss) / Stop | once every player has spent 5 or conceded / timeout / Stop |
| verdict | "Ended: **N%**, M letters" — the five words spent is a win, drawn green, but coop's words never say "Won": the team did as well as it did. A Stop reads the same, neutral; the clock is the one loss, "Lost: out of time, **N%**". No confetti | "Won: N%", with confetti; a loser sees who won, with their identity dot — "● moth won at 78%". A racer out while the others race on sees "Out of guesses — waiting" or "Conceded — race continues" |
| players | `[1, 6]` (solo allowed) | `[2, 6]` |

**Why coop = 5 _shared_ (not 5 each):** the FE board is a single five-row
surface, and coop here means the collaborative shared board (like spellingbee
coop's shared find list). Five shared lines makes a tight "let's find the best
word together" puzzle that fits the one board. A real fork, resolved in
[Decisions](#10-decisions).

---

## 7. Frontend

### What a guess says (`lib/answer.ts`)

Everything this game says about a guess is one function, `answerMessage`, which
gives each answer its words and outcome together: `accepted` (`won`, and no
words — the row is the answer) · its `accepted_peer` twin · `too_short` and
`missing_base` (`lost`) · `not_a_word` and `already_found` (`warning`). The
answers are named in the server's vocabulary, which a rejected row carries in
`reason`. The shared `useFoundWordSubmit` reports what it decided to `onAnswer`,
and `answerOf` splits its one "not legal" into `missing_base` / `not_a_word`;
the pill and the board's answer mark read that one call, the peer line reads
`peerAnswerMessage`, and the log bar reads `eventToOutcome(row)` — the log and
the printout write their own words, `getRejectLabel`'s. No RPC carries an
outcome or a message here: the frontend
decides, once. A word the list does not know is a `warning` rather than a loss,
because this game is asking you to try strange words. See [outcomes.md → One
event, one outcome](../outcomes.md#one-event-one-outcome--and-who-decides-it).

### The play surface

The shape [`docs/playarea.md`](../playarea.md) describes, on the page blobs
([plans/seat-view.md](../../plans/seat-view.md)):

```
<PlayAreaLoader {...PlayAreaLoaderProps}>   useGame: gd from the game_data blob
  └── PlayArea                      the coordinator: draws no board, no control
        ├── BoardCol                the starter, the board, the keyboard; owns the move
        │     ├── Board             maxGuesses fixed-height lines; decides each one
        │     │     └── BoardRow    one line — the word (base dimmed) and its length
        │     ├── HistoryBanner ←   over the input area while a past row is open
        │     ├── FeedbackPill ←    the local slot, above the keys
        │     └── GuessKeyboard ←   the on-screen keys, below the board
        ├── InfoSheet ←             off-canvas on a phone, a flex child on desktop
        │     └── InfoCol           the readouts and the action row
        │           ├── StateLine   guesses n/5; once ended, the score bar + letters
        │           ├── TurnStatusLine ←   turn-by-turn coop only
        │           ├── OpponentStrip ←    compete only: each racer's count, or "out"; once ended, their score
        │           ├── InfoActionsRow ←   one row, every action, in the menu's order
        │           ├── SetupDisclosure ←
        │           ├── the best word, while revealed
        │           ├── OpponentReveal     compete, once ended: each rival's words
        │           └── GameEventLog       every submission, rejects included
        └── CelebrationBlockingModal ←     my race win, as it lands; never in coop

  ← belongs to common/ or shared/ ; everything else is this folder's
```

- **`useGame`** builds `gd` through `makeGameData`, a pure function of the blob
  and who I am: the players with their links resolved, the seat rule (mid-race
  in compete a rival's rows leave `gd.events` and their `board` is null), the
  setup rows, and wordiply's facts (`GFacts`: the track, `maxGuesses`,
  `board`) on every player twice — spread on, the side's (the team's in coop,
  their own in compete); under `own`, their own
  ([common-schema.md → A player's facts](../common-schema.md#a-players-facts--the-sides-and-their-own)). The state line reads
  `gd.me` beside `gd.puzzle`, whose `maxWordLen` is the board's longest. It
  reads nothing and subscribes to nothing.
- **`BoardCol` owns the move.** `useSubmitGuess` holds the shared
  `useFoundWordSubmit` engine — a lookup in the shipped `legalWords` Set
  (points = the word's length), the `submit_guess` call, what each answer
  shows, `recordReject` for a refused word (§7b), and the answer mark on the
  line the word was typed into; `useTypedGuess` types into it from either
  keyboard (`useCaptureKeys`, the on-screen caps, `↑`/`↓` recall); and
  `useMarkForeignGuesses` marks a teammate's word as it lands. One gate,
  `isInteractive` — my move, on the live board — feeds the capture, the typing
  line and the keyboard. **An accepted word shows no result** (its line already
  shows the word and its length); only refusals show, in the local slot. The
  keyboard stays once the game has ended, disabled.
- **`Board` decides, `BoardRow` draws.** `Board` takes `grid`, `marks`,
  `historyView` and `isInteractive`, works out each line's kind (landed — mine
  held while its answer shows counts as one — typing, or empty) and which line
  the answer is on, and `BoardRow` draws it. `DimmedBaseWord` dims the base at
  its **first** occurrence, in the data's case; CSS draws the capitals.
- **`PlayArea`** wires the ending messages (`useGetGameEndingMessage`,
  `useGetPlayerEndingMessage`, from `lib/gameEndingMessage.ts` and
  `lib/playerEndingMessage.ts`), the waiting line, the coop peer narration, the
  history view (`useHistoryView`) and the commands (`useActionsAndMenu`, which
  also publishes the menu and builds the printout from `gd`).
- **`InfoCol`**: the best possible word shows only while this viewer has it
  revealed, and grows the column when opened — a blessed exception to [ui.md →
  Layout stability](../ui.md#layout-stability). There is **no `<WordList>`**
  (the board lines are the words), and the info column is a FIXED width
  (`--info-col-width` on `.layout`).
- **`manifest.ts`** — the two sibling manifests, one `BRAND`, the shared lazy
  loaders, `startGameInClub` → `runEdgeFn('wordiply-build-board', …)`, and each
  mode's `summaryFor` over `summary_data` (§4 → The club card).
- **`lib/setup.ts`** — `wordiplySetupError` (the band, and `customBaseError`'s
  2–4 letter shape gate, §5b), `cleanBase` shared with the form, the two
  defaults (neither seeds `custom_base` — blank means random). The setup pair
  is `GSetupValues` / `GSetup` in `types.ts`, whose `CoopTurnSetup` carries the
  opt-in turn-by-turn fields.
- **`components/SetupForm.tsx`** — one `<DictBandField>` ("Dictionary"), a
  **"Starter (optional)"** `<SetupSection>` (§5b; its summary carries the value,
  e.g. `Starter: MOTH`), `<SetupTimerSection>` and the shared
  `<SetupCoopStyleSection>`. The field says **Starter**, not "base": the schema
  says `base` but every player-facing string in this game says starter.
- **`lib/scoring.ts`** — `computeLengthScore`, the formula of
  `wordiply._length_score`, for the test fixture alone: the page reads every
  score from the blobs.

---

## 7b. The event log — and why rejects are stored

`wordiply.events` is the **event log**, not a list of scored words: every
submission lands a row, accepted or not. `valid` splits them, and everything
that computes a score filters `where valid`. That's the same shape
`psychicnum.events` (`is_correct`) and `connections.events` (`result`) use.

**Why store rejects** (2026-08-02). Two reasons, both coop-shaped:

1. The rejection shows *locally*, so three players independently try the same
   non-word and nobody can see it happened. Cross-player memory is the part that
   can't be done client-side.
2. A recorded move is what lets a bad guess cost a turn.

**`reason`**, and the turn-cost split:

| reason | judged by | ends your turn? |
|---|---|---|
| `missing_base` / `too_short` | the server's own free guards | **yes** — a rules error |
| `not_a_word` | the FE, against the board's shipped `legal_words` | **no** |

A dictionary miss doesn't cost a go because the word list may be at fault, or it
was a typo — and taxing a reach for a long word is backwards in a game whose
whole incentive is reaching. **No reject spends budget** in either case: it can
cost your go, never one of the five guesses.

`submit_guess` takes **`p_fe_legal`** — the FE's dictionary verdict. Trusting it
is no weaker than trusting its accepts, which trusting-commit already does; the
server's own guards still run first and can reject a word the FE called legal.
The shared `useFoundWordSubmit` supplies this through its optional
`recordReject`, which only wordiply passes (spellingbee / wordwheel / boggle are
parallel word-searches where "whose non-word was that" is a question nobody
asks).

**Dedup runs first and counts invalid rows too.** A word already in the log
isn't a new turn, so re-submitting must not log twice, advance the turn, or
re-report the original guard's reason — `duplicate` *is* the "you already tried
that" answer, and it falls out of the existing `unique (game_id, user_id,
word)`.

**A board slot is a position among the ACCEPTED rows**, which is why a reject
occupies none: five slots, and only a valid word fills one. The log itself
orders by `id` and shows every row, rejects included — the board and the log
count different things on purpose.

**The log itself** is `GameEventLog` in the info column, using the shared
[`useEventLogPlayerPicker`](../../src/common/event-log/useEventLogPlayerPicker.tsx)
for the whose-guesses dropdown. Rejects show struck through with their reason
instead of a length, and aren't click-to-define (a lookup of a just-rejected
word dead-ends). Each row carries the `#N` history handle, and what makes it
worth having here is the rejects: an accepted word replays five slots you can
already see, but a reject is on no board at all, so opening its `#N` is the only
way to see the table as it stood when that word was tried.

## 7c. Printing the log (PDF)

`src/wordiply/pdf/` — a **"Print board (PDF)"** GamePage menu item, the eighth
game to print (common/pdf/doc.md). wordiply is the **event-log body family**,
and the first printer with **no board**: its five guess lines carry no state of
their own, so the page *is* the log and `drawEventLog` starts straight under the
header.

The split is deliberate. `model.ts` is pure — no jsPDF — and holds every
judgment; `printWordiplyPdf.ts` only draws. That's because the judgment is
mostly one rule worth a test: **the reveal rules have to hold on paper.**
Mid-game the page shows the guess count and nothing else — no length score, no
letter count, no longest word — exactly as the screen does. The longest word
goes further still: it prints only while the reveal toggle is open, so the paper
carries the answer only if the page in front of the printer does. The model
reads `gd` — the events, the players' own scores, the state line's track — and
`model.test.ts` pins the rule.

What prints:

| block | when |
|---|---|
| Header + one-line summary | always (guess count during play; scores once ended) |
| **Best possible word** | while it is revealed on screen |
| **Final scores** — per player, length score + letters, winner marked | compete once ended |
| The event log — **rejects included**, each with its reason | always |

Two details that fall out of the log carrying rejects:

- **Rows are numbered by their place in the printed list, not by anything
  stored.** A reject occupies no board row, and a printed wordiply has no board
  for the numbers to line up with anyway — `#3` means "the third thing that
  happened".
- **Accepted vs rejected reads in black and white** without a mark, because the
  text already says it (`HANGARS (7)` vs `ARQQQQQ — not a word`). psychicnum
  needs drawn ✓/✗ shapes because its meaning is color-only; this doesn't. Keep
  it that way.

In **compete** the log is sorted **by player (self first), then by time** rather
than interleaved chronologically — the tracks are parallel races, so a
time-ordered mix reads as nonsense. The `who` column labels each block, so one
table still does it. Mid-game compete needs no filter: the seat rule means
`gd.events` holds only your own rows.

## 8. Tests

**pgTAP** (`supabase/tests/wordiply/`, against a fixture board in `setup.psql`:
base `ar`, longest possible 7):
- `game_data_test` — the page blobs: a fresh coop game's `game_data` whole and
  both modes' fresh `summary_data`; mid-game coop — a reject in the log beside
  the accepted word, each player's own count, the team's, one board on every
  seat with no reject on it, no score before the end; mid-game compete — each
  racer's own count and board, the log carrying every racer's rows (the page
  withholds, not the builder); the endings — the team's and each player's own
  scores, the winner's length score on the summary, `shell_data` rewritten; a
  Restart; a rebuild of every game without re-dating it.
- `schema_test` — both gametypes registered; RLS enabled; every column granted
  (nothing column-hidden); `games_state` gone. The realtime-publication
  memberships are guarded centrally in `common/realtime_publication_test.sql`.
- `create_game_test` — the coop + compete happy paths (rows, gametypes, the
  page blobs at zero, title = just the uppercased base — no length leak); the
  guards: an outsider (42501), an **invalid positional `mode` arg**,
  `setup.target_rank`, compete `< 2` players, difficulty outside 1..6, malformed
  board (`base` not 2–4 lowercase letters, `max_word_len` below `base_len +
  2`, empty `longest_words` / empty `legal_words`), player count over 6.
- `gameplay_test` — `submit_guess` trusting-commit: a valid guess →
  `{result: 'accepted'}` alone + one row + the blobs; the **free server guards**
  (longer-than-base, contains-base, mode-aware dedup) reject **without spending
  budget**; dictionary legality is trusted from the FE (guesses in the test are
  synthetic non-words), so a non-word is a **Vitest** concern, not a pgTAP one;
  the 5-guess budget — **coop shared vs compete per-user**.
- `rls_test` — a member reads every row of both tables in both modes, mid-game
  or ended; an outsider reads none; direct inserts are refused. Direct-INSERT
  setup so the read policy is exercised in isolation.
- `try_base_test` — the board-build gate (wordiply's board-quality logic is SQL,
  not TS, so it's pinned here): `try_base` returns one board row iff the child
  count is in `[min, max]` (the **max** bound is the load-bearing one) and
  `max_word_len ≥ base_len + headroom`, zero rows otherwise; plus
  `candidate_bases`. Assertions are deliberately count-independent of the real
  dictionary.
- `turn_order_test` — the opt-in turn-by-turn coop wiring: `create_game` seats
  the rotation on `setup.coop_style = 'turns'`; an out-of-turn guess is
  rejected; an accepted guess advances the pointer, a soft-reject doesn't;
  free-for-all leaves it null.
- `winner_test` — compete winner by length score; **tiebreak letter count**,
  then the **earlier last word**, timed or not; first place `won`, second
  `near`; timeout resolves the formula.
- `ending_test` — the Stop in both modes (`stopped`, neutral); coop timeout
  (the one coop loss); `concede`, including the last racer's concede ending the
  race (`conceded`) rather than hanging it, and a fifth word as the last act
  (`resource_exhausted` / `complete`).
- `turn_order_test` also pins the **turn-cost split** (below): a structural
  reject ends the caller's go, a dictionary miss doesn't, and neither spends
  budget.
- `winner_test`'s last case is the **score-isolation regression** — rejects
  interleaved with accepted guesses, including one LONGER than every accepted
  word, which flips the compete winner if any `where valid` is missed. That's
  the failure mode the `valid` column creates, and it fails silently without
  this.
- `replay_test` — the dedicated replay suite (the shape every other replay game
  has). Deliberately overlaps `ending_test` §3's coop pass and adds what it
  doesn't reach: the **compete** branch (every player's ending, ranking and
  outcome cleared), `restart_count`, the shared clock zeroing, that the
  end-only scores are null again in the blobs, and the non-player rejection
  pinned to `42501`.

**Vitest**, beside the code:

| file | pins |
|---|---|
| `hooks/useGame.test` | `gd` from the blob — the links become players, rejects included in the log; each player's own track, the team's, the state line's pick; the scores arriving at the end; the seat rule mid-race and at its end; the memo on the blob |
| `lib/answer.test` | every answer's words and outcome, the split of a miss by whether the base is in it, the color a logged row wears |
| `lib/gameEndingMessage.test` · `lib/playerEndingMessage.test` | every ending's words and my outcome — coop's five words reading "Ended" in the win's color, the clock, a race won by me or by someone named, nobody scoring for each cause; a racer waiting or conceded |
| `lib/history.test` | the replay: a line per accepted word up to the row, a reject showing the board without it, the author's own board in compete |
| `lib/setup.test` · `lib/scoring.test` | the band and the starter's shape; the length-score formula |
| `components/DimmedBaseWord.test` | the base dimmed at its **first** occurrence (`ana` in `banana`), nothing dimmed before it is typed, in the data's case |
| `components/PlayArea.test` | the surface on the fixture: **5 lines always**; length-only during play; the end's score bar and the best word only when asked; every ending's verdict; confetti on my race win as it lands and never on coop's; the racer who is out (Back to club, Reveal grayed, the waiting line); the action row's order; the event log, a reject's `#N` replaying the board without it and a rival's replaying theirs; a teammate's word announced and mine not; the keys, submit and a recorded reject with `p_` names; New game, Stop, Concede, Restart and the menu |
| `components/SetupForm.test` | the form's settings and the refusals under the fields they name |
| `pdf/model.test` | the end-only rule on paper, the log with its rejects, compete's blocks by player, the scores block |

Playwright, in `e2e/`: `wordiply` (a word lands, a reject is logged and stays
off the board), `wordiply-mobile` (the board and keyboard fit, and the info
sheet works, at phone sizes) and `wordiply-print` (a real PDF downloads).

---

## 9. Reuse map (don't rebuild these)

- **Shell / lifecycle:** `<GamePage>`, `useCommonGame`, the manifest/registry +
  sibling pattern, `common.concede` / `_end_game` / timers / presence-pause
  (inherited).
- **Setup:** `<SetupGameModal>`, `<SetupSection>`, `<DictBandField>`,
  `<SetupTimerSection>`.
- **Entry + submit:** the shared **`shared/onscreen-keyboard/GuessKeyboard`**
  (the Wordle-style on-screen keyboard, shared with wordle) for touch input +
  **`useCaptureKeys`** for physical keys, both driving the same `word`. Submit
  reuses **`useFoundWordSubmit`** (shipped-list, trusting-commit) with a
  wordiply validator (points = the word's length). No `<WordEntryArea>` /
  `<WordEntryInput>` (that needs a physical keyboard).
- **Feedback:** `useFeedbackSlot` / `useShowPeerFeedback` / `<FeedbackPill>`.
- **Info column:** `<OpponentStrip>`, `<SetupDisclosure>`, `<TurnStatusLine>`,
  `<InfoActionsRow>`, the standard actions (`act-stop-game` / `act-concede` /
  `act-restart` from `useStandardGameActions`, plus the game's `act-new-game`
  and the shell's `act-back-to-club`), each placed as an `<ActionButton>`.
- **The ending:** `useShowEndingFeedback`, `useCelebration`,
  `buildGameEndedMessageNeutral` for a race's Stop.
- **RPC helpers:** `makeRpcDispatcher`, `runEdgeFn`.
- **Not applicable:** `WordList` (the board lines are the words).

---

## 10. Decisions

Every fork this game had is **resolved** (the last four ratified 2026-08-03).
Kept as a list rather than folded into the prose above because each one is a
real alternative someone will re-propose, and the answer is easier to defend
next to the thing it was chosen over. The chosen option is in **bold**.

1. **Brand name** — **resolved: "WordWire".** Lives only in the manifest `BRAND`
   const.
2. **Validation model** — **resolved: ship-list trusting-commit** (§2). Per the
   trust model we don't care about cheating, so the legal list ships to the FE
   (simpler build, reuses `useFoundWordSubmit`, no per-guess round-trip).
   Scores + longest word are hidden until the end as a *display* choice, not a
   security one.
3. **Letter-count tiebreak direction** — **resolved 2026-08-03: higher wins**
   (more/longer words = more wordplay). The alternative reading — lower =
   efficiency, "I got there with fewer letters" — loses because the game's whole
   scoring axis is *length*: the primary sort already rewards the longest single
   word, so rewarding brevity at the tiebreak would contradict the line above
   it. Step 2 of `_finish_compete`'s comparator, the one place the order lives.
4. **The last tiebreak** — **resolved 2026-09-27: the earlier last word**, in
   every game, timed or not. It always resolves — two words never land at the
   same instant — so there are no co-winners. The alternative, a seat-order
   tiebreak, breaks a tie on something arbitrary and invisible to the players.
   Step 3 of the same comparator.
5. **Coop budget** — **5 shared** (team fills one board, §6) vs 5-per-player.
   The shared choice is what makes the single five-row board coherent.
6. **Guess count** — **resolved 2026-08-03: fixed at 5**, a constant rather than
   a setup option. Five is the Guardian original's number and the board is built
   around it (five lines, the builder's `maxGuesses`); making it a knob would add a setup
   field, a `create_game` validator branch, and a variable-height board for a
   variation nobody has asked for. Expose it if someone does.
7. **Legal-band cleanliness** — **resolved 2026-08-03: exclude
   slang/slur/crude** (stricter than `candidate_words`' legal side) so a slur
   can't come back as the "best possible word" at the end. This is the one fork
   where the alternative is actively worse: the reveal puts that word on screen,
   unprompted, in front of the whole club. A change here regenerates boards (a
   filter in the builder + import), not schema.
8. **What ships to the FE** — **resolved: everything** (`legalWords`,
   `longestWords`, `maxWordLen` are in `game_data`'s puzzle from create). The
   scores are null in the blobs until the end, and the page draws the longest
   word only then, when asked (§2); the data itself isn't hidden.
9. ~~**PDF print**~~ — **resolved 2026-08-02: shipped.** See
   [Printing the log (PDF)](#7c-printing-the-log-pdf) below.
10. **Live readout** — **resolved: word length only during play**; length score
    %, letter count, and the longest word appear only at the end (§2). Compete
    opponents show just guesses used mid-game.

