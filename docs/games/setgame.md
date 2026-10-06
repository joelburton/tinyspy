# setgame (HareTrigger)

Our port of **Set**: eighty-one tiles over four attributes, and a **set** is
three of them that are all-same or all-different in every attribute. Twelve lie
face-up; claim a set and it leaves the table; the board tops back up, and grows
by three whenever it holds nothing to find. Play ends when the deck is spent and
the tiles left hold no set.

**Codename `setgame`, brand HareTrigger.** Not `set`, because `SET` is a
Postgres keyword, `Set` is a TypeScript builtin, and
[naming.md](../naming.md#watch-list-of-generic-words) bans `set` as a
wide-visibility name outright. The domain word survives in **player-facing copy
only**; in code the found thing is a **claim** (a `setgame.events` row with
`kind = 'claim'`), and the move RPC is `submit_set` — the `submit_guess` /
`submit_word` sibling.

**A tile, in code; a card, to a player.** The piece on the table is a **tile**
everywhere in code — the SQL, the types, the components, the CSS — like every
other game's piece. Help, the setup form and any copy a player reads say
"card", which is what the game calls them (Joel, 2026-10-05).

Coop and compete ship as a sibling-manifest pair (`setgame_coop` /
`setgame_compete`, one schema, one folder).


## 1. The tile, which is why this game needs so little machinery

A tile is its four attributes written as digits, each 1..3, in the order count,
color, fill, shape — stored as a `smallint`, and as the text of its id:

```
"3121"  =  three symbols · the first color · the second fill · the first shape
```

"All-same or all-different in every attribute" is then a rule per digit. Two
consequences the whole game rests on:

- **Any two tiles determine the third.** Per digit, the same digit when the two
  agree, and the remaining value, `6 - x - y`, when they differ; so checking a
  claim is one call rather than a comparison of four attributes.
- **Asking whether a board holds a set is a PAIR loop**, never a triple scan:
  each pair names its completing tile, so the question is "is that tile also
  here?". At the largest board that can exist it is 210 iterations.

Both implementations are a dozen lines — `src/setgame/lib/tiles.ts` in TS,
`setgame._third` / `_find_set` in plpgsql — which is what makes
server-authority free here. The junior deck keeps four digits, its fill fixed
at 1 (solid); it is closed under the rule, so nothing branches on it.

### The numbers that shaped the design

Measured, not assumed — 20k simulated games apiece:

| fact | value |
|---|---|
| sets in the deck | 1080 |
| P(no set among twelve) | ~3.4%, about 1 in 29 |
| **P(a game ever deals past twelve)** | **67%** — 65.5% top out at 15, 1.4% at 18 |
| board ceiling | **21**, hard: the largest set-free collection in AG(4,3) is 20 tiles, so 21 always contains a set |
| P(a game ever needs 21) | ~1 in a million ([Wärne](https://henrikwarne.com/2011/09/30/set-probabilities-revisited/)) |
| endings | 6 tiles left 46% · 9 tiles 44% · 12 tiles 8% · **a full clear only ~1–2%** |

Two of those rows are load-bearing and easy to get backwards:

- **Growing is the common case.** The per-DEAL odds of a set-free board are
  ~3%, but a game makes about two dozen of those checks. Two games in three
  reach fifteen tiles. Anything that treats a wider board as an exception —
  layout, tile sizing, the claim's marks — is wrong.
- **A full clear is rare**, which kills "win = use every tile" as a coop goal.
  See §4.


## 2. Architecture — the plainest trust story on the roster

Every tile in play is face-up and every claim is public. There is **no solution
to hide**, no seat rule, and no end-of-game reveal. The only secret is **the
order of the undealt deck**, and `games.deck` is withheld by a plain column
grant with nothing behind it; no blob carries it, because nothing on the page
shows it.

That the frontend holds the whole rule has one consequence worth stating
plainly: **an invalid claim never reaches the server.** Picking a third tile
that doesn't complete a set is refused in the client, so there is no
wrong-guess penalty to design and nothing to price. The server still re-checks
everything — it is the authority — it just never sees one in practice.

The rejection that *does* happen in real play is **contention**: a rival
claiming a tile out from under your pick. See §6.


## 3. Schema — `setgame.*`

```
setgame.games     game_id, deck_kind, palette,
                  deck smallint[]      -- SHIELDED: the undealt order
                  deck_pos int,        -- cursor into deck
                  board smallint[]     -- slot-ordered, 0..21 tiles
setgame.players   game_id, user_id, n_sets_found, n_hints_used
setgame.events    id, game_id, user_id, kind ('claim' | 'hint'),
                  took_turn boolean,   -- true on a claim, false on a hint
                  tiles smallint[1..3], board_after smallint[], created_at
```

The mode and the club are `common.games`'; `palette` is copied from
`setup.palette` at create. `board` is in **slot order**, and position is
meaningful: a slot keeps its screen position and its keyboard letter for the
whole game, because a claim refills **in place** (§5).

**`players` has no `solved` / `solved_at`**, and the absence is the shape of the
game: setgame has no per-player finish line. The deck running dry ends it for
everyone at once, so who won is decided at the end and written to each
`common.game_players` row's ranking and outcome. Each player's counts are their
own, in both modes; the team's are their sum.

**`events` is club-readable in both modes**, with no end-of-game gate — unusual
for a compete game and correct here: the tiles were face-up and everyone watched
them leave. A rival's claim history says nothing about what is coming, and the
**last-set panel shows anyone's claim in both modes** — its job is to say what
just disappeared from a shared table, which is a question you mostly ask about
someone else's move.

**One table for two kinds of thing**, `claim` and `hint`, because they are one
thing to the reader: the log is what happened, in order, and a hint is as much
part of the record as the find it led to.

**`board_after` is stored, not derived.** The board after event N *is* a
function of the frozen deck and the events before it — but only by re-running
the deal (remove three · refill in place when under the floor with tiles left ·
tail-compact when not · deal to fixpoint), which is the subtlest logic in the
game. Deriving it on the frontend means a second implementation with nothing
testing that the two agree, and when they drift the history viewer shows a board
that never existed — worse than no viewer.

### RLS + grants

`games` takes a column grant listing everything except `deck`; `players` and
`events` are club-readable via the games row.

### The page blobs

`setgame._rebuild_data_cols` writes them at create, at Restart and at the end of
every move — a hint included — and every ending, each assigned whole:
`shell_data` through `common._make_json_shell_data`, and on top of the common
part of `game_data` and `summary_data` this game's own.
`setgame._rebuild_data_cols_for_all()` rebuilds every setgame game without
re-dating it.

| blob | setgame's part |
|---|---|
| `game_data` | `board: {tiles}` — the one table, shared in both modes, each tile `{id}`, its four digits as text, in slot order. `nTilesInDeck`, the tiles still to be dealt. `team: {nSetsFound, nHintsUsed}` — the players' counts summed; null in compete. `events`, every row `{id, userId, kind, tiles, boardAfter, tookTurn, at}`. On each player their own `nSetsFound` and `nHintsUsed` |
| `summary_data` | `team`, as above; `nTableSetsFound`, the table's sets in both modes; `nTilesInDeck`; `perfectClear`, a coop win that left the table empty; `winnerIds`, every player ranked first, and `nWinnerSets`, the sets they share — both compete's |

**Nothing is private to a seat**, so `useGame` has no seat rule: every row and
count is public in both modes. `winnerIds` is a list because with no speed
tiebreak a tie is an ordinary result, and the club card names each winner.

### How a game ends

The ending is `common.games`' reason, detail and outcome
([win-lose.md](../win-lose.md)):

| mode | when | reason / detail | ranked |
|---|---|---|---|
| coop | the deck cleared | `reached_goal` / `cleared` | everyone 1, won |
| coop | the timer | `timeout` | nobody — a loss |
| compete | the deck cleared | `resource_exhausted` / `cleared` | by sets found, among players who didn't concede and found one; ties share |
| compete | the timer | `timeout` | the same ranking |
| compete | every racer conceded | `conceded` | nobody — a loss |
| either | somebody pressed Stop | `stopped` | nobody — neutral |

The last claim is who ended a cleared game; a timeout is ended by whoever held
the turn in turn-by-turn coop, and by nobody otherwise.


## 4. Modes, win and loss

Vocabulary per [win-lose.md](../win-lose.md).

### Coop — clear the deck

The goal is **no sets left to find**: the deck empty and the board dead. It does
**not** mean using every tile. Stranding six or nine is the ordinary ending
(§1), so the win says "all sets found" and reports no leftover count anywhere —
a "6 stranded" readout measures the win against a target that doesn't exist. A
**full clear** is a ~2% event and keeps its own line.

| | |
|---|---|
| finish | built-in (deck out + board dead), always reachable |
| loss | timer only — the stackdown / strands / crosswords coop shape |

### Turn-by-turn coop

Opt-in (`coop_style: 'turns'`, with the usual "who goes first"), and it changes
what the game *feels* like more than what it does: free-for-all coop is a team
hunting at once, which quietly rewards whoever scans fastest. Turn-by-turn is
the same team finding the same sets without the race inside it.

**A turn is one successful claim.** Precisely:

| action | allowed off-turn? | passes the turn? |
|---|---|---|
| claim a set | no | **yes**, when it's accepted |
| a claim that isn't a set | no | no — a misclick must not cost a turn |
| ask for a hint | no | **no** |

Hints not passing the turn is the load-bearing part. A hint is *part of* your
turn: ask, look, claim. It also means a stuck player has a way out — three asks
walk the ladder to a full set, and the third one claims it, which ends their
turn the ordinary way. If a hint passed the turn instead, that player would be
handed a ring they were no longer allowed to use.

Both gates are on the server (`_require_turn` in `submit_set` **and** in
`record_hint` — `n_hints_used` is shared state, so cashing one is a move), not
just in the FE, and `supabase/tests/setgame/turn_order_test.sql` pins every row
of that table.

**Three surfaces say whose turn it is**, and setgame's arrangement is not the
roster's standard one (this section carries the argument;
`FeedbackMessage.waiting()` is the shared message):

| surface | when it's yours | when it isn't |
|---|---|---|
| the board | full color, live | **faded to 0.5**, inert |
| below-board pill (local) | "Waiting for your move" | "Waiting for ● Name…" |
| info column line | "Your turn" | "Waiting for ● Name…" |

Two departures worth knowing:

- **The board fades.** setgame's tiles otherwise refuse to dim — color is one of
  the four attributes, so a dimmed red reads as a *different tile* — and they
  still refuse at the end and in the history viewer. Off-turn is the
  exception because the whole board fades together (nothing can be misread
  against an undimmed neighbor) and it is a state you wait through rather than
  study. Without it the board looks live and simply eats clicks.
- **A your-turn prompt, which no other game has.** Elsewhere there is none,
  deliberately: a permanent one would evict the own-move results that land
  exactly when it IS your turn. Here it is a `prompt`, the kind everything else
  outranks — "Not a set" and "Someone got there first" show over it — so rank
  buys what absence bought there ([ui.md → Feedback
  pill](../ui.md#feedback-pill)). It shares the below-board slot with the
  waiting message, which is safe because the two are exclusive: one is true
  exactly when the other is false. Peer narration ("● moth found a set") stays
  switched OFF in turn games, for its own reason — the waiting message renaming
  itself IS the news that the previous player claimed, and the log and the
  counts both say so.

`e2e/setgame-turn-order.e2e.ts` drives two live clients and pins all three
surfaces on both sides of a hand-off.

### Compete — most sets, and a tie is a tie

Style is **best** with a **collective** finish: nobody finishes alone, the deck
running dry ends it for everybody, and the ranking is `n_sets_found desc` with
**no speed tiebreak**. Everyone on the top count shares first place.

The roster's usual `quality asc, solved_at asc` exists to separate players who
crossed the *same* finish line. Here the count is the whole result, and breaking
a 9–9 on who grabbed their last set first would crown reflexes the score
deliberately doesn't measure. So the ranking uses `rank()`: every tied player is
ranked 1 and won, the summary's `winnerIds` lists every one of them,
and each player reads their own outcome.

**On timeout, compete RANKS BY SETS FOUND** — the leader at the whistle wins.
With a collective finish there are no finishers to rank, and the count of sets
taken IS the complete result at every instant, so the timer is simply how the
session stops ([win-lose.md → The three
primitives](../win-lose.md#the-three-primitives)). A race nobody scored in is
still a collective loss: only a player who found a set is ranked.

Concede is the standard per-player drop-out, decided by `common._concede`. A
conceder keeps the sets they took — their count stays on their row — but is
not ranked, so nothing here breaks the no-survival-wins invariant.


## 5. The deal rule, and why the board never closes up

After a claim, `submit_set` runs the deal to a **fixpoint**: while the board is
under its floor OR holds no set, deal three; stop when the deck is spent. Both
halves of the rule are one loop. Running to a fixpoint rather than dealing once
matters — three fresh tiles can leave the table still set-free, and a single
pass would hand the players a dead board.

Where the tiles go is the design decision worth reading twice:

- **Replacing a claim: IN PLACE.** The three claimed slots take the three new
  tiles. Every other tile keeps its slot, its screen position and its keyboard
  letter, so a claim never disturbs a scan someone else is in the middle of.
- **Growing: APPEND.** A board with no set gains a column on the right (or a row
  below, in portrait), which is space the layout already reserved.
- **Shrinking: TAIL-COMPACT.** Above the floor, or with a dry deck, three slots
  have to disappear. Rather than closing the whole board up — which would shift
  every tile after the first hole — the last three slots are dropped and their
  survivors move into the holes. At most three tiles move, and they are the ones
  at the end of the layout.

The alternative (close up, deal three at the end) was rejected: it reflows the
table on every claim, which in compete happens *to* you several times a minute
while you are mid-thought, and it re-letters every tile after the hole.

### The claim's marks

A claim substitutes tiles **in place**: three leave and three arrive in the same
slots. Over a real connection the board simply *differs* a moment later, and if
your eye was in another corner of it, nothing said so. So every claim is marked,
for everyone at the table, with the shared marks at their shared lengths
(`hooks/useClaimMarks.ts`; Joel, 2026-10-05):

| beat | mark | why |
|---|---|---|
| the click, until the claim lands | the claimer's three wear the shared **in-flight dim** | "I heard you, the server hasn't answered" — its length is the lag |
| `WORD_ANSWER_MS` | the found set, on the table as it was, wears a **won-color ring** | a set was found, and where. A ring, not a fill: a fill hides the colored symbols |
| `ATTENTION_FLASH_MS` | the tiles the claim DEALT wear the shared **attention flash** | news, in a corner you may not be watching |

- **Only tiles new to the table flash.** A claim on fifteen tiles compacts to
  twelve by moving the last three into the holes; those were already on the
  table and do not flash.
- **Everyone holds for the same beat** after the claim lands, the claimer too —
  that symmetry is fairness: otherwise the claimer would see their replacements
  early, a real edge in compete.
- **Keyed to a CLAIM, and nothing else.** The cause is read off the log
  (`useChangeCause`, keyed on the newest claim's id) rather than inferred from
  the board's shape: a claim writes an event, and `replay_board` deletes every
  event, so a new game and a Restart just appear, unmarked. Quiet while a past
  turn is open.

## 6. Contention — the one genuinely new mechanic

Every other compete game gives racers private boards or private progress. Here
**one board is shared**, and a claim removes tiles from under other players.
Two defenses, and they are independent:

- **Server:** `submit_set` takes the games-row lock before checking membership
  on the board, so overlapping claims serialize. The loser's claim is refused
  as **PN277, a `race`, "Someone got there first"** — the one refusal a
  setgame player actually meets, and nobody's mistake, so it is a pill and not
  a fault.
- **Client:** the picks hold **tile ids, not slot indices**, and are filtered
  against the **live** table every render (`usePickedTiles`). A tile that
  leaves is simply not picked any more, and its letter is free again. Keyed by
  slot, a pick would silently re-point at whatever refilled the hole — and the
  next keystroke would claim a tile the player never looked at. Filtered
  against the live table rather than against what's on screen, because while a
  found set is held the screen still shows the table from before the claim.


## 7. Frontend

Standard v3 two-column PlayArea, no layout exception.

**Board.** Three rows of tiles, growing rightwards, **left-aligned** rather than
centered: a centered board slides left when a deal adds a column, which is a
full-table reflow at the moment everyone is mid-scan. Left-aligned, the extra
column arrives in space the column already reserved and nothing on screen moves.

**Tile sizing** (`Board.module.css`) is the smallest of three limits: a per-tile
cap, the height three rows may occupy, and the width `--cols` of them may
occupy — where `--cols` is the **widest the board has been**, a high-water mark,
so tiles can shrink once and never grow back. It does not size for seven
columns up front: beside the info column the width term binds, and every
ordinary game would pay for a board almost nobody sees.

**Tiles** are inline SVG: one visual channel per attribute — count is how many
symbols, shape is which path, color is the hue, and fill is solid, a
`<pattern>` of stripes (`TileDefs`), or open. Nothing on the face is decorative. The three
paths are ours (`lib/shapes.ts`), not the CC BY-SA Wikimedia file's, and the
logo reuses them so it can't drift from the board.

**Proportions are measured off a real deck, not chosen.** A symbol is **2.1**
times as tall as it is wide, and the tile is 100:94, the same margin above and
below the symbol. Not a playing card's 5:7 — a real card is tall because it fans
in a hand and has a back; ours has neither, and at 5:7 the symbols sit in a lot
of empty white. A shorter tile is a wider one on **portrait mobile**, where the
board is height-bound. `SYMBOL_LAYOUT.height` and the printer's symbol height are both
*derived* from the one aspect number, so nothing can stretch the shapes by
being edited alone.

**Input.** Click a tile, or type the letter under it (`act-pick-by-letter`). No
text entry at all.

**Info column**, in the canonical order: the state line (`Found · Deck
remaining · Hints` — the third only in coop; `StateLine`, drawing
`gd.stateLineData`), the **last-set panel**, the OpponentStrip in compete, the
turn line (turn games only), one action row, the Setup options list, then the
**event log**. There is deliberately no count of the tiles face-up: they are
right there to be looked at.

### The component tree

Folder [`src/setgame/`](../../src/setgame/), the shape
[`docs/playarea.md`](../playarea.md) describes, on the page blobs: `useGame` is
`makeGameData(game_data, me)` — no read, no subscription — and every type the
folder exports is in [`types.ts`](../../src/setgame/types.ts), the `gd` sketch
at its top.

```
<PlayAreaLoader {...PlayAreaLoaderProps}>   useGame: gd from the game_data blob
  └── PlayArea                      the coordinator: picks the table to show
        ├── BoardCol                the table and the row under it; owns the move
        │     ├── MobileStatusBar ← on a phone: StateLine and the Hint icon
        │     ├── Board             the table; decides each tile's marks
        │     │     ├── TileDefs    the stripe patterns, once
        │     │     └── Tile        one tile, and its letter beneath
        │     ├── HistoryBanner ←   over the pill row while a past turn is open
        │     └── FeedbackPill ←    the local slot
        └── InfoSheet ←             off-canvas on a phone, a flex child on desktop
              └── InfoCol           the readouts and the action row
                    ├── StateLine   "Found: 5 • Deck remaining: 50 • Hints: 1"
                    ├── LastSet     the last claim's three tiles, and who
                    ├── OpponentStrip ←    compete only: each racer's sets, or "out"
                    ├── TurnStatusLine ←   turn-by-turn coop only
                    ├── InfoActionsRow ←   one row, every action; Hint through useAction
                    ├── SetupDisclosure ←
                    └── GameEventLog       every row, as tiles

  ← belongs to common/ ; everything else is this folder's
```

`PlayArea`'s hooks: the two ending messages (`useGetGameEndingMessage`,
`useGetPlayerEndingMessage`, from `lib/gameEndingMessage.ts` and
`lib/playerEndingMessage.ts`), `useShowTeammateMoves` (a teammate's claim in
the header, free-for-all coop only), `useHistoryView` and `useActionsAndMenu`.
`BoardCol`'s: `usePickedTiles` (the picks, held as ids), `useSubmitClaim` (the
trip to `submit_set`, and the in-flight tiles), `useSpendHint` (the ring and
the ladder; `record_hint`) and `useBoardColActions` (the letter key, ⌫ and Hint,
with `canPick` and `pickTile`). `Board`'s: `useClaimMarks` (§5).

### The answers (`lib/answer.ts`)

Every answer setgame gives is one of four — `claim`, `claim_peer` (a teammate's
claim in the header), `hint`, `not_a_set` — and `lib/answer.ts`'s
`answerMessage` is the only place that says what each reads as: `won` · `won`,
"found a set" · `warning` · `lost`, "Not a set". `eventToOutcome` colors a log
row by its `kind`. `not_a_set` never becomes a row at all, since the board is
face-up and the frontend refuses three non-matching tiles without a round trip.

The log bar, a teammate's line, the found set's ring and the refusal pill all
read it. `submit_set` answers the case alone (`{result: 'claimed'}`), and
`record_hint` carries no outcome either: asking for a hint shows itself, in the
ring the client already drew.

The rule this follows is [outcomes.md → One event, one
outcome](../outcomes.md#one-event-one-outcome--and-who-decides-it).

### The event log

Rows are **pictures**, not text: a set has no name, and spelling one out ("2 red
striped diamonds · 1 red solid oval · 3 red open squiggles") is three lines of
prose for something the eye reads instantly as three tiles. So a row is `#n`, up
to three mini tiles, and who — the same components the board draws, at
`--tile-w: 1.9rem`.

**Hints are rows too**, tagged `Hint` and carrying the shared **amber**
(`warning`) bar rather than the neutral one — the word every game gives a
hint. Without the tag a hint's one-to-three tiles read
as a find, which is exactly backwards. A hint row holds what the asker was
*shown*, so it has one, two or three tiles depending on how far up the ladder
they went.

The **heading counts**, borrowed from the word-list games: `Found: 7 · Hints: 3`
on the All filter, the same two scoped when a player is picked — and in compete
just `Found: 7`, since there are no hints there to count.

The **history viewer** is the shared one (`useHistoryViewer`), and it is a plain
lookup rather than a replay — `lib/history.ts` reads `board_after` off the row
and highlights that event's tiles. See §3 for why that column is stored.

**Coop never shows a per-player breakdown on screen** — not while the game runs,
and not at the end either. Mid-game, individual counts would quietly turn a
cooperative game into a visible contest; at the end a breakdown is *pushed*
at the table whether or not anyone wanted the comparison, and coop shouldn't end
on a scoreboard nobody asked for. What replaced it is the log's **player
filter**: the same two numbers, scoped to whoever you pick, *pulled* by the
person who went looking. The printout does carry the breakdown in both modes —
nothing is live on paper, so the reason to hold it back doesn't apply
(`pdf/model.ts`).

### The keyboard

A letter under every tile, typing toggles it, Backspace clears, and the third
picked tile submits. Two actions — `act-pick-by-letter` and
`act-clear-picks` — not the shared `useCaptureKeys`: that helper accumulates
*text*, and a letter here is a toggle on a tile, not a character appended to a
word. `act-pick-by-letter` is a PATTERN action, handed whichever letter fired it,
which is what makes twenty-one tiles one action rather than twenty-one.

The letters are a **fixed 3 × 7 grid** (`lib/letters.ts`), of which only the
dealt columns are shown:

```
A  B  C  D | E  F  G
H  I  J  K | L  M  N
O  P  Q  R | S  T  U
```

Two properties that pull against each other, both satisfied: letters read
left-to-right, and **a letter never changes which tile it means**. Numbering
across the current width would re-letter eight of the twelve tiles the moment a
column arrived — and a player typing from muscle memory would silently claim a
tile they never looked at. The cost is that rows are not contiguous (row two
starts at H), which nobody has to know: a letter is an address to read off a
tile, never a sequence to recite.

**Tab is caught and goes nowhere** — the page declares an empty tab ring.
Nothing on this surface takes focus, so a Tab that did anything would only move
a focus ring somewhere unusable.

### The palette

Two, chosen at setup, defaulting to **traditional** (Set's own red / green /
purple). The alternative is Okabe–Ito **blue / orange / magenta**, which stay
separable under red-green color vision deficiency.

It matters more here than the same option would in most games, because **two
tiles can differ only by color** — the other three attributes are identical on
them, so shape and fill cannot rescue a pair you can't separate. Magenta
rather than purple is the load-bearing choice in the safe trio: purple is the
obvious "stay close to the original" third and is exactly the one a deutan reads
as blue.

The three theme tokens (`--setgame-red` / `-green` / `-purple`) are **slots, not
pigments**: they name the attribute value, and one class on the play surface
repaints all three. Nothing outside `theme.css` knows which palette is in play.

A per-game choice, so a mixed table agrees on one. The property it really tracks
belongs to a *player*; if that ever bites, the answer is a profile preference.

### Mobile

Below `--mobile` the letters come off — there is no keyboard to use them with,
and `--letter-row` goes to `0` so the board gets the height back (hiding the
label alone would leave the space reserved).

**A status bar sits above the board** (the shared `<MobileStatusBar>`), carrying
`Found · Hints` and a **second copy of the hint button**. The info column is
off-canvas in the `<InfoSheet>` down here, so without it both reading your score
and asking for a hint cost a sheet-open — and in this game asking is a routine
move, not a rescue. The info column keeps its own button; both place the same
ACTION, so they cannot come to say different things — the gray "No hints
when competing" face included.
`Deck remaining` is the one readout the bar drops: it is the longest and the
least urgent, and the bar must never wrap.

The bar is paid for twice over. Its height comes out of `--avail-h` (the shared
convention), and the ~9px of tile width that cost is bought back by **cropping
the tile's own top/bottom whitespace**: mobile draws a 100:86 tile instead of
100:94, and the face is rendered `preserveAspectRatio="slice"` so the shorter
box trims margin rather than shrinking the symbols. Measured at 390×844, tiles
are 111px either way.

In **portrait** the board **transposes**: three columns, growing downwards.
Growing sideways on a ~366px width would divide it by up to seven, leaving ~50px
tiles on the deal that two games in three reach. Turned, tiles measure **111px**
— the same at twelve as at eighteen, because space for **eighteen** is reserved
from the start, so a deal resizes nothing.

**Reserved means HELD, not just sized for.** The tile-size math alone only made
the tiles small enough that six rows *would* fit; the board element still hugged
the rows actually dealt, so the pill under it — and the verdict at the end — sat
beneath the last row and got pushed down the moment a deal added one. The board
carries a `min-height` of the reserved rows (with `align-content: start`, or the
grid hands the slack to the rows and they drift apart), so growing 12 → 18 moves
nothing below it at all. Twenty-one rows past the floor is the documented
exception: it shrinks the tiles and reflows once.
Twenty-one shrinks to fit rather than overflowing — one reflow, in a game nobody
will ever see, versus breaking the page's no-scroll invariant.

Landscape is deliberately excluded: a phone on its side is short and wide, which
is what the untransposed board already suits.

### The title

A pure **identifier** — `#` plus the first six hex digits of the game's uuid,
set at create and never rewritten. bananagrams does the same for a different
reason (it has nothing shareable to name).

setgame *could* have named itself after its content: the sets found are public
in both modes, so "25 sets found" was legal and true. It is the wrong thing to
want. A counting title duplicates the summary and changes every few seconds,
so it can't be used to REFER to a game. A handle that never moves can — "look at
#A3F19C" is something one player says to another, and something to search a club
list for.

### Print to PDF

**The log, and only the log** — per-player totals, then every claim and hint in
one sequence, in both modes, each row a picture of its tiles.

This game has **nothing to print and play**. A setgame board is a shuffle that
turns over every few seconds, so a printed one is a photograph of a moment
nobody can return to; what survives is what happened. Hence the log, and hence
the totals printing in both modes — the screen holds coop's breakdown back until
the end so a cooperative game doesn't become a running scoreboard, and
nothing is live on paper, so that reason doesn't apply.

The printer draws its own two-column flow rather than composing the shared
`drawEventLog`, whose row is `{ seq, who, text }`. The column *geometry* is
still shared (`twoColGeom`), so the page lines up with every other printout.

**Fill on paper — the hatch, and why the shortcuts failed.** setgame is the
one printer that has to reproduce a texture. On screen a striped tile is an SVG
`<pattern>` of horizontal lines inside the symbol; on paper it has to be the
same third thing, distinct from solid and from open, because fill is one of
the game's four attributes and losing it collapses three of its nine looks into
one. Two cheaper approximations were tried first and both failed *when looked
at*:

1. **A light tint** instead of stripes. Legible in a diff, wrong on paper: at
   62% toward white it reads as a *muted solid*, so the striped tile looks like
   a faded version of the solid one rather than a different thing.
2. **Real lines, but too fine.** At the first tile size (15 × 17pt) a symbol
   fits two or three hatch lines, which is once again a muted solid.

What ships is **real hatching, clipped to the symbol** — jsPDF has `clip()` /
`discardPath()`: build the path with a `null` style, clip, rule horizontal
lines across the bounding box, restore, then stroke the outline back on so the
edge stays crisp. The tile size and the hatch pitch were chosen **together** by
rendering the full 3 shapes × 3 fills × {1, 3} symbols grid at several sizes
and looking at it: a symbol about 16pt tall with a 3pt pitch. The bar is arm's
length — a printout is looked at, not zoomed. Only the tile's WIDTH is set in
the printer; its height and its symbols' height are derived from
`lib/shapes.ts`, so a reshape on screen reaches paper without anyone having to
remember it. Tiles print in the palette the game was played with; the
colorblind one's L\* 46 / 61 / 70 is close enough to the print doc's three-shade
ramp to survive a mono printer. The squiggle is a mechanical rewrite of the
board's own path, and the oval is drawn narrower than its slot — the two
lessons that generalize are in
[common/pdf/doc.md → Details](../../src/common/pdf/doc.md#details).


## 8. RPCs

| function | notes |
|---|---|
| `create_game(p_club_handle, p_setup, p_player_user_ids, p_mode)` | inline shuffle — **no edge function**, since a board is a shuffle. Deals the floor, then runs the deal rule so the opening board always holds a set. |
| `submit_set(p_game_id, p_tiles)` | the only mid-game move. Locks the games row, validates, removes, refills to a fixpoint, writes the `claim` event with its `board_after`, scores, checks for the end, rebuilds the blobs. |
| `record_hint(p_game_id, p_tiles)` | coop only, and **the tally, not the hint** — it charges the asker, writes the event and rebuilds the blobs. Takes the games row lock too, so a hint and a claim can't take the same two rows in opposite orders. |
| `concede` / `submit_timeout` / `stop_game` / `replay_board` | the standard four: concede locks the row and `common._concede` decides it; Stop goes through `common._stop`. |
| `_third` / `_is_set` / `_find_set` / `_find_set_with` / `_deck_size` / `_board_min` / `_deal_to_playable` / `_finish` | internals |
| `_make_json_*`, `_rebuild_data_cols`, `_rebuild_data_cols_for_all` | the page blobs (§3) |

Both moves answer with [an envelope](../envelopes.md) naming the case alone:
`submit_set` carries `{result: 'claimed'}`; `record_hint` carries
`{result: 'recorded', n_hints_used}` — the count the call just moved. Neither
carries an outcome or a message: what an answer reads as is
`lib/answer.ts`'s, and asking for a hint shows itself in the ring the client
already drew.

**Three of its refusals are races, which is more than any other game has**, and
one of them is why: `PN277` "Someone got there first" is the contention check,
and setgame is the only board on the roster where losing a race is ordinary
rather than exotic — one table, everyone claiming off it, and the tiles leave
in the next blob, so no local gate can see it coming. `PN486` "Game over" and
`PN483` "Already conceded" are the usual two. Everything else is a fault the
client should have prevented and says so: `BUG: bad set` (the board is face-up
and `lib/tiles.ts` runs the same algebra before submitting), `BUG: claim that
was not three different tiles`, `BUG: hint request in a race` (compete offers no
hint button at all), and four `BUG: …` hint-shape checks.

### Hints are private, computed on the client, and coop-only

**The hint itself is never stored or sent.** It can be computed locally, and
that is the whole design: the board is face-up and `lib/tiles.ts` holds the same
algebra the server does, so a hint is a local search rather than a round trip.
Two things follow — the ring appears on the keystroke (it also *selects* the
tiles, so a lag would be felt), and there is no private column for the server to
mask, which is why this game still has no per-peer masking anywhere.

**Only the asker sees the ring.** Writing it to the game row, so it landed on
everyone's board, would be a different game — being handed a tile you didn't ask
for is being played *for*. Everyone is still charged, because the
count is the table's, and the log names who asked.

The **ladder** is one more tile of the SAME set per press: one, two, then all
three — and the third rung needs no special case, since three picked tiles
already claim. Growing the same set matters; recomputing from scratch could
point at a different set on the second press and leave the player chasing two
answers.

Two rules this shape needs:

- **The full ring returns `null`.** Returning the set again looks harmless and
  isn't: a complete ring has already fired its claim, so a fast fourth press
  would compute from a board about to change and re-submit the same three
  tiles.
- **One lock order.** `record_hint` inserting an event takes a ShareLock on the
  referenced games row, while `submit_set` holds that row and wants the events
  table; in opposite orders they deadlock (40P01). Both RPCs take the games row
  `for update` first, and the hint is recorded before its third rung claims.

Banned outright in compete per the priced-hint rule — a free generative hint
decides a race. The button still renders there, disabled, with "No hints when
competing", rather than vanishing.

**`replay_board` keeps the deck** and rewinds `deck_pos`, so the tiles come back
in exactly the order they came the first time. That is why the deck is stored
whole and frozen rather than drawn lazily: a reshuffle would make Restart just
another New game. The title survives, because it names the game, not the run.


## 9. Setup

| knob | values |
|---|---|
| `deck` | **full** (81) · **junior** (27 — the fill dropped, all solid, dealt nine at a time) |
| `palette` | **traditional** (default) · colorblind |
| `timer` | the standard optional countdown |
| `coop_style` (+ `first_turn_user_id`) | free-for-all (default) · turns — see §4 |

Junior is the difficulty dial. Dropping an attribute is the real Set Junior's
own idea, and it is a genuinely different game to scan rather than a slower
version of the same one. It is closed under `third` — the completing tile of two
solid tiles is itself solid — which is why nothing downstream branches on it;
only the deal size differs (9, ceiling 12).


## 10. Tests

- **`lib/tiles.test.ts`** — exhaustive: all 81 tiles are four digits of 1..3
  and round-trip, exactly 1080 sets, `third` total and symmetric, no attribute
  ever two-and-one. The board ceiling is pinned by a **planted 20-tile cap**
  (every other tile in the deck extends it into a set), and junior's ceiling is
  **proved outright** by an exhaustive backtracking search — a 9-tile cap
  exists, a 10-tile one does not.
- **`hooks/useGame.test.ts`** — `makeGameData`: the table keyed by id, the
  links turned into players, every row public in a race, the state line from
  the team in coop and my own in compete.
- **`hooks/useClaimMarks.test.ts`** — the claim's marks: the found set held,
  then the dealt tiles flashing; the tail-compaction case, where the moved
  tiles do not flash; a Restart unmarked; quiet over a past turn.
- **`lib/gameEndingMessage.test.ts`** — every ending's words, a tie from both
  sides, and a conceder's.
- **`lib/answer.test.ts`**, **`lib/letters.test.ts`** (the letters never move
  when the board grows), **`lib/hint.test.ts`** (the ladder grows one tile of
  the SAME set per press, and returns `null` once the ring is complete),
  **`lib/picks.test.ts`** (the toggle, the fourth-tile refusal, and a tile
  claimed out from under the picks), **`lib/history.test.ts`** (the board the
  row RECORDED, its own tiles ringed, how far a hint went).
- **`components/PlayArea.test.tsx`** — the wiring: letters pick and toggle, the
  third of a set claims with the tiles as numbers, a non-set is refused
  locally, no letters on an ended game or a teammate's turn, Hint's two faces,
  the conceder's row, and +, ⌥⌫ and Restart through the dispatcher.
- **pgTAP** (`supabase/tests/setgame/`) — `game_data_test.sql` pins the blobs
  (a fresh game, mid-game in each mode, the endings, a Restart, the rebuild);
  the rest: gameplay and its three rejections, the **stolen-tile** contention
  case, the tail-compaction on a **planted 15-tile board**, a whole game played
  out through the real RPC, compete ranking and ties, the conceder rule, the
  timeout adjudications, hints, replay, the deck's unreadability, and
  **turn-by-turn** (both gates, and that neither a hint nor a refused claim
  passes the turn).
- **e2e** — both input routes, the local rejection, contention across two
  sessions, the portrait transposition, the planted 21-tile board, print, and
  the two-client turn hand-off (board fade + both pills, on both screens).
- **`e2e/setgame-flash.e2e.ts`** — the claim's marks on the cases only a real
  board can produce: a **fifteen-tile** table, where claiming compacts to
  twelve and the found set still rings; a Restart after exactly **one** claim,
  which marks nothing; and a finished game opened with its log full of claims,
  which marks nothing.

Two of those are planted on purpose. A 15-tile board arises in ~3% of deals and
a 21-tile one in ~1 in a million; a test that waited for either would test
nothing almost every run, and the layout they exercise is exactly the one nobody
would file a bug report for.


## Deferred

- **`target_sets` for coop** — an opt-in finish line, spellingbee's machinery.
  Only bites in a timed game. Nobody has asked for it.

- **An 18-tile board doesn't fit at full tile size on desktop** (a 16" MacBook,
  2026-08-17) — and the code agrees: `Board.module.css` says `--max-tile-w:
  12rem` is "chosen against the WIDTH term… under what five columns can afford,
  so dealing to fifteen resizes nothing at all. Only an eighteen-tile board
  shrinks the tiles, and that is 1.4% of games."

  So the implementation reserves *fifteen* without a resize, while the mental
  model we've been carrying is that only the ~1-in-a-million twenty-one-tile
  board should ever cost a size change. The header records why the first draft's
  always-fit-seven-columns approach was rejected — an ordinary twelve-tile board
  paid a permanent 20% of tile size for a board almost nobody sees — so the real
  question is whether six columns' worth of that cost is worth paying for the
  1.4% of games that reach eighteen. Measure before deciding: the width term
  binds beside the info column, so the cost is a real number, not a guess.


## Won't do

- **Calling "no set".** The physical game has a variant where spotting a dead
  board scores. Our auto-refill makes a dead board unobservable, which is the
  right default and closes the variant off.
- **A penalty for a wrong claim.** There is nothing to punish: the FE holds the
  whole board, so a non-set never leaves the client. Adding one would mean
  deliberately shipping invalid claims to the server to have them rejected.
