# wordwheel

Nine letters on a wheel, one of them the center, and every word of four letters
or more you can spell from them that uses the center — each tile once per word,
so a letter can be used only as many times as there are tiles carrying it. A
word using all nine tiles is a pangram. Coop pools one found list and climbs a
rank ladder together; compete races everyone on the same wheel, each with a
private list, to a rank chosen at setup. Brand **MooseWheel**.

## Intro to area

The wheel is a multiset. Where spellingbee's hive is seven distinct letters, any
of them reusable, the wheel's nine tiles may repeat a letter — two E tiles, two
N tiles — and a word spends one tile per letter it uses. That one rule is most
of what separates this game from the one it was forked from: the board builder
drops every word that would need more of a letter than the wheel has, the
frontend refuses to submit a word it cannot spell from the tiles, and the tiles
a word spends are marked as it is typed. With spending in place an S is
ordinary, so this game has no S rule, and a pangram is simply a nine-letter word
that fits.

The frontend knows the answer key. Both word lists — the required words that
make up the goal and the bonus words beyond them — ship to every client the
moment the game loads, so a typed word is judged where it is typed: too short,
already found, the center letter missing, not a word. None of those reaches the
server. Only an accepted word does, and it arrives already scored; `submit_word`
trusts the word and its points, checks that the game is still on and the word
is not a duplicate, records the row, re-sums the score and decides whether that
word ended the game.

The board is built outside the database. Starting a game does not call
`create_game` directly: the frontend calls the `wordwheel-build-board` edge
function, which chooses the nine letters in Deno — from a pool of nine-letter
seeds, or from letters the player typed — asks the database for every word
those letters admit, keeps the ones the tiles can spell, scores and partitions
them, and only then calls `create_game` with the finished board. What the
frontend gets back is `create_game`'s own envelope, relayed untouched.

What separates the two modes is whose list a word lands on, exactly as in
spellingbee. Coop is one found list, the team's score, and a game that runs
until the clock or the Stop button stops it — or, when the team set a target
rank, until they reach it together. Compete is a race to a target rank on
private lists: an opponent's finds stay hidden until the game is over, so all a
racer learns about a rival mid-game is the rank they have reached, and the
first to the target ends the race for everyone.

The end of a game is on the board. No modal carries the verdict: the
below-board pill says it, the action row's line repeats it, and the word list
fills in every word nobody found — the bonus words too, being the same shipped
data. The wheel stays on screen, inert, with Shuffle still live, and Restart
replays the same letters from an empty list. A coop team that set a target
celebrates once, at the moment they cross it, and so does a race's winner.

## Game rules

A **wheel** of nine tiles: one **center** and eight **outer**. The wheel is a
multiset — the same letter may sit on two tiles, and the center may repeat an
outer. A word counts when it is four letters or more, spelled from the tiles
with each tile used at most once, includes the center, and is in the board's
**legal list**. A **pangram** is a word that uses all nine tiles, which is any
nine-letter word that fits. Every random board has at least one, and it is a
required word, since a board is grown from a nine-letter seed gettable at the
required band; a board built from letters the player chose need not have one.
There is no S rule: a tile is spent per use, so an S pluralizes at most once
per S tile.

Scoring: a four-letter word is one point, a longer word scores its length, and
a pangram adds fifteen. The **required words** are the goal — their count and
their total are the `X / Y` denominators on screen — and the **bonus words**
are the rest of the legal list: accepted and scored exactly the same, but not
part of the goal, so a player who finds them can pass the displayed maximum.
Which words fall on which side is set at creation by two dictionary bands: a
word is required at or below the **required band** when it is also American,
not slang and clean; it is legal at or below the **legal band** with no further
condition. So even at equal bands the bonus list holds the words the clean
filter removed, and they are shown and revealed like any bonus word.

The **rank ladder** runs Start → Good → Solid → Nice → Great → Amazing →
Genius, evenly spaced up to Genius at 70% of the required total; a score past
that clamps at Genius. `common._rank_idx` decides it on the server, in
integer math, and the page draws the index the blob carries.

### Vocabulary

