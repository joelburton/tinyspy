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
team's, and the game runs until the clock or the End button stops it — or,
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
that clamps at Genius. `currentRankIndex` draws it on the frontend and
`common._rank_idx` decides it on the server, in integer math, and the
rank-ladder tests pin the two to the same answer at every boundary.

### Vocabulary

| term | what it means |
|---|---|
| **hive** · **center** · **outer** | the seven letters: `center_letter` and the six-character `outer_letters`, stored lowercase; the frontend shuffles the outer six for display only |
| **pangram** | a word whose letter set equals the hive's. `+10`, bold in the list, and the seed every random board is grown from |
| **required word** · **bonus word** | the goal and the rest of the legal list, split by the two bands at creation; each shipped as `{ word, points, is_pangram }` |
| **required band** · **legal band** | `setup.required` (1–6, default 3) and `setup.legal` (required–6, default 5), the dictionary difficulty each list is drawn at |
| **found word** | a row in `spellingbee.found_words`: who, which word, its points and flags. The team's in coop, each racer's own in compete |
| **rank** | where a score stands on the ladder, 0–6. The team's in coop; each racer's own in compete, and the one thing rivals can see. (connections uses the word for a category's difficulty; the scope tells them apart) |
| **target rank** | `setup.target_rank`: compete's finish line, always set; coop's optional win, absent for the open-ended hunt |
| **custom letters** | `setup.custom_center` + `setup.custom_letters`, a board the player chose instead of a sampled one. A one-off: never saved as the club's next default |

### Coop

One found list, one score. A word is anyone's to find and, once found, is
found for the whole team — a second player typing it gets *already found*.
The team's rank climbs as the score does, and the game ends three ways: the
countdown expires, somebody presses End, or — when the team chose a target
rank at setup — the word that carries them to it wins. There is no end at
100%: a team that clears the required list keeps finding bonus words, and the
counter overshoots. The clock running out is a loss only when there was a
target to miss; with none, it is the neutral `ended`. End is neutral either
way.

### Compete

The same hive, raced on private lists. Each racer has their own found words,
score and rank, and finding a word another racer already has is a fresh point.
What a racer learns about a rival mid-game is their rank, on the Rank strip,
and whether they have dropped out — never a word, which the row policy
withholds until the game ends and then opens for the post-game read.

The first racer whose rank reaches the target ends the race for everyone;
the caller is frozen onto the status as the winner with the leaderboard as it
stood, and each player's result is written to the common roster. A conceder is
out while the others race on and can submit nothing more, so they cannot reach
the target; every racer conceding is a collective loss, written by
`common.concede`. The countdown expiring before anyone reaches the target is a
loss for the table, since there was a rank to reach; End is neutral in a race
too.

Compete needs an opposing **player**, which is why its manifest takes 2–6
where coop takes 1–6. `create_game` checks both ends: a race with fewer than
two players is a fault, and so is a roster of more than six.

### The play states

Each mode writes its own pair, so a reader of `common.games.play_state` can
tell which was played without joining anything:

| | coop | compete |
|---|---|---|
| the target rank reached | `won` | `won_compete` |
| the clock, or every racer out | `lost` | `lost_compete` |

Plus `playing`, and `ended` when somebody stopped it — neutral in every mode,
and also coop's clock running out on a hunt with no target. WHY it ended is
`common.games.status.reason`: `target`, `timeout`, `manual`, or `conceded`.
Every ending this game writes itself publishes the final figures beside the
reason — coop's score, count and rank, compete's leaderboard and the winner's
name — which is what the club-list label and the Rank strip read after the
game. The one ending it does not write, every racer conceding, is
`common.concede`'s: it adds only its reason, and the status merges, so the
race's last readout stays under it.

## Schema

Three tables and a view, in `supabase/migrations/20260617000000_spellingbee.sql`
(shape) and `supabase/sql/spellingbee.sql` (behavior).

| | |
|---|---|
| `spellingbee.pangrams` | the board-seed pool: one row per seven-letter set drawn from the universal band of `common.words`, with how many required words fit it at the band-one floor and whether it holds a rare letter. Public reference data, rebuilt by `gmake g-spellingbee-pangrams` after `gmake all-words` |
| `spellingbee.games` | one row per game: the `mode`, the seven letters, both word lists as jsonb arrays of `{ word, points, is_pangram }`, and the required list's score and count, cached so a submit need not re-sum the list |
| `spellingbee.found_words` | one row per `(game, player, word)`, with `points`, `is_pangram`, `is_bonus` and `found_at`. The game's only working state |
| `spellingbee.games_state` | the view the frontend reads: every column of `games`, passed straight through under `security_invoker`. It hides nothing today and is kept as the uniform seam every game reads |

**Nothing is hidden from a client.** Both word lists are in the column grant
and the view exposes them from the first read; the frontend judges every word
against them and the missed-words reveal is computed on the client at
terminal. The trust model does not withhold an answer key from friends
(CLAUDE.md → Trust model).

**`found_words` carries the mode-aware policy**, three arms in one `EXISTS`:
coop shows every club member every row, a racer always sees their own, and a
terminal game opens everybody's — the post-game reveal in compete, and a no-op
in coop. Club membership is the outer gate; the mode is read off
`spellingbee.games.mode`, denormalized there so the policy joins one table.
`games` needs only the membership gate, since the header holds nothing private.

**The club-list readout is `common.games.status`**, seeded by `create_game`
and rewritten on every submit. Coop's carries the team's score, count and rank
beside the required totals and the target; compete's carries the target, the
totals and a `leaderboard` of every player's score, count and rank, which the
Rank strip draws mid-game. Only the rank is shown to a rival; the score rides
along unread. A compete win freezes the winner's id and username onto the
status, since the club label cannot resolve a uuid on its own.

**The club-list title is the board**, `<CENTER>·<OUTER-SORTED>` — `A·CHIORT` —
written once at creation and never changed, so one board reads one way in the
club's history whatever the local shuffle.

**Realtime is one room per client**, postgres-changes on both tables, and every
change refetches the found list; the header loads once, since nothing in it
changes during play. Both tables must be in the publication, since a
subscription naming an unpublished table is rejected whole. The three RPCs that
end a game from outside a submit touch `found_words` in place on the way out,
which is what wakes a compete client to refetch the rows the policy has just
opened; `replay_board` touches `games` instead, because it only deletes and a
filtered subscription does not reliably see a delete.

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
American, not slang, clean) or not. The function scores each — one point for
four letters, otherwise the length, plus ten for a pangram, a word whose
letter set equals the board's — partitions them into `required_words` and
`bonus_words`, totals the required set, and hands the board to `create_game`.

