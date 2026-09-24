# Game features

This doc categorizes our games by their features — some are code-features, some
are general about-the-game qualities.

Two kinds of category:
- **Dimensions** — every game has exactly one value; a dimension should list all
  16 games (a game missing from one is a gap to notice).
- **Tags** — a game either has the feature or not.

`*` = a future / possible feature (not built).

Games (code = brand):

| code | brand | codename |
|---|---|---|
| PN | PsychicNum | psychicnum |
| FB | FreeBee | spellingbee |
| TS | TinySpy | codenamesduet |
| WK | WordKnit | connections |
| MC | MothCubes | boggle |
| RA | RackAttack | scrabble |
| SD | StackDown | stackdown |
| SS | SyrupSwap | waffle |
| MG | MonkeyGrams | bananagrams |
| WN | WordNerd | wordle |
| CP | CrossPlay | crosswords |
| MW | MooseWheel | wordwheel |
| WW | WordWire | wordiply |
| PP | PaulPath | strands |
| SB | SnakeBox | letterboxed |
| HT | HareTrigger | setgame |

# Dimensions

## Modes offered

- **Coop + compete pair:** PN FB WK MC RA SD SS WN CP MW WW PP SB HT
- **Coop only (no compete):** TS
- **Compete only (no coop):** MG

## Player counts

Each manifest's `numberOfPlayers: [min, max]`, per mode, beside the cap its
`create_game` actually enforces. Both ends are required — an unbounded max is
not allowed, because the FE rendering, the realtime channel load and the chat
surface all assume a bounded count.

**Coop starts at 1 and compete at 2**, everywhere, and for one reason: compete
needs an opposing PLAYER. A countdown timer does not make a game compete, so a
solo club sees only coop Start buttons. The two exceptions both earn it —
scrabble's compete seats an AI opponent (`aiOpponent: true`), and bananagrams is
compete-only and plays fine alone as a race against the clock.

| game | brand | coop | compete | server cap |
|---|---|---|---|---|
| codenamesduet | TS | `[2, 2]` | — | exactly 2, inline |
| psychicnum | PN | `[1, 6]` | `[2, 6]` | 6 |
| connections | WK | `[1, 6]` | `[2, 6]` | 6 |
| spellingbee | FB | `[1, 6]` | `[2, 6]` | 6 |
| wordwheel | MW | `[1, 6]` | `[2, 6]` | 6 |
| waffle | SS | `[1, 6]` | `[2, 6]` | 6 |
| wordle | WN | `[1, 6]` | `[2, 6]` | 6 |
| stackdown | SD | `[1, 6]` | `[2, 6]` | 6 |
| wordiply | WW | `[1, 6]` | `[2, 6]` | 6 |
| strands | PP | `[1, 6]` | `[2, 6]` | 6 |
| letterboxed | SB | `[1, 6]` | `[2, 6]` | 6 |
| setgame | HT | `[1, 6]` | `[2, 6]` | 6 |
| bananagrams | MG | — | `[1, 6]` | 6 |
| boggle | MC | `[1, 8]` | `[2, 8]` | 8 |
| crosswords | CP | `[1, 8]` | `[2, 8]` | 8 |
| scrabble | RA | `[1, 4]` | `[1, 4]` (AI) | 4 |

**Six is the house default and three games depart from it**: boggle and
crosswords take 8 (a bigger board absorbs more people), scrabble takes 4 (a
100-tile bag divided by a 7-tile rack).

**Where each bound is actually enforced**, since the three are not the same
mechanism:

| bound | who | how |
|---|---|---|
| at least 1 | every game | `common.create_game_row` raises **PN059** |
| the max | 15 games | `common.require_player_count_max(ids, cap)` raises **PN041**; codenamesduet keeps its inline exactly-2 instead |
| compete's min of 2 | 10 games | each `create_game`'s own `< 2` check. **setgame, stackdown and waffle have none** — their manifests say `[2, 6]` and their servers accept 1. bananagrams and scrabble need none (their min is 1) |

Every manifest max agrees with its server cap. The compete-minimum row is where
the three are short — the FE hides those Start buttons in a solo club, so it is
unreachable through the app, but it is a client-only bound and all three
manifests' own comments claim the RPC enforces it.

## Co-op interaction (games that have coop)

The DEFAULT pacing; nine of the free-for-all games also offer opt-in
turn-by-turn play at setup (see the "Opt-in turn-by-turn coop" tag below).

