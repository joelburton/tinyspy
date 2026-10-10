# wordsy — FlipWord

**Not scheduled.** Decided in outline (Joel, 2026-10-08); the process below
was written 2026-10-10 and waits on the rulings in [Proposed — not yet
ruled](#proposed--not-yet-ruled). Nothing is built and no branch exists. Brand
**FlipWord**, codename `wordsy` by the roster's rule that a folder carries the
original game's name. Starts compete-only; the two coop modes are in
[Later](#later).

Wordsy is Gil Hova's real-time word game (Formal Ferret 2017, Allplay 2025).
Eight consonant cards sit in four columns worth 5, 4, 3 and 2. Everyone writes
one word at once, using any letters at all; only the faceup letters score. The
first player to lock in flips a 30-second timer, and when it runs out every
word is revealed and scored. Seven rounds, keep your best five, add the
bonuses, highest total wins. The flip is the one act a player takes besides
writing, which is where the brand comes from.

## The rules, as the rulebook has them

The 2025 Allplay rulebook, with the 2017 edition and the designer's forum
answers where the 2025 book is silent. Nothing here is ours; the next section
says what the app changes.

**The deck.** 60 cards, no vowels. Common cards score their column alone;
rare cards add the bonus printed on them.

| kind | letters | copies | each |
|---|---|---|---|
| common (green) | B C D G L M N P R S T | 4 | 44 |
| rare red, +1 | F H K V W Y | 2 | 12 |
| rare blue, +2 | J Q X Z | 1 | 4 |

**Dealing.** Four point cards in a row, 5 4 3 2. Two faceup letters above
each, dealt right to left. The two rules of two: never more than two of the
same letter faceup, and never more than two rare cards faceup, red and blue
together; a third is discarded and redrawn.

**A round.** No turns. Everyone thinks and writes at once, changing their
word freely. Any player who is ready locks in and starts the timer; they are
the round's **Fastest Wordsmith** and may not change their word. Everyone else
has 30 seconds. When the timer runs out, everyone reveals and scores.

**Scoring a word.** Add the column values of the faceup letters the word
uses, plus the printed +1 or +2 on a rare card. Each card scores once: a word
with two Bs against one B card scores one B; a word with one C against two C
cards scores the higher-valued C. The word may be any length and use any
letter in the alphabet; letters not faceup score nothing.

**Bonuses.** Two, checked after scoring, worth more as the game goes on:

| rounds | you beat the Fastest Wordsmith (not tied) | you are the Fastest Wordsmith and tie or beat enough opponents |
|---|---|---|
| 1 to 3 | +1 | +2 |
| 4 to 6 | +2 | +3 |
| 7 | +3 | +4 |

"Enough opponents" is at least 3, or both in a 3-player game. The 2025 book
says nothing about 2 players; the 2017 rules say every opponent at 2 and 3
players (BGG Rules forum, August 2025). The two editions differ at 4 players:
2017 needs 2 of the 3 opponents, 2025 needs all 3.

**Word rules.** A correctly spelled dictionary word. No proper nouns,
hyphenated words, abbreviations, contractions, or words from another
language. An **original** word: nothing anyone scored in an earlier round, and
a change of only class, number, gender or tense is the same word (fish,
fishes, fishing, fishy are one word; fisherman and shellfish are others). Two
players revealing the same word in the same round both score it. Earlier
words are public and may be asked about at any time.

**Challenges.** Any player may challenge a word against an agreed reference.
A correct challenge scores the word 0; a wrong one marks a 2-point penalty on
the challenger.

**New round.** The Fastest Wordsmith takes the **No Flip** card and may not
start the timer next round (not at 2 players). The four letters in the 3 and
2 columns are discarded, the other four slide right into them, and four new
letters are dealt into the 5 and 4 columns. The next round starts the moment
the last card lands.

**Game end.** After seven rounds, cross out your two worst word scores and
add the best five, add every bonus, subtract every penalty. Highest wins; a
tie is shared.

**No-timer variant.** A random **First Wordsmith** at the start; everyone
takes as long as they need; the First Wordsmith stands in for the Fastest
when scoring. Each round the player with the fewest bonuses becomes the next
First Wordsmith, ties to the closest clockwise.

**Solo** is on the back of the No Flip card, which no source reproduces. The
2016 preview describes the version it was built from: the timer starts on the
middle spot of a three-spot track; a round of 15 or more while you paused the
timer earns a bonus, the better one if the timer sits on the top spot; a
round under 20 moves the timer down, and falling off the track costs a
penalty and resets it; a round of 20 or more while paused moves it to the
top. Win at 100, 110 or 120. The designer confirmed on BGG that the solo
timer gets its full time each round.

## What the app does with that

- **The server deals, holds, scores and marks.** It deals under the two rules
  of two, holds each player's word until the timer ends, scores it, and marks
  the bonuses. Nobody sees another player's word during a round; the reveal
  is the event log's rows for that round, every player's word with its score
  and bonus.
- **The 30-second timer is the header's timer**, started by the first
  submit. This is the first game to put anything but the whole-game timer
  there, and FlipWord offers no whole-game timer at setup. A player's word
  at the buzzer is the last one they submitted (decision 17).
  [The round timer](#the-round-timer--the-one-common-change) says how.
- **The flip is the bell.** There are no turns, so the one alert is "someone
  submitted, 30 seconds": the bell and flash every game with a turn carries.
- **Challenges and penalties disappear.** The server checks the dictionary
  ([docs/word-list.md](../docs/word-list.md), the may-enter tier at the band
  chosen at setup), so there is no reference to argue over and nothing to
  penalize. The player board's penalty row has no counterpart.
- **"Already scored" is the root word.** `common.words.root_word` is the
  lemma, so a word is refused when its root matches the root of anything
  scored in an earlier round. That is the rulebook's class, number, gender and
  tense rule, near enough: the list roots `fishes` and `fishing` to `fish`,
  and leaves `fishy` a word of its own.
- **A non-word is refused at the submit**, so the player can retype while
  the timer runs. The same for a word already scored.
- **The ending** ranks every player by best five plus bonuses; a tie is
  co-winners, as setgame's is.
- **The deck never runs out.** A card the rules of two refuse is skipped, not
  discarded: it stays in the deck in its place and is dealt when it fits.
  Seven rounds take 32 cards of 60, and with eight faceup no more than five
  letters can ever be blocked at once, so the skip walks past a few cards at
  most. (A discard pile would not do: with every blocked copy thrown away, a
  pathological deck can run through all 60 before round 7.)

## Decided — Joel's answers, 2026-10-08

1. **Compete only to start.** "i'm happy to start with compete, but i imagine
   we'll add a solo-coop mode later. and maybe even a team-coop (plays just
   like solo-coop, but any player can enter the word)."
2. **The 30-second round clock in the timer area, instead of a whole-game
   timer.** "we can use our time mechanism for that instead of whole-game
   timer. this will be our first game to use the timer area for anything
   other than whole-game timer."
3. **The no-timer variant is a setup choice.** "yes"
4. **Two players: tie or beat your one opponent**, from the 2017 rules via
   BGG. The 4-player threshold follows the 2025 book, all 3 opponents, since
   it is the edition in print (ruled 2026-10-10: decision 10).
5. **A non-word is refused, not scored 0.** "initially, we can refuse the
   word: otherwise, it feels to penalizing if they enter a band-5 word when
   playing a band-4 game." A setup option later, perhaps.
6. **Brand FlipWord.** "I'll take flipword"
7. **A non-word caught by the buzzer scores 0 and the log row says "invalid
   word".** Whatever is typed at the clock's end is scored; if it is not in
   the dictionary, that is the round's word and its score.
8. **The default band is 4.** The dictionary band is a setup choice as in
   the other word games; Wordsy rewards long, rare words (the rulebook's
   examples are QUIBBLES, BACCALAUREATES and LIQUEFACTION), so the default
   sits a step above the roster's usual.
9. **The code for [docs/features.md](../docs/features.md) is `FW`.**

Added 2026-10-10, answering the proposals below by number:

10. **Four players: the 2025 book, all 3 opponents.** "2025". So the Fastest
    needs `min(3, opponents)` opponents tied or beaten, at every count.
11. **The round timer is the common clock, re-armed each round.** "the
    common clock" — [The round timer](#the-round-timer--the-one-common-change).
12. **The typed word's score shows live.** "live"
13. **The gametype is `wordsy_compete`.** "wordsy-compete; we may make a coop
    version later"
14. **The title is the round: "Round 3 of 7"**, rewritten as each round is
    dealt.
15. **The setup keys are `legal_band` and `round_style`.** "ok"
16. **The round follows the rulebook: only the first submit is bound.**
    "follow rulebook". The first ↵ of a round starts the timer and freezes
    that player's word; everyone else may submit again until the timer runs
    out, and the round ends at zero, never early. The no-timer style, which
    has no zero, makes every ↵ final and ends the round when everyone still
    playing has submitted.
17. **A word counts only when submitted, and the last submit stands.** "we
    should make them press submit; just typing and not submitting isn't like
    our other games. but it sounds like #5 lets them submit multiple times
    and we only count last submit". No draft reaches the server; a player
    who never pressed ↵ has no word that round and scores 0. This amends
    decision 7: a submitted word was checked at the submit, so nothing
    invalid reaches the buzzer, and the log row for a player with no word
    reads "no word".
18. **The bell rings for everyone but the player who submitted first.**
    "everyone but the person who submitted the first word"
19. **No Flip leaves the game when two players are still playing.** "i'll
    take your rec" — the rulebook's reason (two players would only hand the
    flip back and forth) applies to the two left, not the roster.

## Proposed — not yet ruled

All settled, 2026-10-10: decisions 10–19 above. The list stays as the
record of the options.

Each is written the way the steps below build it; a different answer changes
the step it names. The first option is the recommendation.

1. **Four players** (open since 2026-10-08): the 2025 book's all 3 opponents,
   or the 2017 rules' 2 of 3? The editions agree at every other count, and
   one formula gives the 2025 book at every count: **the Fastest Wordsmith
   needs `min(3, opponents)` opponents tied or beaten**, where an opponent is
   another player still playing. Proposed: 2025, the edition in print.
2. **The round timer is `common.timers`, re-armed each round** (settled:
   decision 11). A submit that starts the timer sets the game's one clock to a 30-second countdown
   at zero; the round's end sets it back to `none`. The header shows it, the
   pause stops it, and `submit_timeout` fires at zero exactly as today, only
   for wordsy it ends the **round**. The cost is one common change, written up
   in [The round timer](#the-round-timer--the-one-common-change): the shell
   learns the timer's kind from the `common.timers` row instead of the frozen
   setup. The alternative is **a timer of the game's own**, a `timer_started_at`
   on the round that each client counts down from, shown by the game in a
   slot the header would have to grow; it would reinvent pause, the display
   and the expiry edge for one game.
3. **Only a submitted word counts, and the last submit stands** (settled:
   decision 17). The alternatives were a draft sent to the server as it is
   typed, so the buzzer scores whatever is in the box, and each client
   sending its box at zero.
4. **The bell rings for everyone but the first submitter** (settled:
   decision 18). The shared `useTurnStartFlash` is called with "the timer is
   running and I am not the Fastest Wordsmith": it rises at the first submit
   for everyone else, never for the submitter, and never on mount. Its
   docstring says a game calls it with `gd.me.onTurn`, so the sentence that
   admits a second caller is an edit to a blessed `board-marks` file
   (Joel's). The alternative was everyone, the submitter included.
5. **The round follows the rulebook** (settled: decision 16): the first
   submit is bound, every later one may be replaced until zero, and the round
   ends at zero. The alternative was every submit final and the round ending
   the moment everyone had submitted.
6. **The typed word's score shows under it as it is typed**: "DRAGON · 12".
   The table is public and the arithmetic is the rulebook's own, so the app
   does the sum the player would do on paper. The alternative is **no score
   until the reveal**.
7. **The gametype is `wordsy_compete`**, family `wordsy`, so the coop
   sibling in [Later](#later) lands beside it without renaming stored rows.
   bananagrams, the roster's other compete-only game, is bare `bananagrams`,
   and that is the alternative: **`wordsy`**, renamed if coop ever ships.
8. **The title is the round**, "Round 3 of 7", rewritten as each round is
   dealt (settled: decision 14; the identifier title was the alternative).
9. **The setup keys are `legal_band` and `round_style`** — the may-enter
   band under the roster's name for it, and `'timer' | 'no-timer'` in the
   shape of `coop_style: 'turns' | 'free-for-all'`. The alternative names
   wait on a better word for the second.
10. **The No Flip card leaves the game when two players are still playing**
    (settled: decision 19). The alternative was the roster's count.

## The game, in the app's terms

A card is a **tile** in code and a card in copy (setgame's rule). The eight
faceup tiles are **the table**, in eight **slots** left to right, top then
bottom: slots 1–2 under the 5, 3–4 under the 4, 5–6 under the 3, 7–8 under
the 2. A slot's value is its column's. A round's table is fixed once dealt.

**A tile** is its deck number, 1–60, and the number says its letter and kind:
1–44 are the common letters in order (B C D G L M N P R S T, four each),
45–56 the red ones (F H K V W Y, two each, +1), 57–60 the blue ones (J Q X Z,
+2). `wordsy._tile_letter(p_id)` and `_tile_bonus(p_id)` in SQL,
`lib/tiles.ts` in TypeScript, one test pinning the two on all 60.

**The deal.** The deck is one frozen shuffle of the 60 numbers, kept whole
(`games.deck`), and `games.drawn` is the numbers taken so far, in order. A
deal takes the first number in the deck not yet drawn whose tile keeps the
two rules of two against the tiles that will share the table with it — at
most two of a letter, at most two rare — and appends it to `drawn`. Round 1
deals eight into slots 8 down to 1 (the rulebook's right to left). A new round
moves slots 1–4 into 5–8 and deals four into slots 4 down to 1. Deterministic,
so Restart replays the same seven tables.

**Scoring a word** against a table: for each distinct letter in the word,
take as many of that letter's faceup tiles as the word has of it, the
highest-valued first, and add each tile's slot value plus its bonus. A letter
with no tile scores nothing. `wordsy._score_word(p_word, p_tiles)` and
`scoreWord` in `score.ts` under `lib/`, pinned against each other on the
rulebook's own examples.

**Round bonuses**, for round `r`: beat `b = 1 / 2 / 3` and fastest `f = 2 / 3
/ 4` for rounds 1–3 / 4–6 / 7. A player other than the Fastest whose score is
strictly above the Fastest's gets `b`. The Fastest gets `f` when the number of
opponents whose score is at or below theirs reaches `min(3, opponents)`
(decision 10), where the opponents are the other players still playing.

**A word is legal** when `common.words` has it at or below `legal_band`
(may-enter: no other filter) and **original** when its root —
`coalesce(root_word, word)` — matches no root among the valid words scored in
an earlier round, anyone's. The same word twice in one round scores twice.

**The round, step by step** (the `timer` style; decisions 16–18):

1. The table is dealt and the round is open. Everyone types; nothing
   reaches the server until ↵. Nobody has a timer.
2. The first submit that is not the No Flip holder's is checked (legal,
   original) and, if it stands, starts the timer: `rounds.fastest_user_id`,
   `timer_started_at`, the game's clock armed at 30 seconds (decision 11).
   That player's word is frozen. The bell rings for the others.
3. Every later submit is checked the same way and, if it stands, becomes
   that player's word for the round, replacing their earlier one. A refused
   word leaves the earlier one standing.
4. At zero every client fires `submit_timeout`; the first ends the round, the
   rest find it ended. Nothing ends a round early.
5. **Ending the round**: each player still playing is scored on their
   submitted word, or on no word — `''`, 0, logged "no word" (decision 17).
   Bonuses are marked. The events rows for the round are written. Round 7
   ends the game; otherwise the next round is dealt, the Fastest takes No
   Flip unless two players are still playing (decision 19), the clock goes
   back to `none`.

The `no-timer` style differs in three places: a **First Wordsmith** is named
when the round is dealt (round 1 at random; later the player still playing
with the fewest bonuses, ties to the next seat after the current one), every
submit is final, and the round ends when everyone still playing has
submitted. There is no No Flip card and no bell.

**The ending.** The seventh round's end is the game's: reason pair
`resource_exhausted` / `rounds_played`, ended by nobody (a timeout) or by the
last player to submit. Ranked by total — best five round scores plus every
bonus — with `rank()`, ties sharing, among the players who did not concede and
scored above zero. There is no whole-game timeout; Stop is `stopped`, neutral;
every player conceding is `conceded`, a loss for all.

**Concede.** A conceder keeps their rounds; later rounds have no row for them,
they are not an opponent for the bonus thresholds, and they are not ranked.
In the `no-timer` style a concede by the last player yet to submit ends the
round.

**Restart** rewinds to round 1 on the same deck: `drawn` emptied, the rounds
and events deleted, the clock to `none`, `common._reset_game`.

### The card

In [docs/win-lose.md](../docs/win-lose.md)'s terms, written for
[plans/game-cards.md](game-cards.md) in step 8:

- **goal**
  - `game-goal` — `goal-intrinsic`: the highest total
  - `goal-chosen` — none
  - `goal-progress` — total so far
  - `score-formula`
    - a word: each faceup letter it uses, column value, each card once; +1 red, +2 blue
    - bonuses by round: beat the Fastest +1/+2/+3; Fastest ties or beats enough opponents +2/+3/+4
    - at the end: best five rounds + every bonus
- **solving**
  - `solved` — n/a: nothing to complete
  - `perfect-play` — n/a
  - `author-solution` — none: nothing is hidden
- **winning and losing**
  - `ranked-by`
    1. the highest total
    2. `co-winners`
  - `loses-by` — `loses-by-none`
  - `announce-when` — `announce-when-ended`
  - `progress-shown` — `progress-shown-count`: total
- **ending**
  - `exhaustible-resource` — the seven rounds
  - `ends-when` — `ends-when-resource-exhausted`
  - `timeout-result` — n/a: no whole-game timer; the round timer ends a round
- **hints** — none

## The round timer — the one common change

Today the timer's kind is frozen at create: `useCommonGame` reads it from
`static_game_data.setup.timer`, and the `kind` and
`countdown_seconds_at_setup` on `common.timers` have no reader
([docs/common-schema.md → The game clock](../docs/common-schema.md#the-game-clock)).
Decision 11 gives them one:

- **`common._make_json_shell_data` carries `timer: {kind, seconds}`** off the
  `common.timers` row (`seconds` only for a countdown). Every game's builder
  already calls it after every move, so a game that changes its timer's kind
  mid-game rebuilds the shell and every client sees the new kind. No game but
  wordsy changes it, so no other game's page changes.
- **`useCommonGame` reads `timer.mode` from the shell**, not the static
  setup; `shell.ts` gains the key. `useGameTimer` is untouched but for one
  guard: **a change of `mode.kind` resets the local tick count** (the
  render-time "previous value" shape, not an effect), because `mergeTicks`
  keeps the higher of two counts and a stale response carrying last round's
  30 would land as an instant expiry on the new round's zero.
- **wordsy arms and disarms the row itself**: a submit that starts the
  timer writes `kind = 'countdown', countdown_seconds_at_setup = 30, ticks =
  0, last_tick = now()`; the round's end writes `kind = 'none',
  countdown_seconds_at_setup = null`. `common._create_game` still copies the
  setup's `timer`, so wordsy's setup carries `timer: {kind: 'none'}` as a
  fixed key the form never shows (`NOT_A_ROW` in
  `src/guards/setupRows.test.ts`: "fixed at none; FlipWord has no whole-game
  timer").
- **`submit_timeout` ends the round**, so `useSubmitTimeoutOnExpiry`'s and
  `Manifest.submitTimeout`'s docstrings say "ends the game, or whatever the
  game's countdown bounds" — wording, not behavior. `PauseAndClock` already
  hides a countdown once the game has ended and shows it while one runs.
- **A shape change needs every page rebuilt**: after the deploy, every
  schema's `_rebuild_data_cols_for_all()` on prod, so an open game's shell
  carries `timer`. Until then `useCommonGame` must not crash on a shell
  without it — the key is required in the type, and the rebuild is the
  deploy step that makes that true.
- **Blessed files touched**: `timer/useGameTimer.ts`,
  `game-page/useCommonGame.ts`, `game-page/shell.ts`; the stamps are Joel's.

This is step 1, its own commit, shippable before any wordsy code: pgTAP
`shell_data_test.sql` pins the key for all three kinds, `useCommonGame.test`
reads it from the shell, `useGameTimer.test` pins the reset on a kind change.

## Schema

Shape in `supabase/migrations/<ts>_wordsy.sql`, written fresh in the shape
of `20261007000005_wordleone.sql` (the gametype row, the clubs backfill
inlined); behavior in a `wordsy.sql` beside setgame's in `supabase/sql/`. The
frontend reads the page blobs and nothing else.

| | |
|---|---|
| `wordsy.games` | `game_id` pk → `common.games`, `deck smallint[]` (the frozen shuffle; **withheld** by the column grant — nothing shows it, as setgame's deck), `drawn smallint[]` (the numbers dealt, in order), `legal_band int check 1..6`, `round_style text check in ('timer', 'no-timer')` |
| `wordsy.rounds` | `(game_id, num)` pk, `num int check 1..7`, `tiles smallint[]` (eight, slot order), `fastest_user_id uuid` null until the first submit (the First Wordsmith from the deal in `no-timer`), `no_flip_user_id uuid` (the player who may not start this round's timer; null in round 1, in `no-timer`, and once two players are still playing), `timer_started_at timestamptz`, `ended_at timestamptz` |
| `wordsy.round_words` | `(game_id, num, user_id)` pk: `word text` (lowercase, `^[a-z]{1,45}$`), `submitted_at timestamptz`. The working table: each player's standing word for the round in play, replaced by a later submit; the Fastest's is the one that cannot be. Private until the round ends, when the reveal copies it to the log |
| `wordsy.players` | `(game_id, user_id)` pk. No counts: the totals are summed off the log by the builder |
| `wordsy.events` | the skeleton ([docs/supabase.md](../docs/supabase.md#every-games-log-is-gameevents)): `kind in ('word')`, `took_turn true`, plus `num int`, `word text` (`''` for a player who submitted nothing), `score int`, `bonus int`; one row per player still playing per finished round, written together at the round's end in seat order. Index `(game_id, id)` |

RLS on every table, club-gated selects as setgame's, no Realtime publication.
The gametype row `('wordsy_compete', 2, 'FlipWord')` and the clubs backfill
(compete off in a solo club).

### The page blobs

Written by `wordsy._rebuild_data_cols` at create, Restart, every submit, and
every round's end; `static_game_data` by
`_write_static_game_data`, the common part alone (there is no puzzle: the
table changes every round).

```
gd:                                       # the common part, plus
  nTilesInDeck                            # 60 − drawn
  rounds: [round, …]                      # every round dealt so far, the one in play last
  round                                   # same object as the last of rounds
  events                                  # [{id, userId, kind, num, word, score, bonus, tookTurn, at}]: every finished round's words; word '' for none
  players: [player, …]
  playersById
  me

round:
  num                                     # 1..7
  tiles: [tile × 8]                       # slot order
  tilesById
  fastest                                 # player | null: the Fastest (or First) Wordsmith
  noFlipHolder                            # player | null
  isTimerRunning                          # timer style, fastest set, not ended
  ended

tile:
  id                                      # the deck number, as text
  letter
  bonus                                   # 0 | 1 | 2
  slot                                    # 1..8
  value                                   # the slot's column: 5 5 4 4 3 3 2 2

player (GFacts, each the player's own in compete):
  total                                   # best five + bonuses, over the rounds finished so far
  nBonuses                                # how many bonuses, for the First Wordsmith rule
  roundScores: [int | null × 7]           # score + bonus per finished round; null for a round not played
  hasSubmitted                            # this round
  word                                    # this round's standing word: mine always; a rival's null until the round ends
  isWordFrozen                            # I am the round's Fastest: my word cannot change

summary_data (wordsy's part):
  team: null                              # compete only
  nRoundsPlayed
  winnerTotal                             # the total the winners share; null until the end
  legalBand
  roundStyle
```

`useGame` is `makeGameData(blob, auth.user.id)`: the links become players,
`tilesById` is built per round, and **the seat rule** withholds a rival's
`word` while the round is open — every seat's standing word is in the blob,
since one blob serves every seat, and the hook is where a rival's is dropped
(plans/seat-view.md → The security line is `useGame`). No `GTile`
pick: nobody acts on a tile, so the tile type is `GTile` by the four rules
and no hook ever holds one.

## RPCs

The `wordsy.sql` in `supabase/sql/`, in `supabase/sql/psychicnum.sql`'s layout
and `setgame.sql`'s shape (an inline shuffle, no edge function; a collective
`_finish`). Every parameter `p_`; codes from the next free number
`src/guards/raiseCodes.test.ts` prints.

| function | what it does |
|---|---|
| `create_game(p_club_handle, p_setup, p_player_user_ids, p_mode)` | the common gates (club member, cap 6, `_require_valid_mode`, compete ≥ 2, `_require_valid_timer` on the fixed `none`); `legal_band` 1..6 and `round_style` both required; refuses `coop` with a fault until a coop sibling exists; shuffles the deck, deals round 1 (and names the First Wordsmith in `no-timer`), `common._create_game(…, 'wordsy_' \|\| p_mode, …)`, the title "Round 1 of 7" (decision 14; `_deal_round` rewrites it each round), the rows, the blobs; answers `{result: 'created', id}` |
| `submit_word(p_game_id, p_word)` | the row lock, a player, game not over, not conceded, the round open; then the refusals a player meets: **frozen** (the caller is the round's Fastest, or any earlier submit in `no-timer`: a race, "Your word is in"), **not a word** at the band (validation under `word`, "Not a word at this dictionary"), **already played** (validation, "Already played: FISH" naming the earlier word), **No Flip** (validation, when nobody has submitted yet in a `timer` round and the caller holds it: "You hold No Flip — wait for someone else to submit"); then the word stands: the `round_words` row written or replaced; if first in a `timer` round, `fastest_user_id`, `timer_started_at`, the clock armed; in `no-timer`, `_end_round` once everyone still playing has submitted; rebuilds; answers `{result: 'submitted', timer_started, round_ended}` |
| `submit_timeout(p_game_id)` | the manifest's; the row lock, a player, game not over, the round open with its timer started (else the game-over race); `_end_round`; answers `{result: 'ended'}` |
| `concede` · `stop_game` · `replay_board` | the standard shapes (docs/common-schema.md); in `no-timer`, `concede` also ends the round when the conceder was the last yet to submit |
| `_tile_letter` · `_tile_bonus` · `_slot_value` · `_deal_tile` · `_deal_round` · `_score_word` · `_round_bonuses` · `_is_legal` · `_root_of` · `_is_original` · `_end_round` · `_arm_timer` · `_disarm_timer` · `_finish` | internals |
| `_make_json_tiles` · `_rounds` · `_events` · `_players` · `_game_data` · `_summary_data` · `_rebuild_data_cols` · `_write_static_game_data` · `_rebuild_data_cols_for_all` | the page blobs |

**`_end_round`** is one function `submit_timeout`, `submit_word` (in
`no-timer`) and `concede` (in `no-timer`) reach: scores every player still
playing on their standing word, `''` for none (every standing word was checked
at its submit, and no earlier round changes after it ends, so nothing is
re-checked here), marks bonuses by decision 10, inserts the events rows in
seat order, sets `rounds.ended_at`, disarms the timer, and then either
`_finish` (round 7) or `_deal_round` for the next with `no_flip_user_id` by
decision 19 or the next First Wordsmith.

**The lock order**: every RPC takes `wordsy.games` `for update` first, as
setgame's do, so two submits and the buzzer serialize, and the first submit
is the first to commit.

## Frontend

A folder `wordsy/` under `src/`, in psychicnum's shape (docs/playarea.md → The shape of a
game's PlayArea.tsx; plans/playarea-readability.md and
plans/component-readability.md read beside it): `types.ts` with every type
under `G`, `useGame` a pure function of the blob, `BoardCol` owning the move,
`InfoCol` arranging the shared pieces. Nearest siblings to copy from: setgame
(the hooks and the collective ending), the `<WordEntryArea>` games
(stackdown, letterboxed) for the typed word, wordiply for the log of words
with scores.

- **`PlayArea`**: `useGame`, `useGetEndingMessage` (from `lib/endingLabel.ts`:
  "Won", "Won (tied with bea)", "2nd", "Conceded"), `useTimerStartFlash` —
  the shared `useTurnStartFlash` called with `gd.round.isTimerRunning &&
  !gd.me.isWordFrozen` (decision 18), `useShowPeerSubmits` (the header's
  narration, "● bea submitted — 30 seconds", keyed on `round.fastest`),
  `useHistoryView`, `useActionsAndMenu` (Concede · Stop | Back to club; the
  menu adds Print and Restart).
- **`BoardCol`**: `Board` — four columns, each a value plaque over two
  tiles, the rare tiles in their colors with the bonus printed; below it
  `<WordEntryArea>` (A–Z capture, ⌫, ↵ = submit, ↑↓ recall), the score line
  (decision 12: "DRAGON · 12" as typed, and under it the standing word,
  "Your word: DRAGON · 12", or "Your word is in: DRAGON · 12" once frozen),
  the pill in the slot. Hooks: `useTypedWord` (the typed word, cleared on a
  submit that stands), `useSubmitWord` (the trip to `submit_word`, the
  answers through `lib/answer.ts`), `useBoardColActions`. The entry is
  `disabled` once my word is frozen, while a past round is open, and after
  the game ends. Lowercase in state; capitals at the draw.
- **`InfoCol`**, in the canonical order: `StateLine` ("Round 3 of 7 · 24
  pts", drawn in `MobileStatusBar` too), `OpponentStrip` (metric: the total;
  a cell says "in" after the number while the round is open and that player
  has submitted, the ending word once out), `InfoActionsRow` (Concede ·
  Stop), `SetupDisclosure`, `GameEventLog`: a separator row per finished
  round showing its eight tiles small with the round number and the
  Fastest's dot, then one `<tr>` per events row — `#N`, who, the word ("no
  word" in the warning bar when it is `''`), the score, the bonus as `+2`.
  `#N` opens that round's table on the board (`lib/history.ts`: a lookup of
  `rounds[num]`, as setgame's is).
- **`lib/`**: `tiles.ts` (number ↔ letter, bonus, kind; the rules of two,
  for the tests), `score.ts` (`scoreWord`, `roundBonuses`), `answer.ts`
  (every answer: `submitted` neutral "Your word is in", `not_a_word` lost,
  `already_played` warning, `no_flip` warning, `frozen` warning, `no_word`
  for a log row), `endingLabel.ts`, `history.ts`, `setup.ts`,
  `setupRows.ts`, `gameData.fixture.ts`.
- **`theme.css`**: the tile faces — `--wordsy-tile-common-color`,
  `-red-color`, `-blue-color` — and the value plaques; the two rare colors are
  the ones the deck prints, checked for separability as setgame's palette
  was. **`logo.svg`**: a card flipping.
- **`pdf/`**: the log and only the log, setgame's argument — per round the
  table and every word with its score, then the totals; a round's table is a
  shuffle nobody can play again.
- **`manifest.ts`**: `wordsy_compete` on family `wordsy` (decision 13),
  `numberOfPlayers [2, 6]`, `draftsOffTurn false`, `scratchpad
  'perPlayerInCompete'`, `summaryFor` reading `winnerTotal` and the ending.
- **Mobile**: the eight tiles fit a phone's width in two rows of four; the
  status bar carries the state line.

## Setup

| control | values | note |
|---|---|---|
| players | 2–6 | compete only |
| `legal_band` | 1–6, default 4 | `DictBandField`, any word length (decision 8) |
| `round_style` | `timer` (default) · `no-timer` | a `RadioRow`; the summary reads "Round: 30-second timer" / "Round: no timer" |
| `timer` | fixed `{kind: 'none'}` | never shown; `NOT_A_ROW` |

The summary line shows the band in the `dict "…"` slot every band-sensitive
game uses, and the round style beside it.

## Later

- **Solo-coop**: the solo card's chase of 100, 110 or 120 with the pause
  mechanic, played by one person. Needs the 2025 card's actual text, or the
  2016 version above if the card never surfaces.
- **Team-coop**: the same chase, any player may enter the word.
- **Scoring a non-word as 0** as a setup option, the rulebook's way.

## Steps

Each step ends at a stop: the work sits in the working tree for Joel to read,
and the next step waits for his go. Step 1 is common and ships on its own;
the rest are the game, in dependency order.

### Step 0 — the rulings

Done 2026-10-10: every proposal is a decision (10–19). Nothing gates step 1.

### Step 1 — the round timer in the shell (common)

[The round timer](#the-round-timer--the-one-common-change), whole: the
shell key, `useCommonGame` on it, the tick reset on a kind change, the
docstrings, pgTAP and vitest. docs/common-schema.md → The game clock says the
copies now have a reader; `common/timer/doc.md` and `common/game-page/doc.md`
follow.

**Done when:** `gmake test-db`, `npx vitest run src/common`, the guards and
`npx tsc -b` are green, and a wordle game on the local stack shows its timer
as before. Deployable alone; after its deploy, every schema's
`_rebuild_data_cols_for_all()` on prod.

### Step 2 — the shape: one migration

[Schema](#schema), in `20261007000005_wordleone.sql`'s shape.

**Done when:** it applies locally (`gmake db-schema ENV=local` resets the
local database — ask before using it) and `select * from
common.clubs_gametypes where gametype = 'wordsy_compete'` has a row for every
club, off in the solo ones.

### Step 3 — the behavior: `wordsy.sql`

[RPCs](#rpcs) and [The page blobs](#the-page-blobs). The header lists the
seven callable functions and what is particular: the deck as numbers, the
skip-not-discard deal, the round's two ends, the one clock re-armed, the
last submit that stands and the first that is frozen.

**Done when:** `gmake db-sql ENV=local` applies cleanly and step 4 is green.

### Step 4 — pgTAP: a `wordsy/` folder under `supabase/tests/`

A `setup.psql` whose `pg_temp.wordsy_game()` creates a game and then
**plants a known deck** by updating `wordsy.games.deck` and re-dealing round
1 through the real `_deal_round`, so every test knows the table.

| file | pins |
|---|---|
| `tiles_test.sql` | all 60 numbers map to the rulebook's deck: 44 common, 12 red, 4 blue, the letters in order |
| `deal_test.sql` | the rules of two on a planted deck that breaks each; a skipped tile dealt later when it fits; the slide 1–4 → 5–8; a deck whose next 20 tiles are all blocked still deals (the skip); Restart replays the same seven tables |
| `score_test.sql` | the rulebook's examples: two Bs against one B card, one C against two C cards, a rare card's bonus, a letter with no tile, the word `''` |
| `create_game_test.sql` | the envelope and the rows; `select deck` throws; the setup faults (band, style, mode coop, a solo game); PN510 for a caller not among the players |
| `gameplay_test.sql` | a submit of a non-word and of an already-played root refused with their words, the earlier word left standing; No Flip refused for the holder while nobody has submitted, allowed after; the first submit arms the clock (`common.timers` kind, seconds, ticks 0) and freezes that word (a second submit by the Fastest refused); a later player's second submit replaces their first; the last submit does not end the round; `submit_timeout` ends it; the reveal rows, in seat order; a player with no row scored `''` 0 |
| `bonus_test.sql` | every row of the table at 2, 3, 4, 5 and 6 players, the ties, the "enough opponents" threshold at each count (decision 10), a conceder not an opponent; No Flip gone once two are still playing (decision 19) |
| `no_timer_test.sql` | the First Wordsmith at random in round 1, the fewest-bonuses rule with its tie-break after, no clock ever armed, every submit final, the round ending on the last submit and on a concede by the last yet to submit |
| `finish_test.sql` | round 7's end ranks by best five plus bonuses; a tie shares rank 1; a conceder unranked; the reason pair; `winnerTotal` |
| `concede_test.sql` · `stop_game_test.sql` · `replay_test.sql` | the standard three; in `no-timer`, a concede by the last yet to submit ends the round |
| `game_data_test.sql` · `rebuild_data_cols_test.sql` | the blobs whole: a fresh game, mid-round with a frozen word and standing words on every seat, after a reveal, the ending; the static blob the common part alone |

The common tests that list every game — `events_skeleton_test.sql`,
`function_grants_test.sql`, `function_overloads_test.sql`,
`clubs_gametypes_test.sql`, `fk_delete_rules_test.sql` — and
`supabase/scripts/rehearse-migration.sh` name it. Every new test is verified
by planting its bug.

**Done when:** `gmake test-db` is green.

### Step 5 — the frontend: a `wordsy/` folder under `src/`

[Frontend](#frontend), every file stamped `cs-unmet`. Tests beside each, from
the siblings': `lib/tiles.test`, `lib/score.test` (the same examples as the
pgTAP, so the two implementations are pinned to one list), `lib/answer.test`,
`lib/endingLabel.test` (every ending in the one mode, ties named),
`lib/history.test`, `hooks/useGame.test` (the links, `tilesById`, the seat
rule on a rival's word, `round` the last of `rounds`, `isWordFrozen` for the
Fastest alone), `components/PlayArea.test` (typing and ↵ submit through the
dispatcher; a refused word's pill and the typed word kept; a second submit
replacing the first; the entry disabled once frozen and over a past round;
the bell's boolean false for the Fastest; the log's rows and the no-word bar;
Concede and Stop through the dispatcher), `components/SetupForm.test`.

**Done when:** `npx tsc -b`, eslint and vitest over the folder are green, and
a game plays through seven rounds on the local stack with two browsers.

### Step 6 — the lists

Done with step 5, which cannot lint or type-check without them:
`src/gametypes.ts`, `src/types/db.ts` regenerated (its `// cs-na` stamp put
back on line 1), `gameTypes.test.ts`'s `CONVERTED_GAMES`,
`gameSummaries.test.ts`'s `wordsy` entry, `setupRows.test.ts`'s `NOT_A_ROW`
for `timer`; `supabase/config.toml`, `supabase/deploy/env.sh` and the
Makefile's `BACKUP_SCHEMAS` (`deployLists.test.ts` keeps them in step; the
local stack reads `config.toml` only on `supabase stop && supabase start`);
`concedeLock` and `endLock` read the new SQL.

### Step 7 — e2e

Ask before running any of it.

- `e2e/helpers/fixtures.ts`: `createWordsyGame` (through `create_game`, then
  the planted deck the pgTAP setup uses, so a spec knows the table),
  `submitWordsyWord`, `endWordsyRound`.
- A `wordsy.ts` beside `e2e/gallery/games/setgame.ts` (fresh; mid-round with
  the timer running; after a reveal; ended, won and tied) and its two
  registrations in `e2e/gallery/run.ts` and `e2e/gallery/moveBytes.ts`.
- The rosters: `e2e/events-realtime.e2e.ts`, `e2e/restart-resets.e2e.ts`.
- New specs: `wordsy-round` (two clients: a submit starts the timer on
  both, the bell's frame on the other client only, the other client replaces
  its word, the reveal lands on both), `wordsy-history`, `wordsy-print`,
  `wordsy-mobile`.

**Done when:** those specs and the gallery cells pass, run one by one on
Joel's go.

### Step 8 — the docs

- The folder's `doc.md` in wordleone's headings (Intro to area · Game rules ·
  Schema · RPCs · FE submissions · Frontend · Tests), taking this plan's
  rules and the deal; its `todo.md` with the five sections.
- The card in `plans/game-cards.md`, as [drafted above](#the-card).
- `CLAUDE.md` (a game-doc row; "Seventeen" → "Eighteen" and the roster),
  `README.md`, `docs/features.md` (code `FW`, decision 9; every dimension
  and tag: compete only, 2–6, server-built board, the board changes each
  round, typed input, no solution, the timer row gains the round timer),
  `docs/naming.md` (the codename and brand tables), `docs/common-schema.md`
  (step 1's), `src/common/pdf/doc.md`, `docs/supabase.md`, and the count
  words.

**Done when:** the guards are green (links, prose paths, spelling).

### Step 9 — prod

On Joel's go: `gmake db-schema-sql ENV=prod` first, so the schema exists,
then `gmake project-config-api ENV=prod` to expose it, then `gmake deploy
ENV=prod`. A backup first. Then one game on prod with a friend.

### Step 10 — close the plan

What this plan knows that the game's `doc.md` doesn't moves there; the
plan and its `CLAUDE.md` row go.

## Reference

- [Allplay rulebook PDF](https://assets.allplay.com/board-games-wordsy-rulebook-link.pdf)
  (2025 edition; the player board on page 2 carries the bonus table).
- [RulesPal's transcription](https://rulespal.com/wordsy/rulebook).
- [BGG Rules forum: "Bonuses at 2 players"](https://boardgamegeek.com/thread/3556885),
  [same word in the same round](https://boardgamegeek.com/thread/2912845),
  [spelling](https://boardgamegeek.com/thread/1989520),
  [solo timer](https://boardgamegeek.com/thread/2449422).
- [What's Eric Playing preview, 2016](https://whatsericplaying.com/2016/10/30/wordsy/)
  (the solo rules and the per-player-count thresholds of the 2017 edition).
- [BoardGameGeek](https://boardgamegeek.com/boardgame/208480/wordsy).