**Passed:**

```json
{
  "target_club": "moths",
  "setup": {
    "target_rank": 5,
    "required": 3,
    "legal": 5,
    "timer": { "kind": "countdown", "seconds": 600 },
    "custom_center": "a",
    "custom_letters": "chirot"
  },
  "player_user_ids": ["7b1e…", "c904…"],
  "mode": "compete"
}
```

`custom_center` and `custom_letters` are optional and go together; `required`
and `legal` default to 3 and 5. `mode` is a field of the body, not of the
setup.

**Returned:** exactly what `create_game` returns, below. Two refusals are this
function's own and are part of the story: letters that admit no required word
at that band come back as a validation under the letters field of the setup
dialog, and a required band at which no sampled seed clears thirty words comes
back under the band's field, asking for a wider one.

### `spellingbee.create_game(target_club, setup, player_user_ids, mode, board)`

Records a board the edge function built. It checks the setup — a target rank
of 0 to 6, required in compete and optional in coop; a required band of 1 to 6
and a legal band from there to 6; the timer — and the board's shape: six
distinct outer letters and a center that is not among them, none of them S,
both word lists present, and at least thirty required words, or at least one
when the letters were the player's own. It titles the game after its letters,
the center first — `A·CHIORT` — writes the `common.games` row and the
`spellingbee.games` row holding the letters and both lists, and seeds the
club-list readout: in coop the score, count and rank at zero with the required
totals and the target beside them; in compete the target, the totals and an
empty leaderboard. The setup is saved as the club's next default with the
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

### `spellingbee.submit_word(target_game, word, points, is_pangram, is_bonus)`

The only mid-game move, and a trusting commit: the word arrives already judged
and scored by the frontend, and the server does not re-check its letters, its
length or the dictionary. What it does check, under a lock on the game row, is
that the game still exists, is still playing and the caller has not conceded —
a word in flight when any of those changed is a race, a deleted game answering
with the shared *"That game was already deleted"* — and that the word is not already found
under this mode's rule: anyone's in coop, the caller's own in compete. A
duplicate is also a race, since the frontend dedups first and reaching the
server means its list was stale; the server writes the whole line for that one
so the two routes to it read alike.

An accepted word is written to `found_words` with its points and flags. In
coop the team's score and count are re-summed and published to the club-list
readout, and when the team set a target rank and this word carried them to
it, the game ends as `won`. In compete the caller's own totals are re-summed
and the leaderboard the readout carries — each racer's score, count and rank —
is rebuilt; when the caller's rank reaches the target the race ends as
`won_compete`, the caller frozen onto the status as the winner with the
leaderboard as it stood. **The answer is about the caller's word and never
about anyone else's**: the terminal reaches every client over realtime, and
the reply only names this word's kind.

