# spellingbee

A honeycomb of seven letters, one of them the center, and every word you can
spell from them that uses the center; the longer the word the more it scores,
and a word using all seven is a pangram. Coop pools one found list and climbs a
rank ladder together; compete races everyone on the same hive, each with a
private list, to a rank chosen at setup. Brand **FreeBee**.

## Intro to area

The frontend knows the answer key. Both word lists — the required words that
make up the goal and the bonus words beyond them — ship to every client the
moment the game loads, so a typed word is judged where it is typed: too short,
a letter off the hive, the center letter missing, not a word, already found.
None of those reaches the server. Only an accepted word does, and it arrives
already scored; `submit_word` trusts the word and its points, checks that the
game is still on and the word is not a duplicate, records the row, re-sums
the score and decides whether that word ended the game. That is the same trade
connections and boggle make, and the opposite of wordle and psychicnum, whose
frontends never hold the answer.

The board is built outside the database. Starting a game does not call
`create_game` directly: the frontend calls the `spellingbee-build-board` edge
function, which chooses the seven letters in Deno — from a pool of pangram
seeds, or from letters the player typed — asks the database for every word
those letters admit, scores and partitions the list, and only then calls
`create_game` with the finished board. The RPC checks the board's shape and
records it; it never chooses a letter. What the frontend gets back is
`create_game`'s own envelope, relayed untouched, so New game and the setup
dialog read one answer whichever way a game was started.

What separates the two modes is whose list a word lands on. Coop is one found
list: whoever finds a word first claims it in their color, the score is the
team's, and the game runs until the clock or the Stop button stops it — or,
when the team set a target rank, until they reach it together. Compete is a
race to a target rank on private lists: the policy on `found_words` hides an
opponent's finds until the game is over, so all a racer learns about a rival
mid-game is the rank they have reached, and the first to the target ends the
race for everyone. A conceder is out while the others race on.

The end of a game is on the board. No modal carries the verdict: the
below-board pill says it, the action row's line repeats it, and the word list
fills in every word nobody found — the bonus words too, being the same shipped
data. The hive stays on screen, inert, with Shuffle still live, and Restart
replays the same letters from an empty list. A coop team that set a target
celebrates once, at the moment they cross it, and so does a race's winner.

## Game rules

A **hive** of seven distinct letters: one **center** and six **outer**. No
board contains an S. A word counts when it is four letters or more, spelled
from the hive's letters (a letter may repeat), includes the center, and is in
the board's **legal list**. A **pangram** is a word that uses all seven
letters. Every random board has at least one, being grown from a pangram
seed; a board built from letters the player chose need not.

Scoring: a four-letter word is one point, a longer word scores its length, and
a pangram adds ten. The **required words** are the goal — their count and their
total are the `X / Y` denominators on screen — and the **bonus words** are the
rest of the legal list: accepted and scored exactly the same, but not part of
the goal, so a player who finds them can pass the displayed maximum. Which
words fall on which side is set at creation by two dictionary bands: a word is
required at or below the **required band** when it is also American, not
slang and clean; it is legal at or below the **legal band** with no further
condition. So even at equal bands the bonus list holds the words the clean
filter removed — which is why a board whose bands are equal shows no bonus
list at all.

The **rank ladder** runs Start → Good → Solid → Nice → Great → Amazing →
Genius, evenly spaced up to Genius at 70% of the required total; a score past
that clamps at Genius. `common._rank_idx` decides it on the server, in
integer math, and the page draws the index the blob carries.

### Vocabulary