| term | what it means |
|---|---|
| **wheel** · **center** · **outer** | the nine tiles: `center_letter` and the eight-character `outer_letters`, stored lowercase, repeats allowed; the frontend shuffles the outer eight for display only |
| **tile** | one seat on the wheel, spent once per word. A letter on two tiles may be used twice, and which tile a use spends is the board's to decide (`lib/spend.ts`) |
| **pangram** | a word that uses all nine tiles — any nine-letter word that fits. `+15`, bold in the list, and the seed every random board is grown from |
| **seed** | a row of `wordwheel.pangrams`: the sorted letters of a nine-letter word, tagged with the lowest band at which a required-quality word spells them |
| **required word** · **bonus word** | the goal and the rest of the legal list, split by the two bands at creation; each shipped as `{ word, points, is_pangram }` |
| **required band** · **legal band** | `setup.required_band` (1–6, default 3) and `setup.legal_band` (required–6, default 5), the dictionary difficulty each list is drawn at |
| **found word** | a row in `wordwheel.found_words`: who, which word, its points and flags. The team's in coop, each racer's own in compete |
| **rank** | where a score stands on the ladder, 0–6. The team's in coop; each racer's own in compete, and the one thing rivals can see. (connections uses the word for a category's difficulty; the scope tells them apart) |
| **target rank** | `wordwheel.games.target_rank`, copied from `setup.target_rank` at create: compete's finish line, always set; coop's optional win, null for the open-ended hunt |
| **custom letters** | `setup.custom_center` + `setup.custom_letters`, a board the player chose instead of a sampled one. A one-off: never saved as the club's next default |
| **unique letters** | `setup.unique_letters`: sample only a wheel whose nine tiles all differ. A constraint on a random board, ignored when the letters are the player's own, and saved with the rest of the setup |

### Coop

One found list, one score. A word is anyone's to find and, once found, is
found for the whole team — a second player typing it gets *already found*.
The team's rank climbs as the score does, and the game ends three ways: the
countdown expires, somebody presses Stop, or — when the team chose a target
rank at setup — the word that carries them to it wins. There is no end at
100%: a team that clears the required list keeps finding bonus words, and the
counter overshoots. The clock running out is a loss only when there was a
target to miss; with none, it is a game with no result. Stop is neutral either
way.

### Compete

The same wheel, raced on private lists. Each racer has their own found words,
score and rank, and finding a word another racer already has is a fresh point.
What a racer learns about a rival mid-game is their rank, on the Rank strip,
and whether they have dropped out — never a word, which the row policy
withholds until the game ends and then opens for the post-game read.

The first racer whose rank reaches the target ends the race for everyone: they
alone are ranked 1, since the race ends when decided and the rest are short of
the goal. A conceder is out while the others race on and can submit nothing
more, so they cannot reach the target; every racer conceding is a collective
loss, written by `common._concede`. The countdown expiring before anyone reaches the target is a
loss for the table, since there was a rank to reach; Stop is neutral in a race
too.

Compete needs an opposing **player**, which is why its manifest takes 2–6
where coop takes 1–6. `create_game` checks both ends: a race with fewer than
two players is a fault, and so is a roster of more than six.

### How a game ends

The ending is `common.games`' reason, detail and outcome
([docs/win-lose.md](../../docs/win-lose.md)):

| when | reason / detail | coop | compete |
|---|---|---|---|
| the target rank reached | `reached_goal` / `target` | the team ranked 1, won | the racer who reached it ranked 1; the rest lost |
| the clock, with a target | `timeout` | nobody ranked, lost | nobody ranked, lost |
| the clock, with no target (coop) | `timeout` | no result, neutral | — |
| every racer conceded | `conceded` | — | nobody ranked, lost |
| somebody pressed Stop | `stopped` | neutral | neutral |

The word that reaches the target is who ended the game; a timeout is ended by
nobody.

## Schema

Three tables, in `supabase/migrations/20260712000000_wordwheel.sql`
(shape) and `supabase/sql/wordwheel.sql` (behavior).

| | |
|---|---|
| `wordwheel.pangrams` | the board-seed pool: one row per nine-letter multiset spelled by a word in `common.words`, keyed by its sorted letters, with its distinct-letter mask (generated), the lowest band at which a required-quality word spells it, how many required words fit it at each band, and whether it holds a rare letter. Public reference data, rebuilt by `gmake g-wordwheel-pangrams` after `gmake all-words` |
| `wordwheel.games` | one row per game, keyed `game_id`: the nine letters, both word lists as jsonb arrays of `{ word, points, is_pangram }`, the required list's score and count, cached so a submit need not re-sum the list, and three setup values copied at create — `target_rank` (null for none), `required_band` and `legal_band`. The mode and the club are `common.games`' |
| `wordwheel.found_words` | one row per `(game, player, word)`, with `points`, `is_pangram`, `is_bonus` and `found_at`. The game's only working state |

**Nothing is hidden from a client.** Both word lists are in the column grant
and the `game_data` blob carries them from the first read; the frontend judges every word
against them and the missed-words reveal is computed on the client once the
game has ended. The trust model does not withhold an answer key from friends
(CLAUDE.md → Trust model).

**The seed pool scales with the band.** A seed's tag is the lowest band at
which a required-quality word spells its nine letters, and the edge function
samples only seeds tagged at or below the game's required band, so a harder
game draws from a bigger pool. The mask is a set, so it serves the two
set-semantics readers — the overlap cap and `candidate_words`' subset test —
while the sorted letters carry the multiset the tiles are dealt from.

**Both tables need only the membership gate.** Who may see a rival's finds
mid-race is the page's rule — the hook's seat rule over `game_data`, which
withholds a rival's rows until the race ends — and nothing reads the tables
from the client, so the policies carry no mode arm.

**The page blobs** are written by `wordwheel._rebuild_data_cols` at create, at
Restart and at the end of every move and ending, each assigned whole
([plans/seat-view.md](../../plans/seat-view.md) → The page is written, not
assembled): `shell_data` through `common._make_json_shell_data`, and on top of
the common part of every `game_data` (`common._make_json_game_data`) this
game's own, the same shape as the other bee game's
([shared/bee-games](../shared/bee-games/doc.md)):

| blob | wordwheel's part |
|---|---|
| `game_data` | `puzzle: {tiles, centerLetter, outerLetters, words, nReqdWords, reqdWordsScore}`, as `create_game` froze it — a tile being `{id, letter, center}` with its place as its id and the center first, and every legal word `{word, points, pangram, bonus}`, the required ones first; `team: {nFoundWords, foundWordsScore, rankIdx, targetRankIdx}`, what the team shares and the rank it set out for, null in compete; `foundWords`, every find `{userId, word, points, pangram, bonus, at}` in the order found; on each player their own `nFoundWords`, `foundWordsScore` and `rankIdx`, and `targetRankIdx`, the same on every player |
| `summary_data` | `team`, the same group; `nReqdWords`, `reqdWordsScore`, `targetRankIdx` |

**The club-list title is the board**, `<CENTER>·<OUTER-SORTED>` — `D·AEEGINNR`
— written once at creation and never changed, so one board reads one way in
the club's history whatever the local shuffle. A repeated letter sorts beside
its twin, so the title is the multiset.

**The client reads nothing from these tables.** The page is handed the blobs
off `common.games` and re-reads them as the shell delivers each rewrite, and
every move and ending rewrites them. The found rows are the server's working
state; who may see a rival's mid-race is the hook's seat rule over the blob.

## RPCs

Everything the player does reaches the server through one of these, and every
one answers [the envelope](../../docs/envelopes.md). The examples below are
what `data` carries on an `ok`; `result` names the answer, and a call site
picks its branch by that word and nothing else. One of them is not an RPC at
all — the edge function that stands in front of `create_game` — and it is
listed first because it is what starting a game actually calls.

### `wordwheel-build-board` — the edge function in front of `create_game`

Builds a board and creates the game in one round trip. The manifest's
`startGameInClub` and the play surface's New game both call it; nothing in the
frontend calls `create_game` itself. It runs as the caller, so every read it
makes is under the caller's own row-level policies.

With no custom letters, it samples. It reads the seeds in
`wordwheel.pangrams` — the letter multisets of nine-letter words — keeping only
those whose word is gettable at the game's required band, so a harder game
draws from a bigger pool; with *unique letters only* set, it keeps only seeds
whose nine letters all differ. It drops any seed sharing more than five
distinct letters with the club's most recent board, weights the rest three to
one toward seeds holding a rare letter, draws one, and tries its distinct
letters as the center in random order until one yields at least fifteen
required words, drawing another seed if none does. With custom letters — a
center and eight others, any lowercase letters, repeats allowed — it skips all
of that and builds from exactly those letters, and any number of required
words above zero will do.

Either way the words come from `wordwheel.candidate_words`, a plain SQL
function that returns every dictionary word of four letters or more, at or
below the game's legal band, whose letters are among the wheel's and include
the center, flagging each as required (at or below the required band,
American, not slang, clean) or not. That is a letter SET test, so it still
returns words that need more of a letter than the wheel has tiles; the edge
function drops those. It scores the rest — one point for four letters,
otherwise the length, plus fifteen for a pangram — partitions them into
`required_words` and `bonus_words`, totals the required set, and hands the
board to `create_game`.

**Passed:**

```json
{
  "p_club_handle": "moths",
  "setup": {
    "target_rank": 5,
    "required_band": 3,
    "legal_band": 5,
    "timer": { "kind": "countdown", "seconds": 600 },
    "custom_center": "d",
    "custom_letters": "aeeginnr"
  },
  "player_user_ids": ["7b1e…", "c904…"],
  "mode": "compete"
}
```

`custom_center` and `custom_letters` are optional and go together;
`unique_letters` is optional and applies only to a sampled board;
`required_band` and `legal_band` default to 3 and 5. `mode` is a field of the body, not of the
setup.

**Returned:** exactly what `create_game` returns, below. Five refusals are
this function's own and are part of the story, because whether a board EXISTS
at those settings is something the setup dialog cannot know from the values
alone: letters that admit no required word come back under the letters field;
a required band with no seeds at all, or none that clears fifteen words, comes
back under the band; *unique letters only* emptying the pool comes back under
that option; and the club's last board ruling out every seed the settings left
comes back on the form's own line, asking for the settings to be relaxed.

### `wordwheel.create_game(p_club_handle, p_setup, p_player_user_ids, p_mode, p_board)`

Records a board the edge function built. It checks the setup — a target rank
of 0 to 6, required in compete and optional in coop; a required band of 1 to 6
and a legal band from there to 6; the timer — and the board's shape: eight
lowercase outer letters and a lowercase center, repeats allowed and the center
free to repeat an outer, both word lists present, and at least fifteen
required words, or at least one when the letters were the player's own. It
titles the game after its letters, the center first and the outer eight
alphabetized — `D·AEEGINNR` — writes the `common.games` row and the
`wordwheel.games` row holding the letters, both lists, the target and the
two bands, and writes the page blobs. The setup is saved as the club's next default with the
custom letters stripped, so the next game's dialog opens on a random board.
Either mode takes up to six players and a race needs two; the server checks
both.

**Passed:** the edge function's body plus `board`:

```json
{
  "board": {
    "outer_letters": "aeeginnr",
    "center_letter": "d",
    "required_words_score": 401,
    "required_words_count": 83,
    "required_words": [ { "word": "endearing", "points": 24, "is_pangram": true }, … ],
    "bonus_words":    [ { "word": "dene", "points": 1, "is_pangram": false }, … ]
  }
}
```

**Returned** — one answer:

```json
{ "result": "created", "id": "3f2a…" }
```

### `wordwheel.submit_word(p_game_id, p_word, p_points, p_is_pangram, p_is_bonus)`

The only mid-game move, and a trusting submit: the word arrives already judged
and scored by the frontend, and the server does not re-check its letters, its
tiles, its length or the dictionary. What it does check, under a lock on the
game row, is that the game still exists, hasn't ended and the caller has
not conceded — a word in flight when any of those changed is a race, a deleted
game answering with the shared *"That game was already deleted"* — and that
the word is not already found under this mode's rule: anyone's in coop, the
caller's own in compete. A duplicate is also a race, since the frontend dedups
first and reaching the server means its list was stale; the server writes the
whole line for that one so the two routes to it read alike.

An accepted word is written to `found_words` with its points and flags. When
the game has a target rank and this word carries the team's score (coop) or
the caller's (compete) to it, the game ends `reached_goal` / `target`: the team
ranked 1, or the caller alone. Either way the page blobs are rewritten. **The answer is about the caller's word and never
about anyone else's**: the ending reaches every client with the rewritten blob, and the
reply only names this word's kind.

**Passed:** `{ "p_game_id": "3f2a…", "p_word": "endearing", "p_points": 24,
"p_is_pangram": true, "p_is_bonus": false }`

**Returned.** Four shapes, all meaning the row landed; `points` echoes what was
sent. The first three are the caller's own flags read back, the fourth takes
precedence over them:

- an ordinary required word — `{ "result": "accepted", "points": 6 }`
- a bonus word — `{ "result": "bonus", "points": 1 }`
- a pangram, required or bonus — `{ "result": "pangram", "points": 24 }`
- the word that reached the target rank and ended the game — `{ "result": "won", "points": 24 }`

None carries an outcome or a message, and the frontend reads none of the four
for their own sake: the pill was shown before the call went out, and any `ok`
leaves it standing.

### The rest

`concede`, `stop_game`, `submit_timeout` and `replay_board` — the common shape
every game has, doing here what they do everywhere. What is this game's:
`stop_game` goes through `common._stop`, neutral in both modes, since friends
agreeing to stop is not losing; `submit_timeout` is a loss wherever there was a
rank to reach — a coop game that set a target, and always a race — and a game
with no result only in the open-ended coop hunt; `concede` is refused outside
compete and decided by `common._concede`, and a conceder's words are refused
from then on, so they cannot reach the target; and `replay_board` clears every
found word and resets the ending, the target carried over on the row, so the
same letters are played again from nothing.

## FE submissions

What the frontend decides before a word reaches the server, and what it says
about the answers that come back.

**A word the tiles cannot spell is never submitted.** A letter that is on no
tile, or used more times than the wheel has tiles for it, is dimmed in the
typed word, and Submit and Enter do nothing until it is gone — `DINNER` spends
both N tiles and can go, `DARED` wants two D tiles from a wheel with one and
cannot. It gets no answer, because the typed word already shows what is wrong.

**Everything else about legality is decided here too, and never reaches the
server.** The puzzle's words — `gd.puzzle.words`, required and bonus alike — indexed by
word in `hooks/useSubmitWord.ts`, and the shared `useFoundWordSubmit` engine walks a typed word through it
in the order that gives the friendliest answer: shorter than four letters,
already found — by anyone in coop, by me in compete, plus the words accepted
but not yet landed — then not in the list, which this game splits into the
center letter missing and simply not a word. Each is refused locally, writes
nothing, and answers on the board as well as in the pill: the tiles the word
used shake and take the answer's color for a beat — as many of each letter as
the word used, so a word using one E marks one of two E tiles, never both.

**An accepted word is shown before it is sent.** The pill says `WORD — +N` the
moment the lookup succeeds, the points and flags read off the shipped entry,
and `submit_word` is called in the background with the word already scored.
The reply is read only for whether the row landed: any of its four `ok`s leaves
the pill as it is, and a not-ok — the game ended or was deleted, the caller
conceded, or a duplicate that slipped past the local check — replaces it with
the server's own sentence and frees the word to be tried again. The end of the
game, when this word was the one that ended it, arrives with the next blob like every
other ending.

**Everything this game says about a word is [`lib/answer.ts`](lib/answer.ts)**
— the words and the outcome together, one answer each. The engine names no word
of its own: it reports what it decided, `answerOf` turns that into one of this
game's answers (the center says why a word missed), and `answerMessage` says
it. The pill and the refused word's tiles read the same call, and the two peer
lines read the same file. The examples are the `D·AEEGINNR` board above:

| answer | said to | text | outcome |
|---|---|---|---|
| `accepted` | me | `DEAN — +1` · `DENE • — +1` (a bonus word) · `ENDEARING — pangram +24` | `won` |
| `accepted_peer` | about a coop teammate | `found DEAN +1` · `pangram 🦌 ENDEARING +24` | `won` |
| `already_found` | me | `DEAN — already found` | `warning` |
| `too_short` | me | `DEN — too short` | `warning` |
| `missing_center` | me | `REIN — missing "D"` | `lost` |
| `not_a_word` | me | `DREAN — not a word` | `lost` |
| `reached_peer` | about a compete opponent | `reached Amazing` | `noted` |

The already-found line is written twice on purpose: the server composes the
same `WORD — already found` for the duplicate that slips past the local check,
so the two routes to it read alike.

Coop narrates every teammate's accepted word in the header, in the same outcome
the finder saw; a refused word never becomes a row, so there is nothing to
narrate. Compete cannot see an opponent's words and narrates the one thing it
can: a rank reached — a rival's `rankIdx` climbing on the blob's player
(`useShowOppsRankMessages`). The ending's line and the out-of-race line are
standing conditions of the local slot, not answers to a move; the two ending
hooks build them and `PlayArea` shows them.

**New game goes through the edge function again**, with this game's setup,
roster and mode, minus any custom letters: a hand-picked board is a one-off,
and the follow-up game gets a random one. The creator jumps to the new game
and the others arrive by the invitation toast. Mid-game the shell asks first,
since starting another shelves this one; once the game has ended there is nothing to
interrupt.

## Frontend

The play surface is the shape [`docs/playarea.md`](../../docs/playarea.md)
describes — a loader that gates on the three ways a game can fail to load,
then `PlayArea` in the eight sections.

```
<PlayAreaLoader {...PlayAreaLoaderProps}>        useGame, and the three gates
  └── PlayArea                           the coordinator: draws no board, no control
        ├── BoardCol                     the board column — the word engine and submit_word
        │     ├── MobileStatusBar ←      phone only: the StateLine, mirrored above the board
        │     ├── Board                  the board: nine <Tile> boxes placed on a square
        │     │     └── ShuffleButton ←  floated over its top-right
        │     └── WordEntryArea ←        ⌫, the typed word (drawn through TypedWord), Submit, the
        │                                capture keyboard — or the local slot's pill in their place
        ├── InfoSheet ←                  off-canvas on a phone, a flex child on desktop
        │     └── InfoCol                the readouts and the action row
        │           ├── StateLine              the ladder (RankBar ⇐), and the score and count under it (Stats ⇐)
        │           ├── OpponentStrip ←  compete only: each rival's rank, or "out"
        │           ├── InfoActionsRow ← one row, every action, in the menu's order
        │           ├── SetupDisclosure ←
        │           └── WordList ←       the found words, and once the game has ended the missed ones
        └── CelebrationBlockingModal ←   a win, as it lands — the team's, or mine in a race

  ← belongs to common/ ; ⇐ to shared/ ; everything else is this folder's
```

`GamePage` mounts the loader and owns everything above it — members, the timer,
play_state, pause, chat — and unmounts this whole surface on pause. `Help` and
`SetupForm` are the shell's to mount, from the menu and the start-game dialog.
`useGame` builds `gd` from the `game_data` blob the page was handed, through
the bee games' shared `makeBeeGameData` with this game's setup rows
([shared/bee-games](../shared/bee-games/doc.md)); it reads nothing and
subscribes to nothing.

What is wordwheel's own:

- **The wheel is nine round boxes.** Each tile is a mustard seat placed on a
  square by its own center, from `lib/board.ts`, and the face that sits in it;
  the seats touch by construction and merge into one flower, and only the face
  is the piece — it rests with a shadow, rises on hover and presses back down.
  The square is sized in one coordinate unit, so the whole board sizes to the
  column and the printer draws the same geometry. The center is bigger and
  purple. The outer eight are shuffled locally, a fresh scan of the same
  letters that writes nothing and reaches nobody, and the button stays live on
  a finished board.
- **Each tile is spent once.** The word is typed at the window, or tapped in,
  and the wheel marks the tiles it is spending — one per use of a letter. A
  typed letter says how many of its tiles are in use but not which, so a click
  claims the tile it landed on, for that word only, and the rest fall to
  the puzzle's order, the center first (`lib/spend.ts`); a spent tile takes no click. A letter past its tile
  count, or off the wheel, dims as it is typed (`TypedWord`), and Submit and
  Enter are inert until the word fits (`lib/tiles.ts`), so the engine never
  sees a word the tiles cannot spell. Once the game is over, or I conceded a
  race, the board is read-only: the entry closes, the tiles go inert and drop
  their marks.
- **The move is `hooks/useSubmitWord`.** The lookup over the puzzle's words, the
  `submit_word` call and what each answer shows live there; `BoardCol` hands
  it the few values it needs and gets the typed word, `submit` and the refused
  mark back.
- **A refused word answers on the board.** The tiles it would have spent shake,
  each on its own and no others, and wear the answer's color for a beat, the
  same outcome the pill reads (`common/board-marks`). Refusing the same
  letters again shakes them again: they are keyed on the mark's nonce.
- **Two lists, one reveal.** Both word lists ship at load; the engine looks a
  word up in their union and the missed words fold into the list once the game has ended,
  bonus included. The list is the shared `WordList`, found words in their finder's
  color, pangrams bold, bonus words dotted.
- **The state line** (`StateLine`) is the shared rank-ladder pieces drawn from
  `gd.stateLineData`, mirrored above the wheel on a phone by `MobileStatusBar` so the readout stays on the
  play surface when the info column is off-canvas. Coop shows the team's;
  compete the caller's own, with the Rank strip for the rivals.
- **The ending** is the pill and the row's line, in sentences spellingbee shares
  ([`shared/bee-games`](../shared/bee-games/doc.md)), the inert wheel, and the
  list with its missed words. A win celebrates once, as `gd.me.outcome` turns
  `won` — the team's in coop, and in a race only the winner's screen; nothing
  pops for any other ending.
- **The setup form** offers the target rank — *Win at* in coop with a *None*,
  *Target rank* in compete — the two dictionary bands, *unique letters only*
  under a board-constraints section of its own, and one box for custom letters
  that writes both setup keys, split after the first letter, repeats allowed.
  Start is gated on the legal band containing the required one and on the
  letter rules, the same rules the edge function and `create_game` check again.
- **The club label** (`manifest.ts`) reads `summary_data`: coop's points and words,
  compete's target and, at the end, who won at it or that nobody did.
- **The printer** (`pdf/`) is the wheel beside the setup, above the word list —
  coop's one shared list and compete's a section per player, the missed words folded in once
  the game has ended as they are on screen. On the grayscale page the
  center tile is told apart the two ways that survive it: larger, and with a
  thicker border.
- **No event log and no history viewer.** A found list is alphabetical, not
  chronological, so there is no turn to replay.

## Tests

pgTAP, in `supabase/tests/wordwheel/` — `setup.psql` gives every file
`pg_temp.wordwheel_board()`, a board of `abcdfghi` around `e` holding nineteen
required entries worth sixty-two points (some real words, some synthetic — the
RPC checks shape, not spelling) and three bonus ones; `pg_temp.wordwheel_dup_board()`,
the multiset fixture — `abcdefgg` around `e`, so the center repeats an outer
and G sits on two tiles — holding sixteen required entries worth forty-seven,
among them words that spend both tiles of a letter; and `pg_temp.wordwheel_setup()`,
a no-timer coop setup to override a field of:

| file | pins |
|---|---|
| `schema_test` | both gametypes registered; the seed pool readable, and its generated mask the distinct-letter set of its letters; both word lists readable by a client and present on the row during play and once the game has ended |
| `game_data_test` | the page blobs: a fresh game's puzzle, team, found words and players; the coop and compete mid-game shapes; the won race and the stopped coop game; a Restart; a rebuild of every game without re-dating it |
| `rls_test` | a member sees every row of both tables in both modes; an outsider sees no row of any table; a direct insert is denied |
| `candidate_words_test` | this game's own: the SQL helper returns a fitting word AND a word that would need more of a letter than the wheel has tiles, which is what proves the fit filter is the edge function's; a word missing the center and a word off the wheel are excluded |
| `create_game_test` | both modes' rows, the gametype suffix and the mode; the title formula, with a repeated letter appearing twice; the target and bands copied to their columns; duplicate outers and a center repeating an outer accepted, and an S; an outsider, a bad mode, a short race, a missing or out-of-range target, a bad band, the outer letters' length, the fifteen-word gate, and seven players refused |
| `custom_letters_test` | a hand-picked board is accepted under fifteen words and refused at zero, and may repeat a letter; the custom letters are stripped from the saved default; a random board still needs fifteen |
| `coop_target_test` | reaching the target ends the game `reached_goal` / `target` with everyone ranked 1, and it is really over; the clock with a target unreached is a loss; with no target it is no result; Stop with a target unreached is neutral |
| `gameplay_test` | each of the four `ok`s, none carrying an outcome; the row stores what was sent; the score and count include bonus finds; the coop duplicate; a word spending both tiles of a letter accepted on the multiset board; coop has no end at a full clear; the timeout and the Stop, a second call the game-over race; the lists un-gated throughout; a word into a game deleted under it is the shared race |
| `compete_test` | per-player ownership of a word, and a racer's own duplicate refused with the frontend's line; the target hit answers `won`, ends the race with the winner alone ranked 1; a post-win submit is refused; the timeout and the manual end with nobody winning |
| `concede_test` | refused in coop; a conceder is out while the others race and cannot submit a word; the last one out ends the race as a collective loss |
| `replay_test` | the found list cleared, the ending reset, the clock zeroed, the board and target kept; any player may, mid-game or after; a non-player may not |
| `player_subset_test` | a club member not seated in the game can read it and cannot move in it |
| `reveal_partition_test` | through the real RPCs, from the loser's seat: the table shows a member every racer's row mid-race — the hook's seat rule withholds a rival's, not RLS — and every row once the race has ended, still partitionable by user; `game_data.puzzle.words` carries the required set throughout; and the sum over every visible row is not the caller's own score, which is why the page counts the caller's own rows in compete |

`rank_idx_test` sits in the folder too, but pins `common._rank_idx` and
belongs to `shared/rank-ladder`.

The edge function has its own runner: `deno test --allow-all
supabase/functions/wordwheel-build-board/` covers the pure core in
`board.ts` — the letter mask and the tile counts, the fit rule (a letter as
many times as it has tiles, two tiles allowing two uses, an absent letter
never), the required/bonus partition and its totals, the pangram by length,
the overlap cap, the rare-letter weighting, and the custom-letter rules with
repeats and S allowed. The sampling that uses `Math.random` stays in
`index.ts` and is not unit-tested.

Vitest, beside the code:

| file | pins |
|---|---|
| `lib/answer.test` | every answer's words and outcome, and the two-way split of a miss by the center (the ending sentences are `shared/bee-games`' `endingMessage.test`) |
| `lib/setup.test` · `components/SetupForm.test` | the letter rules and the band rule, each refusal under the field it names; the form's settings in order, the compete caption, the solo club's missing picker, the unique-letters key dropped rather than stored false, and where a server refusal lands — the letters box, the band, or the checkbox that narrowed the pool |
| `lib/spend.test` · `lib/tiles.test` · `components/TypedWord.test` | which tile a use spends: the center first for a typed letter, the clicked tile for a click, a claim ignored once the word drops its letter, and the most recent click forgotten first; whether a word fits the tiles; a typed letter dimming past its tile count or off the wheel |
| `hooks/useGame.test` · `hooks/useSubmitWord.test` | `gd` from the blob — players, the seat rule, the state line's data; and the move without a board — a legal word answered and sent with its own points and flags, a miss refused without a call and its tiles marked, a click claiming its tile and the claim living as long as its letter |
| `components/PlayArea.test` | the surface mounts in every mode and state; a required, bonus and pangram word accepted with the right call, a word the tiles cannot spell held back rather than refused, and a miss refused with its reason and answered on the board — its own tiles and no others, one per use of a letter and the clicked twin over its sibling, shaking and wearing its own outcome for `WORD_ANSWER_MS`, and shaking again when refused again; the tiles a word spends, marked and given back, the clicked tile over its twin and forgotten once its word is submitted or a recall replaces it, and the center first when it is duplicated; the inert board after a concede or an ending; the two peer narrations; the celebration — a coop win and my race win pop as they land, somebody else's win and a game opened already won do not; Concede vs Stop per mode and the strip's *out* / *Conceded at*; the action row and the menu; New game dropping hand-picked letters; the keys — New game, Stop, Concede |

Playwright, in `e2e/`: `wordwheel` (a submitted word lands in the list and
moves the score with no refresh), `wordwheel-coop-win` (crossing the target
celebrates once and shows the verdict; no target ends neutral),
`wordwheel-mobile` (the sheet at phone width, and the desktop unchanged), and
`wordwheel-print` (a real PDF downloads).