**Passed:** `{ "target_game": "3f2a…", "word": "chariot", "points": 17,
"is_pangram": true, "is_bonus": false }`

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

`concede`, `end_game`, `submit_timeout` and `replay_board` — the common shape
every game has, doing here what they do everywhere. What is this game's:
`end_game` is neutral in both modes, `ended` with the reason `manual`, since
friends agreeing to stop is not losing; `submit_timeout` is a loss wherever
there was a rank to reach — `lost` in a coop game that set a target, always
`lost_compete` in a race — and the neutral `ended` only in the open-ended
coop hunt; `concede` is refused outside compete, and a conceder's words are
refused from then on, so they cannot reach the target; and `replay_board`
clears every found word and reseeds the readout exactly as `create_game` did,
the target rank carried over, so the same letters are played again from
nothing. Every ending this game writes itself publishes the final score, count
and rank — coop's team figures, compete's leaderboard — beside the reason,
which is what the club-list label and the opponent strip read after the game.
The one ending it does not write, every racer conceding, is `common.concede`'s,
which adds only its reason over the race's last readout.

Three of them end by touching `found_words` in place. A compete client cannot
see an opponent's finds until the game is over, and `common.end_game` writes
only `common.games`, so without that no-op write nothing would wake the found
list and every opponent word would show as missed. `replay_board` touches
`games` instead: it only deletes, and a filtered subscription does not
reliably see a delete.

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
leaves the pill as it is, and a not-ok — the game ended, the caller conceded,
or a duplicate that slipped past the local check — replaces it with the
server's own sentence and frees the word to be tried again. The end of the
game, when this word was the one that ended it, arrives by realtime like every
other terminal.

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
one thing it can: a rank reached, read off the status leaderboard as it
changes. The terminal verdict and the out-of-race line are standing conditions
of the local slot, not answers to a move; they are built in `PlayArea`.

**New game goes through the edge function again**, with this game's setup,
roster and mode, minus any custom letters: a hand-picked board is a one-off,
and the follow-up game gets a random one. The creator jumps to the new game
and the others arrive by the invitation toast. Mid-game the shell asks first,
since starting another shelves this one; at terminal there is nothing to
interrupt.

## Frontend

The play surface is the shape [`docs/playarea.md`](../../docs/playarea.md)
describes — a loader that gates on the three ways a game can fail to load,
then `PlayArea` in the eight sections.

```
<PlayAreaLoader {...GamePageCtx}>        useGame, and the three gates
  └── PlayArea                           the coordinator: draws no board, no control
        ├── BoardCol                     the board column — the word engine and submit_word
        │     ├── MobileStatusBar ←      phone only: the RankBar and Stats, mirrored above the hive
        │     ├── Letters                the hive: seven <Letter> hexes in one svg
        │     │     └── ShuffleButton ←  floated over its top-right
        │     └── WordEntryArea ←        ⌫, the typed word (drawn through TypedWord), Submit, the
        │                                capture keyboard — or the local slot's pill in their place
        ├── InfoSheet ←                  off-canvas on a phone, a flex child on desktop
        │     └── InfoCol                the readouts and the action row
        │           ├── RankBar ⇐ Stats ⇐  the ladder, and the score and count under it
        │           ├── OpponentStrip ←  compete only: each rival's rank, or "out"
        │           ├── InfoActionsRow ← one row, every action, in the menu's order
        │           ├── SetupDisclosure ←
        │           └── WordList ←       the found words, and at terminal the missed ones
        └── CelebrationBlockingModal ←   a win, as it lands — the team's, or mine in a race

  ← belongs to common/ ; ⇐ to shared/ ; everything else is this folder's
```

`GamePage` mounts the loader and owns everything above it — members, the timer,
play_state, pause, chat — and unmounts this whole surface on pause. `Help` and
`SetupForm` are the shell's to mount, from the menu and the start-game dialog.
`useGame` is the bee games' shared hook bound to this schema: the header from
`games_state`, loaded once, and the found rows, refetched on every change.

What is spellingbee's own:

- **The hive is one svg.** Seven `<polygon>` hexes with a real fill and stroke,
  positioned from `lib/honeycomb.ts` in the flower's own coordinate units and
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
- **A refused word answers on the board.** The hexes the word used shake, each
  on its own and no others, and wear the answer's color for a beat, the same
  outcome the pill reads (`common/board-marks`). Refusing the same letters again
  shakes them again: they are keyed on the mark's nonce.
- **Two lists, one reveal.** Both word lists ship at load; the engine looks a
  word up in their union and the missed words fold into the list at terminal —
  bonus included, unless the bands are equal and there is no bonus list worth
  showing. The list is the shared `WordList`, found words in their finder's
  color, pangrams bold, bonus words dotted.