- **Free-for-all (shared board, everyone acts anytime):** PN FB WK MC RA SD SS
  WN CP MW WW PP SB HT
- **Turn-based (fixed seats, alternating):** TS

## Board origin

- **Generated fresh at start:** PN FB TS MC SS WN MW WW SB HT (MW samples from
  a pangram-seed table, WW from candidate bases, SB from a chained word-pair
  seed table re-partitioned per game — but the board itself is built fresh per
  game, not picked whole)
- **Pre-generated puzzle library:** WK SD PP (`strands.puzzles`, the NYT
  archive)
- **Open/empty grid you build on:** MG RA
- **Multi-source (the library, a fetched NYT or Guardian puzzle, or an
  upload):** CP

## How the board gets built (code path)

Where to look when a board is wrong — distinct from "Board origin" above.

- **A dedicated `<codename>-build-board` edge fn computes the board, then calls
  `create_game`:** FB MC SS MW WW SB
- **Built inline in `create_game` (plpgsql):** PN WN (sampling `common.words`),
  TS (sampling `codenamesduet.word_pool`), RA MG (a tile distribution), HT (no
  sampling at all — a setgame board is a SHUFFLE, so `create_game` deals one
  and runs the deal-three rule until it holds a set)
- **Picked from a CLI-imported library table:** WK (`connections.puzzles`) SD
  (`stackdown.boards`) PP (`strands.puzzles`)
- **Multi-source:** CP — the CLI-imported `crosswords.puzzles` library, a
  puzzle fetched on demand by the `crosswords-import-nyt` or
  `crosswords-import-guardian` edge fn, or an uploaded file; the fetched and
  uploaded ones are stored inline on the game

## Board change during play

- **Unchanged — you just find words in it:** MC FB MW PP SB (PP's tiles LOCK as
  words are found — the letters never change, but a found word's cells leave
  play, which is how the board is "consumed"; SB's letters get marked COVERED,
  but never change and never leave play)
- **Fill / annotate — fixed cells, contents change:** PN TS SS WN CP WW
- **Shrinks — tiles removed/collapsed as you solve:** SD WK
- **Grows — you add tiles to it:** RA MG
- **Replaced — cards leave and new ones arrive IN THEIR PLACE:** HT (its own
  value, not a mix of the two above: the board keeps its size across a claim,
  and the slot a card left is the slot its replacement lands in. It also grows
  by a column when it holds no set, and shrinks once the deck is spent.
  Substituting in place is invisible over a real connection, so every claim is
  MARKED — the departing set held briefly and lit, the arrivals lit as they
  land, and the claimer's own three dimmed instead, since they already know.
  See docs/games/setgame.md → The claim flash)

## Primary input