| term | what it means |
|---|---|
| **hive** · **center** · **outer** | the seven letters: `center_letter` and the six-character `outer_letters`, stored lowercase; the frontend shuffles the outer six for display only |
| **pangram** | a word whose letter set equals the hive's. `+10`, bold in the list, and the seed every random board is grown from |
| **required word** · **bonus word** | the goal and the rest of the legal list, split by the two bands at creation; each shipped as `{ word, points, is_pangram }` |
| **required band** · **legal band** | `setup.required_band` (1–6, default 3) and `setup.legal_band` (required–6, default 5), the dictionary difficulty each list is drawn at |
| **found word** | a row in `spellingbee.found_words`: who, which word, its points and flags. The team's in coop, each racer's own in compete |
| **rank** | where a score stands on the ladder, 0–6. The team's in coop; each racer's own in compete, and the one thing rivals can see. (connections uses the word for a category's difficulty; the scope tells them apart) |
| **target rank** | `spellingbee.games.target_rank`, copied from `setup.target_rank` at create: compete's finish line, always set; coop's optional win, null for the open-ended hunt |
| **custom letters** | `setup.custom_center` + `setup.custom_letters`, a board the player chose instead of a sampled one. A one-off: never saved as the club's next default |

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

The same hive, raced on private lists. Each racer has their own found words,
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

Three tables, in `supabase/migrations/20260617000000_spellingbee.sql`
(shape) and `supabase/sql/spellingbee.sql` (behavior).

| | |
|---|---|
| `spellingbee.pangrams` | the board-seed pool: one row per seven-letter set drawn from the universal band of `common.words`, with how many required words fit it at the band-one floor and whether it holds a rare letter. Public reference data, rebuilt by `gmake g-spellingbee-pangrams` after `gmake all-words` |
| `spellingbee.games` | one row per game, keyed `game_id`: the seven letters, both word lists as jsonb arrays of `{ word, points, is_pangram }`, the required list's score and count, cached so a submit need not re-sum the list, and three setup values copied at create — `target_rank` (null for none), `required_band` and `legal_band`. The mode and the club are `common.games`' |
| `spellingbee.found_words` | one row per `(game, player, word)`, with `points`, `is_pangram`, `is_bonus` and `found_at`. The game's only working state |

**Nothing is hidden from a client.** Both word lists are in the column grant
and the `game_data` blob carries them from the first read; the frontend judges every word
against them and the missed-words reveal is computed on the client once the
game has ended. The trust model does not withhold an answer key from friends
(CLAUDE.md → Trust model).

**Both tables need only the membership gate.** Who may see a rival's finds
mid-race is the page's rule — the hook's seat rule over `game_data`, which
withholds a rival's rows until the race ends — and nothing reads the tables
from the client, so the policies carry no mode arm.

**The page blobs** are written by `spellingbee._rebuild_data_cols` at create, at
Restart and at the end of every move and ending, each assigned whole
([plans/seat-view.md](../../plans/seat-view.md) → The page is written, not
assembled): `shell_data` through `common._make_json_shell_data`, and on top of
the common part of every `game_data` (`common._make_json_game_data`) this
game's own, the same shape as the other bee game's
([shared/bee-games](../shared/bee-games/doc.md)):

| blob | spellingbee's part |
|---|---|
| `game_data` | `puzzle: {tiles, centerLetter, outerLetters, words, nReqdWords, reqdWordsScore, sameBandsAndHaveNoBonus}`, as `create_game` froze it — a tile being `{id, letter, center}` with its place as its id and the center first, and every legal word `{word, points, pangram, bonus}`, the required ones first; `team: {nFoundWords, foundWordsScore, rankIdx, targetRankIdx}`, what the team shares and the rank it set out for, null in compete; `foundWords`, every find `{userId, word, points, pangram, bonus, at}` in the order found; on each player their own `nFoundWords`, `foundWordsScore` and `rankIdx`, and `targetRankIdx`, the same on every player |
| `summary_data` | `team`, the same group; `nReqdWords`, `reqdWordsScore`, `targetRankIdx` |

**The club-list title is the board**, `<CENTER>·<OUTER-SORTED>` — `A·CHIORT` —
written once at creation and never changed, so one board reads one way in the
club's history whatever the local shuffle.

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

### `spellingbee-build-board` — the edge function in front of `create_game`

Builds a board and creates the game in one round trip. The manifest's
`startGameInClub` and the play surface's New game both call it; nothing in the
frontend calls `create_game` itself. It runs as the caller, so every read it
makes is under the caller's own row-level policies.

With no custom letters, it samples. It reads the club's most recent board so
the new one can share at most four of its seven letters, draws a seed from
`spellingbee.pangrams` — the letter sets of common seven-distinct-letter words,
weighted three to one toward sets holding a rare letter, and a set holding all
of I, N and G kept only a third of the time — then tries that seed's seven
letters as the center in random order until one yields at least thirty
required words, re-sampling the seed if none does. With custom letters — a
center and six others, seven distinct, none of them S — it skips all of that
and builds from exactly those letters, and any number of required words above
zero will do.

Either way the words come from `spellingbee.candidate_words`, a plain SQL
function that returns every dictionary word of four letters or more, at or
below the game's legal band, whose letters are a subset of the seven and
include the center, flagging each as required (at or below the required band,
American, not slang, clean) or not. The edge function scores each — one point for
four letters, otherwise the length, plus ten for a pangram, a word whose
letter set equals the board's — partitions them into `required_words` and
`bonus_words`, totals the required set, and hands the board to `create_game`.

**Passed:**

```json
{
  "p_club_handle": "moths",
  "setup": {
    "target_rank": 5,
    "required_band": 3,
    "legal_band": 5,
    "timer": { "kind": "countdown", "seconds": 600 },
    "custom_center": "a",
    "custom_letters": "chirot"
  },
  "player_user_ids": ["7b1e…", "c904…"],
  "mode": "compete"
}
```

`custom_center` and `custom_letters` are optional and go together;
`required_band` and `legal_band` default to 3 and 5. `mode` is a field of the body, not of the
setup.

**Returned:** exactly what `create_game` returns, below. Two refusals are this
function's own and are part of the story: letters that admit no required word
at that band come back as a validation under the letters field of the setup
dialog, and a required band at which no sampled seed clears thirty words comes
back under the band's field, asking for a wider one.

### `spellingbee.create_game(p_club_handle, p_setup, p_player_user_ids, p_mode, p_board)`

Records a board the edge function built. It checks the setup — a target rank
of 0 to 6, required in compete and optional in coop; a required band of 1 to 6
and a legal band from there to 6; the timer — and the board's shape: six
distinct outer letters and a center that is not among them, none of them S,
both word lists present, and at least thirty required words, or at least one
when the letters were the player's own. It titles the game after its letters,
the center first — `A·CHIORT` — writes the `common.games` row and the
`spellingbee.games` row holding the letters, both lists, the target and the
two bands, and writes the page blobs. The setup is saved as the club's next default with the
custom letters stripped, so the next game's dialog opens on a random board.
Either mode takes up to six players and a race needs two; the server checks
both.

**Passed:** the edge function's body plus `board`:

```json
{
  "board": {
    "outer_letters": "chirot",
    "center_letter": "a",
    "required_words_score": 385,
    "required_words_count": 81,
    "required_words": [ { "word": "chariot", "points": 17, "is_pangram": true }, … ],
    "bonus_words":    [ { "word": "trochaic", "points": 18, "is_pangram": true }, … ]
  }
}
```

**Returned** — one answer:

```json
{ "result": "created", "id": "3f2a…" }
```

### `spellingbee.submit_word(p_game_id, p_word, p_points, p_is_pangram, p_is_bonus)`

The only mid-game move, and a trusting submit: the word arrives already judged
and scored by the frontend, and the server does not re-check its letters, its
length or the dictionary. What it does check, under a lock on the game row, is
that the game still exists, hasn't ended and the caller has not conceded —
a word in flight when any of those changed is a race, a deleted game answering
with the shared *"That game was already deleted"* — and that the word is not already found
under this mode's rule: anyone's in coop, the caller's own in compete. A
duplicate is also a race, since the frontend dedups first and reaching the
server means its list was stale; the server writes the whole line for that one
so the two routes to it read alike.

An accepted word is written to `found_words` with its points and flags. When
the game has a target rank and this word carries the team's score (coop) or
the caller's (compete) to it, the game ends `reached_goal` / `target`: the team
ranked 1, or the caller alone. Either way the page blobs are rewritten. **The answer is about the caller's word and never
about anyone else's**: the ending reaches every client with the rewritten blob, and the
reply only names this word's kind.

**Passed:** `{ "p_game_id": "3f2a…", "p_word": "chariot", "p_points": 17,
"p_is_pangram": true, "p_is_bonus": false }`

**Returned.** Four shapes, all meaning the row landed; `points` echoes what
was sent. The first three are the caller's own flags read back, the fourth
takes precedence over them:

- an ordinary required word — `{ "result": "accepted", "points": 5 }`
- a bonus word — `{ "result": "bonus", "points": 5 }`
- a pangram, required or bonus — `{ "result": "pangram", "points": 17 }`
- the word that reached the target rank and ended the game — `{ "result": "won", "points": 17 }`

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

**Everything about legality is decided here, and never reaches the server.**
The game's legal list is `required_words ∪ bonus_words`, indexed by word, and
the shared `useFoundWordSubmit` engine walks a typed word through it in the
order that gives the friendliest answer: shorter than four letters, already
found — by anyone in coop, by me in compete, plus the words accepted but not
yet landed — then not in the list, which this game splits into a letter off
the hive, the center letter missing, and simply not a word.
Each is refused locally, writes nothing, and answers on the board as well as
in the pill: the hexes the word used shake and take the answer's color for a
beat.

**An accepted word is shown before it is sent.** The pill says `WORD — +N` the
moment the lookup succeeds, the points and flags read off the shipped entry,
and `submit_word` is called in the background with the word already scored.
The reply is read only for whether the row landed: any of its four `ok`s
leaves the pill as it is, and a not-ok — the game ended or was deleted, the
caller conceded, or a duplicate that slipped past the local check — replaces it with the
server's own sentence and frees the word to be tried again. The end of the
game, when this word was the one that ended it, arrives with the next blob like every
other ending.

**Everything this game says about a word is [`lib/answer.ts`](lib/answer.ts)**
— the words and the outcome together, one answer each. The engine names no
word of its own: it reports what it decided, `answerOf` turns that into one of
this game's answers (the hive says why a word missed), and `answerMessage`
says it. The pill and the refused word's hexes read the same call, and the two
peer lines read the same file:

| answer | said to | text | outcome |
|---|---|---|---|
| `accepted` | me | `CHAT — +1` · `AIRT • — +1` (a bonus word) · `CHARIOT — pangram +17` | `won` |
| `accepted_peer` | about a coop teammate | `found CHAT +1` · `pangram 🐝 CHARIOT +17` | `won` |
| `already_found` | me | `CHAT — already found` | `warning` |
| `too_short` | me | `CAT — too short` | `warning` |
| `bad_letters` | me | `CAXT — bad letters` | `lost` |
| `missing_center` | me | `CHIT — missing "A"` | `lost` |
| `not_a_word` | me | `CHAIT — not a word` | `lost` |
| `reached_peer` | about a compete opponent | `reached Amazing` | `noted` |

The already-found line is written twice on purpose: the server composes the
same `WORD — already found` for the duplicate that slips past the local check,
so the two routes to it read alike.

Coop narrates every teammate's accepted word in the header, in the same
outcome the finder saw; a refused word never becomes a row, so there is
nothing to narrate. Compete cannot see an opponent's words and narrates the
one thing it can: a rank reached — a rival's `rankIdx` climbing on the blob's player
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
        │     ├── Board                  the board: seven <Tile> hexes in one svg
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

What is spellingbee's own:

- **The board is one svg.** Seven `<polygon>` hexes with a real fill and stroke,
  positioned from `lib/board.ts` in the flower's own coordinate units and
  scaled by one token, so the whole board sizes to the column and the printer
  draws the same geometry. The outer six are shuffled locally, a fresh scan of
  the same letters that writes nothing and reaches nobody, and the button
  stays live on a finished board.
- **The word is typed at the window, or tapped in.** The shared entry row
  captures keys with no `<input>`; a hex click appends its letter and the hive
  marks the hexes the word is using, which is also how a pangram hunter sees
  the letters not yet used. A letter off the hive dims as it is typed
  (`TypedWord`). Once the game is over, or I conceded a race, the board is
  read-only: the entry closes, the hexes go inert and drop their marks.
- **The move is `hooks/useSubmitWord`.** The lookup over the puzzle's words, the
  `submit_word` call and what each answer shows live there; `BoardCol` hands
  it the few values it needs and gets the typed word, `submit` and the refused
  mark back.
- **A refused word answers on the board.** The hexes the word used shake, each
  on its own and no others, and wear the answer's color for a beat, the same
  outcome the pill reads (`common/board-marks`). Refusing the same letters again
  shakes them again: they are keyed on the mark's nonce.
- **Two lists, one reveal.** Both word lists ship at load; the engine looks a
  word up in their union and the missed words fold into the list once the game has ended —
  bonus included, unless the bands are equal and there is no bonus list worth
  showing. The list is the shared `WordList`, found words in their finder's
  color, pangrams bold, bonus words dotted.
- **The state line** (`StateLine`) is the shared rank-ladder pieces drawn from
  `gd.stateLineData`, mirrored above the hive on a phone by `MobileStatusBar` so the readout stays on the
  play surface when the info column is off-canvas. Coop shows the team's;
  compete the caller's own, with the Rank strip for the rivals.
- **The ending** is the pill and the row's line, in sentences wordwheel shares
  ([`shared/bee-games`](../shared/bee-games/doc.md)), the inert hive, and the
  list with its missed words. A win celebrates once, as `gd.me.outcome` turns
  `won` — the team's in coop, and in a race only the winner's screen; nothing
  pops for any other ending.
- **The setup form** offers the target rank — *Win at* in coop with a *None*,
  *Target rank* in compete — the two dictionary bands, and one box for custom
  letters that writes both setup keys, split after the first letter. Start is
  gated on the legal band containing the required one and on the letter rules,
  the same rules the edge function and `create_game` check again.
- **The club label** (`manifest.ts`) reads `summary_data`: coop's points and words,
  compete's target and, at the end, who won at it or that nobody did.
- **The printer** (`pdf/`) is the honeycomb above the word list, coop's one
  shared list and compete's a section per player, the missed words folded in once
  the game has ended as they are on screen.
- **No event log and no history viewer.** A found list is alphabetical, not
  chronological, so there is no turn to replay.

## Tests

pgTAP, in `supabase/tests/spellingbee/` — `setup.psql` gives every file
`pg_temp.spellingbee_board()`, a board of `abcdfg` around `e` holding thirty
required entries worth fifty points (some real words, some synthetic — the RPC
checks shape, not spelling) and three bonus ones, and
`pg_temp.spellingbee_setup()`, a no-timer coop setup to override a field of:

| file | pins |
|---|---|
| `schema_test` | both gametypes registered; the seed pool readable; both word lists readable by a client and present on the row during play and once the game has ended |
| `game_data_test` | the page blobs: a fresh game's puzzle, team, found words and players; the coop and compete mid-game shapes; the won race and the stopped coop game; a Restart; a rebuild of every game without re-dating it |
| `rls_test` | a member sees every row of both tables in both modes; an outsider sees no row of any table; a direct insert is denied |
| `create_game_test` | both modes' rows, the gametype suffix and the mode; the title formula; the target and bands copied to their columns; an outsider, a bad mode, a short race, a missing or out-of-range target, a bad band, every board-shape fault, and seven players refused |
| `custom_letters_test` | a hand-picked board is accepted under thirty words and refused at zero; the custom letters are stripped from the saved default; a random board still needs thirty |
| `coop_target_test` | reaching the target ends the game `reached_goal` / `target` with everyone ranked 1, and it is really over; the clock with a target unreached is a loss; with no target it is no result; Stop with a target unreached is neutral |
| `gameplay_test` | each of the four `ok`s, none carrying an outcome; the row stores what was sent; the score and count include bonus finds; the coop duplicate; coop has no end at a full clear; the timeout and the Stop, a second call the game-over race; the lists un-gated throughout; a word into a game deleted under it is the shared race |
| `compete_test` | per-player ownership of a word, and a racer's own duplicate refused with the frontend's line; the target hit answers `won`, ends the race with the winner alone ranked 1; a post-win submit is refused; the timeout and the manual end with nobody winning |
| `concede_test` | refused in coop; a conceder is out while the others race and cannot submit a word; the last one out ends the race as a collective loss |
| `replay_test` | the found list cleared, the ending reset, the clock zeroed, the board and target kept; any player may, mid-game or after; a non-player may not |
| `player_subset_test` | a club member not seated in the game can read it and cannot move in it |
| `reveal_partition_test` | through the real RPCs, from the loser's seat: the table shows a member every racer's row mid-race — the hook's seat rule withholds a rival's, not RLS — and every row once the race has ended, still partitionable by user; `game_data.puzzle.words` carries the required set throughout; and the sum over every visible row is not the caller's own score, which is why the page counts the caller's own rows in compete |

`rank_idx_test` sits in the folder too, but pins `common._rank_idx` and
belongs to `shared/rank-ladder`.

The edge function has its own runner: `deno test --allow-all
supabase/functions/spellingbee-build-board/` covers the pure core in
`board.ts` — the letter masks, the required/bonus partition and its totals,
the pangram bonus by letter-set equality, the overlap cap, the rare-letter
weighting, and the custom-letter rules. The sampling that uses `Math.random`
stays in `index.ts` and is not unit-tested.

Vitest, beside the code:

| file | pins |
|---|---|
| `lib/answer.test` | every answer's words and outcome, and the three-way split of a miss (the ending sentences are `shared/bee-games`' `endingMessage.test`) |
| `lib/setup.test` · `components/SetupForm.test` | the letter rules and the band rule, each refusal under the field it names; the form's settings in order, the compete caption, the solo club's missing picker, and where a server refusal lands |
| `hooks/useGame.test` · `hooks/useSubmitWord.test` | `gd` from the blob — players, the seat rule, the state line's data; and the move without a board — a legal word answered and sent with its own points and flags, a miss refused without a call and its letters marked |
| `components/PlayArea.test` | the surface mounts in every mode and state; the hexes a word is using, marked and cleared; the inert board after a concede or an ending; a required, bonus and pangram word accepted with the right call, a miss refused with its reason and answered on the board — its own letters and no others shaking and wearing its own outcome, for `WORD_ANSWER_MS`, and shaking again when refused again; the two peer narrations; the celebration — a coop win and my race win pop as they land, somebody else's win and a game opened already won do not; Concede vs Stop per mode and the strip's *out* / *Conceded at*; the action row and the menu; New game dropping hand-picked letters; the keys — New game, Stop, Concede, Shuffle, Restart |

Playwright, in `e2e/`: `spellingbee` (the play loop on screen — a required
word lands, a bonus word dots, a pangram flourishes, custom letters), 
`spellingbee-coop-win` (crossing the target celebrates once and shows the
verdict; no target ends neutral), `spellingbee-mobile` (the sheet at phone
width, and the desktop unchanged), and `spellingbee-print` (a real PDF
downloads).