- **The ladder and the figures** are the shared rank-ladder pieces, mirrored
  above the hive on a phone by `MobileStatusBar` so the readout stays on the
  play surface when the info column is off-canvas. Coop shows the team's;
  compete the caller's own, with the Rank strip for the rivals.
- **The terminal** is the pill and the row's line (`lib/terminal.ts`), the
  inert hive, and the list with its missed words. A win celebrates once, on
  the flip — the team's in coop, and in a race only the winner's screen, read
  off `status.winner_user_id`; nothing pops for any other ending.
- **The setup form** offers the target rank — *Win at* in coop with a *None*,
  *Target rank* in compete — the two dictionary bands, and one box for custom
  letters that writes both setup keys, split after the first letter. Start is
  gated on the legal band containing the required one and on the letter rules,
  the same rules the edge function and `create_game` check again.
- **The club label** (`manifest.ts`) reads the status: coop's points and words,
  compete's target and, at the end, who won at it or that nobody did.
- **The printer** (`pdf/`) is the honeycomb above the word list, coop's one
  shared list and compete's a section per player, the missed words folded in
  at terminal as they are on screen.
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
| `schema_test` | both gametypes registered; the seed pool readable; both word lists readable by a client and exposed by the view during play and at terminal |
| `rls_test` | coop shows every member every row; an outsider sees no row of any table; a direct insert is denied; compete narrows a racer to their own rows mid-game and opens every row at terminal |
| `create_game_test` | both modes' rows, the gametype suffix and the denormalized mode; the title formula; the status seeded per mode; an outsider, a bad mode, a short race, a missing or out-of-range target, a bad band, every board-shape fault, and seven players refused |
| `custom_letters_test` | a hand-picked board is accepted under thirty words and refused at zero; the custom letters are stripped from the saved default; a random board still needs thirty |
| `coop_target_test` | reaching the target is `won` with reason `target` and everyone winning, and the game is really over; the clock with a target unreached is `lost`; with no target it is `ended`; End with a target unreached is `ended` |
| `gameplay_test` | each of the four `ok`s, none carrying an outcome; the row stores what was sent; the score and count include bonus finds; the coop duplicate; coop has no end at a full clear; the timeout and the manual end, each idempotent and each touching the rows; the lists un-gated throughout; a word into a game deleted under it is the shared race |
| `compete_test` | per-player ownership of a word, and a racer's own duplicate refused with the frontend's line; the leaderboard's shape; the target hit answers `won`, ends the race, names the winner, freezes the leaderboard as it stood and writes every result; a post-win submit is refused; the timeout and the manual end with nobody winning |
| `concede_test` | refused in coop; a conceder is out while the others race and cannot submit a word; the last one out ends the race as a collective loss, and only that concede touches the found rows |
| `replay_test` | the found list cleared, the status reseeded, the clock zeroed, the board kept, the `games` row touched; any player may, mid-game or after; a non-player may not |
| `player_subset_test` | a club member not seated in the game can read it and cannot move in it |
| `reveal_partition_test` | through the real RPCs, from the loser's seat: their own rows mid-game and no rival's; every row at terminal, still partitionable by user; the answer key present throughout; and the sum over every visible row no longer equals the caller's own score, which is why the frontend filters to self in compete |

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
| `lib/answer.test` · `lib/terminal.test` | every answer's words and outcome, and the three-way split of a miss; every terminal sentence per mode, play state and reason, as a table with no cell pairing a win with a loss |
| `lib/setup.test` · `components/SetupForm.test` | the letter rules and the band rule, each refusal under the field it names; the form's settings in order, the compete caption, the solo club's missing picker, and where a server refusal lands |
| `components/PlayArea.test` | the surface mounts in every mode and state; the hexes a word is using, marked and cleared; the inert board after a concede or an ending; a required, bonus and pangram word accepted with the right call, a miss refused with its reason and answered on the board; the two peer narrations; the celebration — a coop win and my race win pop as they land, somebody else's win and a game opened already won do not; Concede vs End per mode and the strip's *out* / *Quit at*; the action row and the menu; New game dropping hand-picked letters; the keys — New game, End, Concede, Shuffle, Restart |

Playwright, in `e2e/`: `spellingbee` (the play loop on screen — a required
word lands, a bonus word dots, a pangram flourishes, custom letters), 
`spellingbee-coop-win` (crossing the target celebrates once and shows the
verdict; no target ends neutral), `spellingbee-mobile` (the sheet at phone
width, and the desktop unchanged), and `spellingbee-print` (a real PDF
downloads).