- **Type a word (keyboard grab):** PN FB MC MW SB (board letters only; the
  previous word's last letter is a locked seed the entry re-derives each word)
- **Type free text (a clue field):** TS
- **Type / click a letter into a slot:** RA SD SS WN CP WW
- **Click tiles to select:** WK, PP (a board repeats letters, so a typed string
  can't identify a path), HT (three cards; also typable, one letter per card —
  see docs/games/setgame.md → The keyboard)
- **Drag tiles to place:** MG RA

(TS also clicks board cells when guessing; CP/WN/WW are keyboard-first; PN's
guess is a board word, typed or picked by clicking its tile; FB/MW/SB tiles are
also clickable — SB submits on re-clicking the word's last letter; MG also
takes click-a-cell-and-type; WN + WW share the on-screen `GuessKeyboard`.)

## Solution & trust model — where the answer lives, who validates

- **Hidden server-side solution, revealed at terminal:** PN SD WN CP PP, and SS
  in compete (CP's `export_solution` hands any player the full grid at any time
  — a deliberate, member-gated exception; `reveal_cells` shows cells mid-game)
- **FE-readable all along, but not shown ("FE-knows"; the server still
  validates moves — devtools could peek, and per the trust model that's
  fine):** TS WK SB (the whole playable list ships too, for the FE hint search;
  display-gated behind the Reveal), and SS in coop (`_solution_for` hands the
  coop client the solution during play)
- **FE holds the full word list, self-scores ("trusting-commit"):** MC FB MW WW
- **No fixed answer — the server just validates each move's legality:** RA MG
  HT

## Hidden-solution machinery (the schema pattern behind the row above)

- **A column-level grant blocks the solution column on the base table; a
  `games_state` view / helper reveals it:** PN (`secrets`) SD SS
  (`_solution_for`, terminal-gated in compete only) WN (`_target_for`) CP PP
  (`_solution_for`)
- **Everything readable; the FE just doesn't render it mid-game:** TS (both
  key cards) WK (`board.categories`) WW (scores + the best word) SB (the seeded
  pair + playable list; the FE's local reveal toggle gates display)
- **Nothing hidden by design (lists ship for local validation / no fixed
  solution):** MC FB MW RA MG
- **HT is the odd one:** no solution exists to hide, yet it has the roster's
  simplest shield — a column grant on the UNDEALT DECK'S ORDER, with nothing
  behind it. No definer helper, and no terminal reveal, because the leftover
  order is of no interest once the game is over.

(Orthogonal: compete games also hide *opponents'* mid-game moves via RLS on the
events table, opening at terminal — that's about peers, not the solution. SB
does it with a COLUMN grant instead: `players.chain` is unreadable on the base
table and reaches the FE only through `players_state`'s per-mode mask.)

## Win / score metric shape

- **Points accumulation (high score wins; FB/MW via a rank ladder):** RA MC FB
  MW HT (sets claimed; in coop the same count is the team's, and the WIN is
  reaching the natural end rather than passing a score)
- **Binary solve (you finished the puzzle, or didn't):** TS WK SS WN CP
- **Count to a target:** PN (find the 3 secrets) SD (clear 6 words) PP (find
  every theme word — which, since the words tile the board exactly, is the same
  as consuming all 48 cells) SB (cover all 12 letters within the word cap)
- **Race to empty your hand:** MG
- **Best-word comparator (no scalar score; length score → letter count →
  time):** WW

## Move / guess budget

- **Fixed guess budget:** WW (5, hardcoded) WK (4 mistakes)
- **Budget chosen at setup:** WN (5–8 guesses, default 6) PN (3/5/7/9 guesses)
  TS (9/10/11 turns, default 9) SS (swaps: par + extra; the form offers 3, 5 or
  8 extra, the server accepts 0–15)
- **A cap you can't bust:** SB (words: par 2 + extra, extra 0–5 at setup,
  default 3 — but undo REFUNDS, so it's a shape constraint, not a spendable
  budget)
- **Unbounded — play to terminal / timer:** MC FB MW RA SD MG CP PP HT

## Seat & information model

- **Variable N players, full shared info in coop:** PN FB WK MC RA SD SS WN CP
  MG MW WW PP SB HT (up to 6, except MC and CP at 8 and RA at 4 — see Player
  counts)
- **Fixed 2 seats, asymmetric info (each partner sees a different key):** TS

## History log in the info column

- **EventLog (chronological turns):** PN TS WK RA SD SS WN WW PP SB HT
- **WordList (alphabetical finds):** MC FB MW
- **Neither:** MG CP

(WW's log is the record its board is not: the board shows five accepted words,
the log shows every try with its reason. HT's rows are PICTURES of the three
cards, not text — a set has no name. Its heading borrows the WordList counts
idea: "Found: 7 · Hints: 3".)

## Realtime sync

- **Standard refetch-on-change (`useRealtimeRefetch`):** everyone not called out
  below
- **Per-cell CDC direct-apply + peer cursors:** CP
- **Broadcast-coupled peer tile-selection:** WK

(RA + CP also broadcast a coop "show my move / peer flash"; the scratchpad is
broadcast where enabled. Load-bearing for all of them: every table a channel
subscribes to must be in the `supabase_realtime` publication — see
docs/supabase.md.)

## PlayArea layout

- **Standard two-column (the board column hugs the board, fixed-width info
  column):** PN FB TS WK MC RA SD SS WN MW WW PP SB HT
- **Exceptions:** MG (the board FILLS the column + zoom/scroll; the hand +
  peel/dump live in the info column — docs/playarea.md) CP (a keyboard-first
  grid; the clue lists fill the info side — docs/games/crosswords.md)

# Tags

## Opt-in turn-by-turn coop (the common turn-order primitive)

PN WN WK SS WW RA (coop) PP HT SB (the strongest fit on the roster — the chain
hands off natively, "I ended on T, you start on T"; undo COSTS the turn there).

A per-game setup choice — `coop_style: 'turns'` — that rotates moves through
the players instead of free-for-all. Discrete-move coop games only; the shared
primitive lives on `common.games.current_turn_user_id` +
`common.game_players.turn_seat`. See docs/common-schema.md → Turn-order.
Distinct from TS, whose turns are fixed at the gametype level, not an opt-in.

## Word-finding as core play

MC FB MW (find many words), WW (find the longest word), PP (find the words
HIDDEN in a grid — the only one where a word's PLACEMENT, not just its letters,
is what you're looking for).

## Shared entry and submit machinery (from `common/` and `shared/`)

- **`useFoundWordSubmit` (`shared/found-words`; shipped-list lookup +
  optimistic trusting-commit):** FB MC MW WW
- **`WordEntryArea` (the typed-word box + Delete/Submit row, with capture):**
  PN FB MC MW SB
- **`WordEntryRow` directly (the row without the capture keyboard):** SD PP
- **`useCaptureKeys` directly (bare-keys grab, no focused input):** FB MC WN MW
  WW
- **`GuessKeyboard` (`shared/onscreen-keyboard`; the on-screen QWERTY):** WN WW

(PN + SB get their capture via `WordEntryArea`; WN/WW letters land on the board,
not a box. SB deliberately skips `useFoundWordSubmit` — a chain append isn't a
found word, so its validation is `lib/board.ts` + a plain RPC.)

## Hints

PN SD WK RA CP PP TS HT SB, and SS* FB* (hint for the pangram) MC* (first 2
letters?)

- **TS:** the AI clue suggestion is logged as a `hint` event
  (`codenamesduet.log_hint`), as RA's suggester counts as one.
- **HT:** coop-only, and PRIVATE — the ring shows only to the asker, since
  being handed a card you didn't ask for is being played FOR; the COUNT is the
  table's, and the log names who asked. Computed on the FE, which can: the board
  is face-up and `lib/cards.ts` holds the same algebra the server does, so
  `record_hint` records who asked and which cards they were shown (checking
  they are a genuine partial set). Three asks walk a ladder to a full set, and
  the third one claims it.
- **SB:** two rungs, coop-only: 'hint' = length + first letters, 'spoiler' =
  the word; computed by an FE breadth-first search over the shipped playable
  list, logged server-side, never penalized.
- **PP's is the only EARNED one:** valid non-theme words fill a bar, and
  cashing it rings a theme word's tiles without giving their order.

## AI

TS (clue suggester) RA (suggester + opponent) CP (explain-cryptic-clue). TS and
CP call Claude; RA's two are a local trie search, not an LLM.

## Can zoom the board

MG

## Leans on the shared dictionary (`common.words`)

Everything except TS WK CP HT. (TS draws from its own `codenamesduet.word_pool`,
WK and CP bring their own puzzle sources; HT is the only game on the roster with
no WORDS in it at all — its deck is generated arithmetic.) PP is a hybrid: its
THEME words come with the puzzle, and only the hint words are looked up in
`common.words`.

- **FE validation via a shipped list built from it:** MC FB MW WW (SB ships a
  list too, but the server re-validates every move against it)
- **Server-side move validation:** RA MG WN PP SB
- **Board build / secrets / hints:** PN FB MC SD SS WN MW WW SB (SB's seed pool
  and each board's playable list are both computed from it)

## Reveal-at-terminal (shows the answer when done)

PN TS WK SD SS WN CP PP SB WW — the shared reveal control (`useSolutionReveal`
+ `act-reveal`); SB's is the seeded two-word solution, and a win opens it
automatically. MC FB MW reveal their missed words in the word list instead.

(A UX tag; the enforcement varies — see the trust and machinery dimensions. For
TS WK the data was FE-readable all along; for the trusting-commit games it is a
display choice, not a security boundary.)

## Restart (`<gametype>.replay_board`)

Every game has `replay_board`. Fifteen also offer Restart in the terminal row
(`act-restart`); MG offers it as a menu row only.

## New game from the terminal row (`act-new-game`)

Everything, and all sixteen also carry it as a game-menu item. CP is the odd
one: its button opens the club's SETUP dialog (`/c/<handle>?new=<gametype>`)
instead of creating a game directly, because `setup` names a puzzle rather than
a shuffle. PP starts the next puzzle nobody at the table has played
(`next_puzzle_for_club`).

## Turn-history replay (`useHistoryViewer`)

TS WK PN RA SD SS WN WW PP SB HT

(PP's and WW's are FILTERS — PP's board strictly accumulates, so "the board at
turn N" is a slice of the log rather than a reconstruction. SB's is a FOLD over
its event stream — played pushes, undone pops, cleared empties — which is why
its log records retreats instead of deleting rows. HT's is the only LOOKUP: it
stores `board_after` on every event, because reconstructing a setgame board
means re-running the deal rule, and a second implementation of that on the FE
would eventually show a board that never existed.)

## Print to PDF

All sixteen games print (`common/pdf/doc.md` has the per-game table + body
families). HT prints THE LOG and nothing else — per-player totals, then every
claim and hint as PICTURES of the cards; its board is a shuffle that turns over
every few seconds, so a printed one is a photograph of a moment nobody can
return to. (PP + SB print one TRACK PER BOARD like WN/SS — coop is one column,
compete one per player — and move their color encodings onto shape/weight,
since on a mono printer two hues are one gray: PP's purple/gold becomes line
weight + dashing, SB's covered-letter green becomes a heavy black ring and a
bold glyph.)

## Player-tunable difficulty

- **Dictionary/difficulty band at setup:** PN FB MC RA SD SS WN MG MW WW PP SB
  (PP's + SB's bands run the OTHER way: a wider dictionary means more hint words
  / more escape routes off an awkward tail letter, so a HIGHER band makes them
  easier)
- **A smaller DECK instead of a dictionary band:** HT (junior — shading
  dropped, 27 cards, dealt nine at a time)
- **More turns:** TS (9/10/11, the rulebook's easier missions)
- **The puzzle itself:** WK, CP (the NYT weekday is its difficulty)
- **Hand-pick the board instead of a random one:** FB MW (a center + the
  others; MW also has a "unique letters only" constraint) MC (the whole grid)
  SB (the four sides) WW (the base). All but WW also print the board in the
  setup recap, random or hand-picked, so a board you liked can be copied into
  the next game; WW's base is already the game's title.

## Timer

Optional at setup for every game. On timeout, a compete game resolves a winner
from current standing in MC (only with no target score; with one, a timeout is
a loss), RA, WW, SB (most letters covered → fewest words → co-winners), HT
(most sets, ties intact), and SS WN PP (from whoever had already solved:
fewest swaps / fewest guesses / fewest hints). Everywhere else a timeout crowns
nobody (a coop loss, or a compete leaderboard frozen with no winner).

## Can win after conceding

MC* (on score) FB* (on score) MW* (on score) — today a conceder always forfeits
the win, even if their banked score would top the board.

# Mobile suitability

A dimension: what a game needs on a touch device (docs/mobile.md → Input is the
primary axis). Every game but MG has the phone layout.

- **Tap-only, strong on a phone:** PN FB WK MC SD SS WN MW WW PP SB HT
- **Tap, plus a transient OS keyboard (the clue):** TS
- **Keyboard-required — the phone layout, but entry needs a hardware keyboard;
  deliberately not device-gated:** CP RA
- **Desktop-only, hard-blocked on all touch via the shared
  `DeviceBlockNotice`:** MG

# Clear win condition in compete

(TS is coop-only, so it has none.)

- **PP:** solved the board on the FEWEST HINTS USED, earliest solve breaking a
  tie (the race does NOT end on the first solve — a later finisher can still
  spend less)
- **PN:** guessed all secrets (race ends)
- **FB:** first to reach the target rank (race ends)
- **WK:** first to find all categories (race ends)
- **MC:** first to reach the target share of the required words' score (race
  ends); with no target, the top score at the timeout
- **RA:** highest score when a player goes out (bag and rack empty) or every
  seat passes (game ends)
- **SD:** first to clear the stack (race ends)
- **SS:** fewest swaps among the solvers, earliest solve breaking a tie (race
  continues until nobody is still racing)
- **MG:** first to place all tiles legally (race ends)
- **WN:** fewest guesses to solve (race continues)
- **CP:** first fully-correct grid wins (race ends)
- **MW:** first to reach the target rank (race ends)
- **WW:** best comparator score once everyone has spent 5 guesses (not a race)
- **SB:** first to cover all twelve letters within the cap (race ends); a
  timeout instead resolves on most letters covered → fewest words → co-winners
- **HT:** the most sets when the deck runs dry (not a race — nobody finishes
  alone), and a TIE IS A TIE: co-winners, with no speed tiebreak
