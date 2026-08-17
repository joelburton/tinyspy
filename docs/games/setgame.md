# setgame (HareTrigger)

Our port of **Set**: eighty-one cards over four attributes, and a **set** is
three of them that are all-same or all-different in every attribute. Twelve lie
face-up; claim a set and it leaves the table; the board tops back up, and grows
by three whenever it holds nothing to find. Play ends when the deck is spent and
the cards left hold no set.

**Codename `setgame`, brand HareTrigger.** Not `set`, because `SET` is a
Postgres keyword, `Set` is a TypeScript builtin, and
[naming.md](../naming.md#watch-list-of-generic-words) bans `set` as a
wide-visibility name outright. The domain word survives in **player-facing copy
only**; in code the found thing is a **claim** (a `setgame.events` row with
`kind = 'claim'`), and the move RPC is `submit_set` — the `submit_guess` /
`submit_word` sibling.

Coop and compete ship as a sibling-manifest pair (`setgame_coop` /
`setgame_compete`, one schema, one folder).


## 1. The packing, which is why this game needs so little machinery

A card is four base-3 digits in one integer 0..80:

```
card = count·27 + color·9 + shade·3 + shape        (each digit 0..2)
```

"All-same or all-different in every attribute" is then exactly "the three digits
sum to 0 mod 3 in every place". Two consequences the whole game rests on:

- **Any two cards determine the third.** `third(a, b)` is arithmetic, so
  checking a claim is one call rather than a comparison of four attributes.
- **Asking whether a board holds a set is a PAIR loop**, never a triple scan:
  each pair names its completing card, so the question is "is that card also
  here?". At the largest board that can exist it is 210 iterations.

Both implementations are a dozen lines — `src/setgame/lib/cards.ts` in TS,
`setgame._third` / `_find_set` in plpgsql — which is what makes
server-authority free here.

### The numbers that shaped the design

Measured, not assumed — 20k simulated games apiece:

| fact | value |
|---|---|
| sets in the deck | 1080 |
| P(no set among twelve) | ~3.4%, about 1 in 29 |
| **P(a game ever deals past twelve)** | **67%** — 65.5% top out at 15, 1.4% at 18 |
| board ceiling | **21**, hard: the largest set-free collection in AG(4,3) is 20 cards, so 21 always contains a set |
| P(a game ever needs 21) | ~1 in a million ([Wärne](https://henrikwarne.com/2011/09/30/set-probabilities-revisited/)) |
| endings | 6 cards left 46% · 9 cards 44% · 12 cards 8% · **a full clear only ~1–2%** |

Two of those rows are load-bearing and easy to get backwards:

- **Growing is the common case.** The per-DEAL odds of a set-free board are
  ~3%, but a game makes about two dozen of those checks. Two games in three
  reach fifteen cards. Anything that treats a wider board as an exception —
  layout, card sizing, the claim flash — is wrong.
- **A full clear is rare**, which kills "win = use every card" as a coop goal.
  See §4.


## 2. Architecture — the plainest trust story on the roster

Every card in play is face-up and every claim is public. There is **no solution
to hide**, no per-peer RLS mask on the events table, and no terminal reveal.
The only secret is **the order of the undealt deck**, and `games.deck` is
withheld by a plain column grant with nothing behind it: no definer helper, no
unlock, because the leftover order is of no interest once the game is over.

That the FE holds the whole rule has one consequence worth stating plainly:
**an invalid claim never reaches the server.** Selecting a third card that
doesn't complete a set is refused in the client, so there is no wrong-guess
penalty to design and nothing to price. The server still re-checks everything —
it is the authority — it just never sees one in practice.

The rejection that *does* happen in real play is **contention**: a rival
claiming a card out from under your selection. See §6.


## 3. Schema — `setgame.*`

```
setgame.games     id, club_handle, mode, deck_kind,
                  deck smallint[]      -- SHIELDED: the undealt order
                  deck_pos int,        -- cursor into deck
                  board smallint[]     -- slot-ordered, 0..21 cards
setgame.games_state  the view the FE reads: board, deck_left
                     (= deck size - deck_pos), never `deck`
setgame.players   game_id, user_id, sets_found, hints_used
setgame.events    id, game_id, user_id, kind ('claim' | 'hint'),
                  cards smallint[1..3], board_after smallint[], created_at
```

`board` is in **slot order**, and position is meaningful: a slot keeps its
screen position and its keyboard letter for the whole game, because a claim
refills **in place** (§5).

**`players` has no `solved` / `solved_at`**, and the absence is the shape of the
game: setgame has no per-player finish line. The deck running dry ends it for
everyone at once, so who won is decided at the terminal and written to
`common.game_players.result`, not tracked per row as play goes.

**`events` is club-readable in both modes**, with no terminal gate — unusual for
a compete game and correct here: the cards were face-up and everyone watched
them leave. A rival's claim history says nothing about what is coming, and the
**last-set panel shows anyone's claim in both modes** — its job is to say what
just disappeared from a shared table, which is a question you mostly ask about
someone else's move.

**One table for two kinds of thing**, `claim` and `hint`, because they are one
thing to the reader: the log is what happened, in order, and a hint is as much
part of the record as the find it led to. It also makes the hint tally something
the log can be asked for rather than a separate counter to keep in step.

**`board_after` is stored, not derived.** The board after event N *is* a function
of the frozen deck and the events before it — but only by re-running the deal
(remove three · refill in place when under the floor with cards left ·
tail-compact when not · deal to fixpoint), which is the subtlest logic in the
game. Deriving it on the FE means a second implementation with nothing testing
that the two agree, and when they drift the history viewer shows a board that
never existed — worse than no viewer. Twelve to twenty-one smallints a row buys
that away. (strands' viewer is a filter for the same reason.)

### RLS + grants

`games` takes a column grant listing everything except `deck`; `players` and
`events` are club-readable via the games row. `games_state` is a plain
`security_invoker` view — `deck_left` is computed from `deck_kind` and
`deck_pos`, both public, which is what keeps the shield a column grant with no
helper behind it. `_deck_size` is the one `_`-prefixed function granted to
`authenticated`, because that view body runs as the reader.

### Realtime

All three tables are in `supabase_realtime` (`games` carries the board itself,
`players` the counts, `events` the log + the last-set panel). One unpublished table would
silently kill live delivery for the other two — the central registry test
guards it.

### Play states

`playing` → `won` / `lost` (coop), `won_compete` / `lost_compete` (compete),
`ended` (manual stop, either mode).


## 4. Modes, win and loss

Vocabulary per [win-lose.md](../win-lose.md).

### Coop — clear the deck

The goal is **no sets left to find**: the deck empty and the board dead. It does
**not** mean using every card. Stranding six or nine is the ordinary ending
(§1), so the win says "all sets found" and reports no leftover count anywhere —
a "6 stranded" readout measures the win against a target that doesn't exist. A
**full clear** is a ~2% event and keeps its own line.

| | |
|---|---|
| finish | built-in (deck out + board dead), always reachable |
| loss | clock only — the stackdown / strands / crosswords coop shape |

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
`record_hint` — `hints_used` is shared state, so cashing one is a move), not
just in the FE, and `supabase/tests/setgame/turn_order_test.sql` pins every row
of that table.

**Three surfaces say whose turn it is**, and setgame's arrangement is not the
roster's standard one (`common/…/turnCopy.tsx` carries the argument):

| surface | when it's yours | when it isn't |
|---|---|---|
| the board | full color, live | **faded to 0.5**, inert |
| below-board pill (local) | "Waiting for your move" | — |
| header pill (global) | — | "Waiting for ● Name…" |
| info column line | "Your turn" | "Waiting for ● Name…" |

Two departures worth knowing:

- **The board fades.** setgame's cards otherwise refuse to dim — color is one of
  the four attributes, so a dimmed red reads as a *different card* — and they
  still refuse at a terminal and in the history viewer. Off-turn is the
  exception because the whole board fades together (nothing can be misread
  against an undimmed neighbor) and it is a state you wait through rather than
  study. Without it the board looks live and simply eats clicks.
- **The waiting message moved to the header, and a your-turn prompt took its
  place below the board.** Elsewhere the wait is the below-board pill and there
  is no your-turn pill at all, deliberately: a permanent one would evict the
  own-move results that land exactly when it IS your turn. Here it's the
  *fallback* — "Not a set" and "Cards gone" outrank it — so ordering buys what
  absence bought there. The cost is real and worth naming: a sticky header pill
  occupies the slot the players strip lives in, so a waiting player doesn't see
  the strip. Peer narration ("● moth found a set") is therefore switched OFF in
  turn games, since one slot can't hold both and the wait is the better tenant.

`e2e/setgame-turn-order.e2e.ts` drives two live clients and pins all three
surfaces on both sides of a hand-off.

### Compete — most sets, and a tie is a tie

Style is **best** with a **collective** finish: nobody finishes alone, the deck
running dry ends it for everybody, and the ranking is `sets_found desc` with
**no speed tiebreak**. Everyone on the top count is a co-winner.

The roster's usual `quality asc, solved_at asc` exists to separate players who
crossed the *same* finish line. Here the count is the whole result, and breaking
a 9–9 on who grabbed their last set first would crown reflexes the score
deliberately doesn't measure. wordiply's co-winner convention is the one copied:
every tied player gets `won = true`, `winner_user_id` goes **null** when there
is more than one, and the FE reads its own flag.

**On timeout, compete RANKS THE STANDINGS** — the leader at the whistle wins.
That is a deliberate departure from scrabble-compete, the roster's other
collective-finish game, which all-loses. The difference: scrabble has no
meaningful partial result to rank, while here the count of sets taken IS the
complete result at every instant, so the clock is simply how the session stops.
A race nobody scored in is still a collective loss.

Concede is the standard per-player drop-out. A conceder keeps the sets they took
— they appear in the leaderboard with their count — but cannot win, so nothing
here breaks the no-survival-wins invariant.


## 5. The deal rule, and why the board never closes up

After a claim, `submit_set` runs the deal to a **fixpoint**: while the board is
under its floor OR holds no set, deal three; stop when the deck is spent. Both
halves of the rule are one loop. Running to a fixpoint rather than dealing once
matters — three fresh cards can leave the table still set-free, and a single
pass would hand the players a dead board.

Where the cards go is the design decision worth reading twice:

- **Replacing a claim: IN PLACE.** The three claimed slots take the three new
  cards. Every other card keeps its slot, its screen position and its keyboard
  letter, so a claim never disturbs a scan someone else is in the middle of.
- **Growing: APPEND.** A board with no set gains a column on the right (or a row
  below, in portrait), which is space the layout already reserved.
- **Shrinking: TAIL-COMPACT.** Above the floor, or with a dry deck, three slots
  have to disappear. Rather than closing the whole board up — which would shift
  every card after the first hole — the last three slots are dropped and their
  survivors move into the holes. At most three cards move, and they are the ones
  at the end of the layout.

The alternative (close up, deal three at the end) was rejected: it reflows the
table on every claim, which in compete happens *to* you several times a minute
while you are mid-thought, and it re-letters every card after the hole.

### The claim flash

A claim substitutes cards **in place**: three leave and three arrive in the same
slots. Locally that lands in one beat and reads fine — over a real connection the
board simply *differs* a moment later, and if your eye was in another corner of
it, nothing said so. Worst in coop, where the claim was someone else's and you
had no reason to be watching those three at all.

So every claim is marked, and `lib/flash.ts` owns the whole design:

| who | mark | why |
|---|---|---|
| the claimer | their three cards take a **black veil**, from the click | they know what they did; colour would drag their eye back to a decision already made. Its LENGTH is the only thing they can't know — the lag |
| everyone else | those same cards fill **light green** | a set was found: that's the outcome |
| everyone | the replacements fill **light yellow** | arriving is news, not an achievement |

Three properties are load-bearing:

- **Fills, not rings.** The first version drew a ring, and a ring is the one mark
  that can't do this job: thin, at the edge of a card, invisible to peripheral
  vision — exactly where the board is when someone else claims.
- **Light tints of a saturated hue.** The symbols are drawn *on* these, and two
  of the three traditional symbol colours are red and green. Dark saturated
  symbols on a light saturated ground stay perfectly legible. (Red was the first
  suggestion for the departing set and would have been the wrong word: red means
  *rejected* everywhere else, so a successful claim flashing red reads as a
  refusal — worst of all to the claimer.)
- **Both clear at the same instant**, and that symmetry is fairness, not tidiness:
  if the claimer's board updated while everyone else still held ghosts, they'd
  see their replacements early — a real edge in compete.

**There is no slow deal.** An earlier version emptied the claimed slots and
landed the replacements one at a time (300ms apart), on the theory that motion
draws the eye. It doesn't, if the moving thing is a thin ring — and it made the
board partly unplayable for the length of the deal, since a card that hasn't
arrived can't be clicked. A player who can think fast should be able to act fast.
The only time anything now costs is the 600ms hold, and that one is deliberate.

**Keyed to a CLAIM, and nothing else.** A new game and a restart just appear,
unmarked. Working out which had happened took three wrong answers, all of them
inferring the cause from the board's shape — how many slots differed, whether the
deck moved, whether the score dropped. Each had a case that broke it and two of
them shipped: a restart one claim in leaves a board differing in only three
slots, so it flashed them as freshly dealt; and a claim on a fifteen-card table
compacts to twelve without drawing from the deck at all. The answer is that the
cause is already *recorded* — a claim writes an event, and `replay_board` deletes
every event — so `PlayArea` reads the log instead of measuring the wreckage. Safe
because the board and the events arrive in one fetch. The third condition is
"there was a previous board at all": on first load an ended game's history is
full of claims, and without it, opening a finished game lit the whole table up.


## 6. Contention — the one genuinely new mechanic

Every other compete game gives racers private boards or private progress. Here
**one board is shared**, and a claim removes cards from under other players.
Two defences, and they are independent:

- **Server:** `submit_set` takes the games-row lock before checking membership
  on the board, so overlapping claims serialize. The loser gets `cards-gone`.
- **Client:** the selection holds **card codes, not slot indices**, and is
  filtered against the **server's** board every render. A card that leaves is
  simply not selected any more, and its letter is free again. Keyed by slot, the
  selection would silently re-point at whatever refilled the hole — and the next
  keystroke would claim a card the player never looked at. Filtered against the
  server board rather than against what's on screen, because during a departure
  hold the screen still shows cards that are already gone.

**Losing a race is not an error**, and until 2026-08-16 it looked like one.
`cards-gone` had no entry in `common/lib/game/errorCopy.ts`, and a key with no
copy is by definition unanticipated — so the one rejection a setgame player
actually meets rendered as a **fault**, the treatment reserved for "visibly
broken while we work". (The code comment and this doc both claimed it was a
pill. Neither had been checked; the game shipped that way.) It is registered
now, `info`-toned: "Someone got there first". `not-a-set` and `hint-in-compete`
are registered too, as belt-and-braces — the FE prevents both — while
`bad-deck` / `bad-claim` / `bad-first-turn` / `game-not-found` / `bad-hint` stay
faults, because reaching one means a broken client.


## 7. Frontend

Standard v3 two-column PlayArea, no layout exception.

**Board.** Three rows of cards, growing rightwards, **left-aligned** rather than
centered: a centered board slides left when a deal adds a column, which is a
full-table reflow at the moment everyone is mid-scan. Left-aligned, the extra
column arrives in space the column already reserved and nothing on screen moves.

**Card sizing** (`Board.module.css`) is the smallest of three limits: a per-card
cap, the height three rows may occupy, and the width `--cols` of them may
occupy — where `--cols` is the **widest the board has been**, a high-water mark,
so cards can shrink once and never grow back. The first draft sized for seven
columns always; measured against the real layout that was wrong, because beside
the info column the width term binds and every ordinary game paid for a board
almost nobody sees.

**Cards** are inline SVG: one visual channel per attribute — count is how many
symbols, shape is which path, color is the hue, shading is the fill (solid, a
`<pattern>` of stripes, or open). Nothing on the face is decorative. The three
paths are ours (`lib/shapes.ts`), not the CC BY-SA Wikimedia file's, and the
logo reuses them so it can't drift from the board.

**Proportions are measured off a real deck, not chosen.** A symbol is **2.1**
times as tall as it is wide; the first version was 2.5 and looked stretched
beside the real thing. The card follows: 100:94, down from 100:112, which keeps
the same margin above and below a now-shorter symbol. Neither is a playing
card's 5:7 — a real card is tall because it fans in a hand and has a back; ours
has neither, and at 5:7 the symbols sat in a lot of empty white.

The reshape paid for itself on **portrait mobile**, where the board is
height-bound: a shorter card means a wider one, measured at 390×844 as **93px →
111px**. `SYMBOL_LAYOUT.height` and the printer's symbol height are both
*derived* from the one aspect number, so nothing can stretch the shapes by
being edited alone.

**Input.** Click a card, or type the letter under it. No text entry at all.

**Info column**, in the canonical order: one row of counts (`Found · Deck
remaining · Hints` — the third only in coop), the turn line (turn games only),
the **last-set panel**, the OpponentStrip in compete, the actions, the setup
recap, then the **turn log**. There is deliberately no count of the cards
face-up: they are right there to be looked at.

### The turn log

Rows are **pictures**, not text: a set has no name, and spelling one out ("2 red
striped diamonds · 1 red solid oval · 3 red open squiggles") is three lines of
prose for something the eye reads instantly as three cards. So a row is `#n`, up
to three mini cards, and who — the same components the board draws, at
`--card-w: 1.9rem`.

**Hints are rows too**, tagged `Hint` and carrying the shared **amber**
(`partial`) bar rather than the neutral one — help taken, which is stackdown's
precedent for a cheat request. Without the tag a hint's one-to-three cards read
as a find, which is exactly backwards. A hint row holds what the asker was
*shown*, so it has one, two or three cards depending on how far up the ladder
they went.

The **heading counts**, borrowed from the word-list games: `Found: 7 · Hints: 3`
on the All filter, the same two scoped when a player is picked — and in compete
just `Found: 7`, since there are no hints there to count.

The **history viewer** is the shared one (`useHistoryViewer`), and it is a plain
lookup rather than a replay — `lib/history.ts` reads `board_after` off the row
and highlights that event's cards. See §3 for why that column is stored.

**Coop never shows a per-player breakdown on screen** — not while the game runs,
and not at the terminal either. Mid-game, individual counts would quietly turn a
cooperative game into a visible contest; at the terminal a breakdown is *pushed*
at the table whether or not anyone wanted the comparison, and coop shouldn't end
on a scoreboard nobody asked for. What replaced it is the log's **player
filter**: the same two numbers, scoped to whoever you pick, *pulled* by the
person who went looking. The printout does carry the breakdown in both modes —
nothing is live on paper, so the reason to hold it back doesn't apply
(`pdf/model.ts`).

### The keyboard

A letter under every card, typing toggles it, Backspace clears, and the third
selected card submits. `useGlobalKeyHandler`, not the shared `useCaptureKeys` —
that helper accumulates *text*, and a letter here is a toggle on a card, not a
character appended to a word.

The letters are a **fixed 3 × 7 grid** (`lib/letters.ts`), of which only the
dealt columns are shown:

```
A  B  C  D | E  F  G
H  I  J  K | L  M  N
O  P  Q  R | S  T  U
```

Two properties that pull against each other, both satisfied: letters read
left-to-right, and **a letter never changes which card it means**. Numbering
across the current width would re-letter eight of the twelve cards the moment a
column arrived — and a player typing from muscle memory would silently claim a
card they never looked at. The cost is that rows are not contiguous (row two
starts at H), which nobody has to know: a letter is an address to read off a
card, never a sequence to recite.

**Tab is swallowed outright.** Nothing on this surface takes focus, so a Tab
that did anything would only move a focus ring somewhere unusable.

### The palette

Two, chosen at setup, defaulting to **traditional** (Set's own red / green /
purple). The alternative is Okabe–Ito **blue / orange / magenta**, which stay
separable under red-green color vision deficiency.

It matters more here than the same option would in most games, because **two
cards can differ only by color** — the other three attributes are identical on
them, so shape and shading cannot rescue a pair you can't separate. Magenta
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
move, not a rescue. The info column keeps its own button; both are the same
component fed the same `hintLabel`, so they cannot come to say different things.
`Deck remaining` is the one readout the bar drops: it is the longest and the
least urgent, and the bar must never wrap.

The bar is paid for twice over. Its height comes out of `--avail-h` (the shared
convention), and the ~9px of card width that cost is bought back by **cropping
the card's own top/bottom whitespace**: mobile draws a 100:86 card instead of
100:94, and the face is rendered `preserveAspectRatio="slice"` so the shorter box
trims margin rather than shrinking the symbols. Measured at 390×844, cards are
111px either way.

In **portrait** the board **transposes**: three columns, growing downwards.
Growing sideways on a ~366px width would divide it by up to seven, leaving ~50px
cards on the deal that two games in three reach. Turned, cards measure **111px**
— the same at twelve as at eighteen, because space for **eighteen** is reserved
from the start, so a deal resizes nothing.

**Reserved means HELD, not just sized for.** The card-size math alone only made
the cards small enough that six rows *would* fit; the board element still hugged
the rows actually dealt, so the pill under it — and the verdict at the end — sat
beneath the last row and got pushed down the moment a deal added one. The board
carries a `min-height` of the reserved rows (with `align-content: start`, or the
grid hands the slack to the rows and they drift apart), so growing 12 → 18 moves
nothing below it at all. Twenty-one rows past the floor is the documented
exception: it shrinks the cards and reflows once.
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
want. A counting title duplicates the status line and changes every few seconds,
so it can't be used to REFER to a game. A handle that never moves can — "look at
#A3F19C" is something one player says to another, and something to search a club
list for.

### Print to PDF

**The log, and only the log** — per-player totals, then every claim and hint in
one sequence, in both modes, each row a picture of its cards.

This game has **nothing to print and play**. A setgame board is a shuffle that
turns over every few seconds, so a printed one is a photograph of a moment
nobody can return to; what survives is what happened. Hence the log, and hence
the totals printing in both modes — the screen holds coop's breakdown back until
the terminal so a cooperative game doesn't become a running scoreboard, and
nothing is live on paper, so that reason doesn't apply.

The printer draws its own two-column flow rather than composing the shared
`drawTurnLog`, whose row is `{ seq, who, text }`. The column *geometry* is still
shared (`twoColGeom`), so the page lines up with every other printout. How the
cards themselves survive the trip — the clipped hatch, the card size, and two
geometry mistakes worth not repeating — is in
[pdf.md → Shading on paper](../pdf.md#shading-on-paper--setgames-hatch-and-why-the-shortcuts-failed).


## 8. RPCs

| function | notes |
|---|---|
| `create_game(target_club, setup, player_user_ids, mode)` | inline shuffle — **no edge function**, since a board is a shuffle. Deals the floor, then runs the deal rule so the opening board always holds a set. |
| `submit_set(target_game, cards)` | the only mid-game move. Locks the games row, validates, removes, refills to a fixpoint, writes the `claim` event with its `board_after`, scores, checks the terminal. |
| `record_hint(target_game, cards)` | coop only, and **the tally, not the hint** — it charges the asker and writes the event. Takes the games row lock too, so a hint and a claim can't take the same two rows in opposite orders. |
| `concede` / `submit_timeout` / `end_game` / `replay_board` | the standard four. |
| `_third` / `_is_set` / `_find_set` / `_find_set_with` / `_deck_size` / `_board_min` / `_deal_to_playable` / `_finish` | internals. `_deck_size` is the one granted to `authenticated`, because the `games_state` view is `security_invoker` and its body runs as the reader. |

### Hints are private, computed on the client, and coop-only

**The hint itself is never stored or sent.** It can be computed locally, and
that is the whole design: the board is face-up and `lib/cards.ts` holds the same
algebra the server does, so a hint is a local search rather than a round trip.
Two things follow — the ring appears on the keystroke (it also *selects* the
cards, so a lag would be felt), and there is no private column for the server to
mask, which is why this game still has no per-peer masking anywhere.

**Only the asker sees the ring.** An earlier draft wrote it to the game row so
it landed on everyone's board; that is a different game — being handed a card
you didn't ask for is being played *for*. Everyone is still charged, because the
count is the table's, and the log names who asked.

The **ladder** is one more card of the SAME set per press: one, two, then all
three — and the third rung needs no special case, since three selected cards
already claim. Growing the same set matters; recomputing from scratch could
point at a different set on the second press and leave the player chasing two
answers.

Two bugs this shape produced, both fixed and both worth knowing:

- **The full ring must return `null`.** Returning the set again looks harmless
  and isn't: a complete ring has already fired its claim, so a fast fourth press
  computed from a board about to change and re-submitted the same three cards.
  The server saw both halves — `bad-hint`, then `cards-gone`.
- **Lock-order inversion.** `record_hint` inserting an event takes a ShareLock
  on the referenced games row; a concurrent `submit_set` holds that row and
  wants the events table. Rapid pressing deadlocked (40P01). Both RPCs now take
  the games row `for update` first, in the same order.

Banned outright in compete per the priced-help rule — free generative help
decides a race. The button still renders there, disabled, with "No hints when
competing", rather than vanishing.

**`replay_board` keeps the deck** and rewinds `deck_pos`, so the cards come back
in exactly the order they came the first time. That is why the deck is stored
whole and frozen rather than drawn lazily: a reshuffle would make Restart just
another New game. The title survives, because it names the game, not the run.


## 9. Setup

| knob | values |
|---|---|
| `deck` | **full** (81) · **junior** (27 — shading dropped, all solid, dealt nine at a time) |
| `palette` | **traditional** (default) · colorblind |
| `timer` | the standard optional countdown |
| `coop_style` (+ `first_turn_user_id`) | free-for-all (default) · turns — see §4 |

Junior is the difficulty dial. Dropping an attribute is the real Set Junior's
own idea, and it is a genuinely different game to scan rather than a slower
version of the same one. It is closed under `third` — the completing card of two
solid cards is itself solid — which is why nothing downstream branches on it;
only the deal size differs (9, ceiling 12).


## 10. Tests

- **`lib/cards.test.ts`** — exhaustive: all 81 codes round-trip, exactly 1080
  sets, `third` total and symmetric, no attribute ever two-and-one. The board
  ceiling is pinned by a **planted 20-card cap** (every other card in the deck
  extends it into a set), and junior's ceiling is **proved outright** by an
  exhaustive backtracking search — a 9-card cap exists, a 10-card one does not.
- **`lib/letters.test.ts`** — the letters never move when the board grows, plus
  the rejected scheme spelled out concretely so the assertion has something to
  discriminate against.
- **`lib/flash.test.ts`** — the slot-by-slot diff behind the claim flash: a
  claim that grows the board, one that shrinks it, and the tail-compaction case
  where a card MOVES into a hole (a set-difference finds nothing new there, and
  those three used to land unmarked).
- **`lib/hint.test.ts`** — the ladder grows one card of the SAME set per press,
  and returns `null` once the ring is complete (the rapid-press regression).
- **`lib/selection.test.ts`** — the toggle, the fourth-card refusal, and the
  contention case: a card claimed out from under the selection drops out of it.
- **`lib/history.test.ts`** — the viewer shows the board the row RECORDED rather
  than the live one, rings that turn's own cards, and names how far a hint went
  ("Turn 1 — hint (1 of 3)").
- **pgTAP** (`supabase/tests/setgame/`) — gameplay and its three rejections, the
  **stolen-card** contention case, the tail-compaction on a **planted 15-card
  board**, a whole game played out through the real RPC, compete ranking and
  ties, the conceder rule, the timeout adjudications, hints, replay, the deck's
  unreadability, and **turn-by-turn** (both gates, and that neither a hint nor a
  refused claim passes the turn).
- **e2e** — both input routes, the local rejection, contention across two
  sessions, the portrait transposition, the planted 21-card board, print, and
  the two-client turn hand-off (board fade + both pills, on both screens).
- **`e2e/setgame-flash.e2e.ts`** — the claim flash, on the two cases only a real
  board can produce: a **fifteen-card** table, where claiming compacts to twelve
  and the cards that MOVE must still be marked; and a restart after exactly
  **one** claim, which is the discriminating case (two claims move six slots,
  enough that the old guess called it a re-deal by luck). Plus opening a
  finished game, which must not deal itself out. Its positive assertions poll
  rather than sleep — the marks live 600ms and 1200ms, and a fixed wait would be
  racing their own lifetime.

Two of those are planted on purpose. A 15-card board arises in ~3% of deals and
a 21-card one in ~1 in a million; a test that waited for either would test
nothing almost every run, and the layout they exercise is exactly the one nobody
would file a bug report for.


## Deferred

- **`target_sets` for coop** — an opt-in finish line, spellingbee's machinery.
  Only bites in a timed game. Nobody has asked for it.


## Won't do

- **Calling "no set".** The physical game has a variant where spotting a dead
  board scores. Our auto-refill makes a dead board unobservable, which is the
  right default and closes the variant off.
- **A penalty for a wrong claim.** There is nothing to punish: the FE holds the
  whole board, so a non-set never leaves the client. Adding one would mean
  deliberately shipping invalid claims to the server to have them rejected.
