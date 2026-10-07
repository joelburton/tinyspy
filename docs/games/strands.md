# strands (PaulPath)

A NYT-Strands-style word search: an 8×6 board of letters hiding a set of **theme
words** plus a **spangram** — the one that runs edge to edge and names the
theme. You trace a word by clicking its letters in order. **Hint words** — real
words that aren't puzzle words — earn hint points; enough of them buys a hint.

"strands" is the codename (as "codenamesduet" is for Codenames Duet). The
user-facing brand is **PaulPath**, which lives only in the manifest's `BRAND`
const; gametype / schema / folder are all `strands`.

**Sibling pair** — `strands_coop` + `strands_compete`, one schema, one folder,
mode branching at render time on `gd.mode`. See [Compete](#8-compete).

For the shared layer see [`common.md`](../common.md); for play-surface
conventions [`playarea.md`](../playarea.md).

### Naming the words

Four words, used the same way in code, comments and docs (Joel, 2026-10-05):

| term | means | in the data |
|---|---|---|
| **puzzle word** | any word the puzzle hides: the theme words and the spangram | `puzzle.puzzleWords` in the blob; `result in ('theme', 'spangram')` |
| **theme word** | a puzzle word that isn't the spangram | `solution.themeWords`; the `theme` result |
| **spangram** | the puzzle word that runs edge to edge and names the theme | `solution.spangram`; the `spangram` result |
| **hint word** | a real word that isn't a puzzle word: it puts a point on the hint bar | the `hint_word` result |

A duplicate, a word shorter than the setup's shortest and a word the
dictionary lacks are none of these; they keep their results' names. The word a
spent hint rings is a puzzle word; nothing calls it a "hint word".

Names in the code say which kind they hold: `puzzleWords`,
`foundPuzzleWords`, `nFoundPuzzleWords`, `missedPuzzleWords`, `GPuzzleWord`.
A bare `word` is the word a trace spelled, whatever it turned out to be
(`event.word`, `answer.word`). `hintPoints` is the hint bar — it caps at the
hint cost and empties when a hint is cashed — and not a count of hint words,
which nothing on the page shows.

---

## 1. The two invariants

Both were **verified against the real feed**, not inferred from the rules, and
both are load-bearing.

### Adjacency is 8-way

Consecutive tiles may touch diagonally as well as orthogonally. Every sampled
puzzle uses diagonal steps (3–15 of ~40), so a 4-way tracer cannot enter most
boards at all. From 2025-06-15, `AMBITION` runs
`A[2,3] → M[1,3] → B[1,2] → I[0,1] → …` — that third step is a diagonal.

The rule lives once, in
[`src/strands/lib/board.ts`](../../src/strands/lib/board.ts), and both the
puzzle importer and the FE import it from there. The [oracle test](#the-oracle)
pins it.

### The puzzle words tile the board exactly

Theme words + spangram cover all 48 cells, each exactly once, with no overlap.
Consequences the code leans on rather than re-deriving:

- **Winning IS consuming the board.** "Every puzzle word found" and "every cell
  used" are the same statement, so `submit_path` counts words (the cheaper half)
  and `ending_test` checks the other half actually holds.
- **Found tiles lock**, so the pool of remaining hint words shrinks as you
  progress — a difficulty curve that falls out of the geometry rather than a
  knob.
- **It's an import guard.** A puzzle whose coords don't tile 48 cells is
  malformed and is refused.

---

## 2. Architecture: server-authoritative, solution shielded

Deliberately **not** connections' FE-knows-the-answer.

connections went FE-knows because its evaluator is a ~15-line pure function, and
server-side evaluation would have meant building column-grant + PL/pgSQL
infrastructure *for that alone*. strands has no such choice: classifying a
traced word needs a dictionary lookup against `common.words`, so a round trip is
paid regardless. Once it is, theme-matching in the same RPC is free — and the
puzzle's entire content, *where the words are*, stays server-side.

The usual objection to server round trips is latency under rapid input, which is
why boggle and spellingbee ship word lists and self-score. strands inverts that:
tracing is deliberate and infrequent.

**The shield** is waffle's / crosswords' pattern — a column grant omitting
`solution`, and a builder that writes the puzzle words into `game_data` only
once **`common.games.ended_at`** is set. Over for *everyone* is the only thing
worth protecting server-side, and compete is where that bites: a racer who has
solved or conceded has ended their own race while the rest are still tracing,
and could read the answer out — so the gate can't key on any per-player
doneness (`compete_test.sql` pins both halves). Whether a player is *looking*
at the answer is their own display choice in the FE ([ui.md →
Endings](../ui.md#endings--the-moment-vs-the-record)): a local,
reversible reveal (`act-reveal`, one action carrying both faces and placed in
the action row AND the menu), nothing shared, and nothing autorevealed to a
player who did not solve it. The reveal has **two halves, one toggle**: the
unfound words draw as gray lines on the board, and the info column names them as
text (`Words: <spangram> …`, spangram first, each click-to-define). The column
half is not decoration — the board draws *paths* and never spells anything out,
so without it a reveal makes you read the answer off the grid letter by letter.

> **Recorded as provisional.** If the verdict ever feels laggy, the fallback is
> trusting-commit: ship the solution + legal words and let the RPC record the
> FE's verdict, as `connections.submit_guess` does. `submit_path` already owns
> the row lock, counters, ending check and turn advance — none of which move —
> so the flip is adding a `result` parameter. What does *not* survive it is the
> shielding, and that is a schema edit.

**Both shielded tables `revoke select` before their column grant.** Grants are
additive, so a table-wide `grant select` that ever reached the database would
not be undone by re-applying `supabase/sql/strands.sql` — the column grants
would be added alongside it and `solution` would stay readable while the file
claimed otherwise. Since that directory is the authoritative current definition,
the shield starts by clearing whatever came before. (Found by planting exactly
that break and watching the file fail to heal it.)

**Match by PLACEMENT + word**, not by ordered path and not by string alone.

A find is identified by *which tiles it consumes* and *what those tiles spell* —
never by the order they were visited in. Both halves are needed: string alone
misclassifies (in one sampled puzzle all 8 puzzle words also appear in NYT's own
solutions list), and cells alone would accept a scramble.

Order is left out because a word with a repeated letter can sit on two
interchangeable tiles, and then more than one legal trace covers the identical
cells and spells the identical word. A real case ("Eyes on the prize") —
INTENTION runs through two `N`s at `[5,1]` and `[6,1]`, each adjacent to both
of the other's neighbors:

```
I[5,0] N[6,1] T[6,2] E[7,3] N[7,2] T[7,1] I[7,0] O[6,0] N[5,1]
I[5,0] N[5,1] T[6,2] E[7,3] N[7,2] T[7,1] I[7,0] O[6,0] N[6,1]
```

Same nine tiles; the only difference is which `N` was touched first, and both
are the word. `_path_key` compares the sorted cell set, in the three places
that compare paths: matching a find, clearing a spent hint, and deciding
whether a word is still worth hinting at.

**No Realtime Broadcast channel.** A peer sees your word when you **submit** it;
nobody watches anyone else's tiles light up mid-trace. That is the opposite of
connections, which shares partial selection so coop players build a guess
together — and it means the page blobs carry everything: a move rebuilds them,
and the page re-reads them. Recorded so the absence doesn't read later as an
oversight.

---

## 3. Schema — `strands.*`

Two files, per [Schema vs code](../supabase.md#schema-vs-code):
`supabase/migrations/20260804000000_strands.sql` (shape, applied once) and
`supabase/sql/strands.sql` (functions/views/policies/grants, re-applied every
deploy).

| table | purpose |
|---|---|
| `puzzles` | The imported NYT archive. `source_id` (puzzle number), `puzzle_date` (unique), `board` (8 rows of 6), `title` (the theme prompt), and the shielded `solution`. Only `(id, source_id, puzzle_date, title)` are granted to `authenticated` — enough for the setup dialog to name the puzzle it's offering, not enough to study tomorrow's board. The title is how a person recognizes a puzzle (it's the game's own title, and on screen from the first second), so withholding it would mostly mean starting one you'd already played. |
| `games` | One playthrough, keyed `game_id`, its title in `puzzle_title`; the mode and the club are `common.games`'. Follows the [library-puzzle provenance rule](../common.md#library-puzzle-games-provenance-not-dependency): everything needed to play *and* identify the game is copied on, and `puzzle_id` is a soft FK (`on delete set null`), so the archive can be re-imported freely. Carries the three setup knobs, denormalized because they're immutable and read on every move. |
| `players` | One row per player: the hint bar (`hint_points`), the ringed hint (`active_hint_coords`) and the hints that player cashed (`n_hints_used`); a solve is `common.game_players.solved_at`. The **same shape in both modes** — coop moves the bar and the ring on every row in lock-step (the pool is shared), compete only the actor's; `n_hints_used` is always the casher's own (see [Compete](#8-compete)). |
| `events` | The append-only log — **one table, not two**, and not two *kinds* of table either. `kind` discriminates a **guess** (a submitted path, carrying `word` + `result`) from a **hint** (a cashed token, carrying neither). Keyed by a `bigint identity`, read `order by id`. Found puzzle words are the projection `result in ('theme','spangram')`; credited hint words are the distinct `hint_word` set. `took_turn` is true for a trace that found something — `theme`, `spangram` or `hint_word` — and false for a duplicate, a too-short path, a word the dictionary lacks, and a hint. Only state that can't be derived lives as columns — on `players`, above. |

`solution` shape:

```
{ spangram:   { word, coords: [[r,c], …] },
  themeWords: [ { word, coords: [[r,c], …] }, … ] }
```

Coordinates are `[row, col]`, 0-based, everywhere — stored solutions, traced
paths, hint reveals — matching the feed, so there are no adapters.

**The page reads none of these tables.** The column grant keeps `solution` off
every client read, and the page blobs below carry the puzzle words only once
the game has ended. The policies are the club-member gate alone; what a racer
may not see of a rival mid-race is `useGame`'s rule, applied to the blob.

### The page blobs

`strands._rebuild_data_cols` writes them at create, at Restart and at the end
of every move — a hint included — and every ending, each assigned whole:
`shell_data` through `common._make_json_shell_data`, and on top of the common
part of `game_data` and `summary_data` this game's own.
`strands._rebuild_data_cols_for_all()` rebuilds every strands game without
re-dating it. `static_game_data`, what nothing after create changes, is
written once by `_write_static_game_data`, from `create_game` and that
rebuild, never by a move ([common-schema.md → Title, page blobs and the two
dates](../common-schema.md#title-page-blobs-and-the-two-dates)); the hook merges
it into `game_data`, each key in its place.

| blob | strands' part |
|---|---|
| `static_game_data` | `puzzle: {title, tiles}` — the theme prompt; all 48 `{id, letter, row, col}` tiles row by row, the id the tile's place `"r,c"` |
| `game_data` | `puzzle: {puzzleWords}` — the puzzle words `{word, tileIds, spangram}`, spangram first, null until the game ends. `team`, the team's facts sent once — coop's words found, the players' hints summed, the one bar and the one board; null in compete. `events`, every row `{id, userId, kind, word, result, tileIds, tookTurn, at}` — a guess's trace or a hint's ringed word as tile ids. On each player their own facts: `nFoundPuzzleWords`, `nHintsUsed`, and a racer's `hintPoints` and `board: {foundPuzzleWords, hintTileIds}`, the two null on a coop player |
| `summary_data` | `team: {nFoundPuzzleWords, nHintsUsed, hintPoints}`, the team's counts and bar, null in compete; `nWinnerHints`, the hints a race was won on; `nHintsUsedById`, each racer's hints, null in coop |

strands' facts (`GFacts`) are `nFoundPuzzleWords`, `nHintsUsed`, `hintPoints`
and `board`. `useGame` puts the side's on every player — the team's in coop,
their own in compete — and their own under `own`
([common-schema.md → A player's facts](../common-schema.md#a-players-facts--the-sides-and-their-own)); a coop bar and board are
nobody's in particular, so a coop player's `own` holds the team's. The state
line and the hint bar read `gd.me`, the bar's cost `gd.setup.hint_cost`.

**Never the TOTAL** before the end. "This board holds six words" is real
information about a puzzle whose entire content is shielded, so the readouts
count up rather than down, and `submit_path` doesn't return the total either.
The server still computes it for the solve check.

**The builder writes every board and every row.** What a racer may not see yet
— a rival's rows, board, bar and found-word count mid-race — `useGame`'s seat
rule withholds; the hints they have cashed stay, the one number a race
publishes:

    coop                 →  shared, like the board
    compete during play  →  your own rows only; a rival's board, bar and count null
    compete once ended   →  everyone's

**None of the three tables is in the Realtime publication:** the page hears a
move through the `changed` Broadcast (src/common/realtime/doc.md), and
`supabase/tests/common/realtime_publication_test.sql` pins the absence.

#### Why hints share the guess table

A spent hint is a log row, and it lives in `events` rather than a
`strands.hints` sibling for one concrete reason: **the history viewer replays a
turn by folding the rows before it** (`lib/history.ts`). Two tables would mean
merging two streams by timestamp, with cross-table ordering ties left
nondeterministic — plus a second policy and a second delete in
`replay_board`. One table keeps the log a single sequence.
`scrabble.events` is the same pattern (`kind in ('word','exchange','pass',
'leftovers')`).

The shape that makes it cheap: **`result` is null on a hint row**, and every
query in `supabase/sql/strands.sql` filters on `result` — so a hint is invisible
to all of them *by construction*. Adding hints changed no existing query.
`hint_test.sql` pins that (the guess-predicate count excludes the hint row), so
it can't quietly stop being true.

**A hint row stores its coords and not its word.** The coords are what let the
viewer re-ring a past hint exactly as it looked; the word is withheld because a
hint has never said it, and the log is the one place that would outlive the
on-board ring being retired. A replayed hint's tiles go to the snapshot board's
`hintTiles`, kept separate from `litTiles` so the board draws them as *rings
with no connecting line* — replaying a hint as a traced route would show an
order the hint never gave.

The one thing this discloses that nothing else did: **the location of a hinted
word nobody went on to find**, visible once the compete log opens at the end
but before an opt-in solution reveal. A narrow, deliberate acceptance — every
*found* word's coords were already open at the end via its `theme`/`spangram`
row. If it ever needs closing, the fix is one line in `useGame`'s seat rule.

### How a game ends

The ending is `common.games`' reason, detail and outcome
([docs/win-lose.md](../win-lose.md)):

| mode | when | reason / detail | ranked |
|---|---|---|---|
| coop | every puzzle word found | `reached_goal` / `solved` | everyone 1, won, all solved |
| coop | the timer | `timeout` | nobody — a loss |
| compete | nobody left racing: the last solve | `reached_goal` / `solved` | every solver by fewest hints, then the earliest solve; ties share |
| compete | nobody left racing: the last concession | `conceded` | the same |
| compete | the timer | `timeout` | the same, over whoever had solved |
| either | somebody pressed Stop | `stopped` | nobody — neutral |

The timer is a **loss** in coop under the roster's one test — *you lose if the
game had a reachable end and you didn't reach it* ([states.md](../states.md)) —
so strands sits with wordle and connections, not with an untargeted word hunt
where the timer is merely how a session stops.

---

## 4. RPCs

| RPC | job |
|---|---|
| `create_game(p_club_handle, p_setup, p_player_user_ids, p_mode)` | Copies the puzzle onto the row, builds the page blobs, seats turn-order when `setup.coop_style = 'turns'`. Title is `"<date>: <title>"` — the puzzle's title is the prompt, not the answer, so it spoils nothing and tells two games apart far better than a bare date. |
| `submit_path(p_game_id, p_path)` | The move RPC: answers `{result, hint_points}` — the verdict, and the caller's bar after the move — with no outcome. See the order below. |
| `spend_hint(p_game_id)` | Picks a **random** unfound puzzle word and publishes its **coords**, never its word. Answers `ok` · `{result: 'hinted'}` alone; the ring lands with the blobs. Its three refusals are all RACES the shared pool makes real: `PN432` "Hint bar not full yet", `PN433` "A hint is already showing", `PN431` "You've already finished this board". `PN434` is the fault for a board with nothing left to hint, which the ended-game gate should already have caught. |
| `stop_game` / `submit_timeout` / `replay_board` | The neutral manual stop, the timer, and the restart. |

**Every RPC that changes the game ends by rebuilding the page blobs** — a trace,
a hint, and every ending.

### The answers (`lib/answer.ts`)

Every answer strands gives is one of seven (`GAnswer`): `submit_path`'s six
results, and `hint`, which is what a `kind: 'hint'` row is (it has no
`result`). `answerMessage(answer)` says how each reads — its outcome and its
words — and is the only place that does:

| answer | outcome | words |
|---|---|---|
| `theme` · `spangram` | won | "MEDICINE — theme" · "PHARMACY — spangram" |
| `hint_word` | near | "TRAILER — valid word", or "— hint earned" when it filled the bar |
| `duplicate` · `too_short` | warning | "— already found" · "— too short": moves the rules turn away, with nothing happening |
| `invalid` | lost | "— not a word": the one real miss |
| `hint` | warning | none: the ring on the board is the news |

There is no teammate's line: strands narrates nobody's move — a teammate's find
lands on the board and in the log. Everything holding a log ROW asks the same
file: `answerOf(row)` reads a row's answer, `kind` first, and
`eventToOutcome(row)` colors the log's bar. The RPC envelopes carry no outcome
and no sentence — `lib/answer.test.ts` pins every answer, the pgTAP pins the
nulls ([outcomes.md → How a game does it](../outcomes.md#how-a-game-does-it)).
The PDF's `MARK` (a glyph vocabulary for black-and-white paper) and history's
`BODY` (the banner's sentence) key off the same `result`; neither is an outcome.

### Classification order — a rule, not an implementation detail

1. the path matches an unfound puzzle word's path → **theme** / **spangram**
2. shorter than `min_word_length` → **too_short**
3. already credited this game → **duplicate**
4. in `common.words` at the setup band → **hint_word** (+1 point, capped)
5. otherwise → **invalid**

**The theme check runs first and unconditionally.** Not because NYT ships short
theme words — the archive minimum is exactly 4 — but because *33 of 148 sampled
theme words are exactly 4 letters*, so a club raising `min_word_length` to 5
would have real answers rejected under a length-first check. The collision is
with our own knob.

**All five verdicts above are `ok`** ([envelopes.md](../envelopes.md)), which is
worth saying because three of them read like refusals. `duplicate`, `too_short`
and `invalid` are the game's rules applied to a move that genuinely happened —
and nothing local was consulted first, so there is no stale copy losing a race:
strands ships **no word list to the client**, and the frontend deliberately does
not gate on `min_word_length`. The server's verdict is the first anyone knows.
The envelope carries the result alone; what each reads as, and its words, are
`lib/answer.ts`'s.

**What IS a `not-ok`** is a trace this board could not have produced, or a move
somebody else overtook:

| | | |
|---|---|---|
| `PN421` "Crosses a found word" | `race` | the one path check a TEAMMATE can cause: their find consumed tiles you were drawing through. The FE drops a trace when a peer's find touches it, but a find landing mid-flight beats that |
| `PN486` "Game over" · `PN483` "Already conceded" · `PN243` "Not your turn" | `race` | |
| `PN422`–`PN427` `BUG: …` | `fault` | not a path, empty, a cell that isn't `[row, col]`, off the board, a jump, a self-crossing |
| `PN485` "That game was already deleted" | `race` | a friend deleted the game from the club list; `common._raise_game_deleted`, asked before the membership gate — `spend_hint` answers the same |

The six faults share one justification: **the frontend BUILDS the trace**, cell
by cell, through `clickTile` — which only ever appends an adjacent, unvisited,
on-board cell. A shape that fails one of them did not come from our board. Every
malformed-path shape still gets a *designed* answer rather than a raw cast error
(`validation_test.sql` plants each one).

The dictionary filter is the **may-enter tier** ([common.md](../common.md)):
`w.band <= band` and nothing else. No slur / crude / slang / dialect filter
— the player chose to type it.

> **The band runs backwards from waffle's.** A *higher* band makes strands
> *easier*: more words qualify, so hints come faster. Same direction as
> spellingbee's `legal`, opposite of waffle's tier. The setup form says so out
> loud.

---

## 5. The hint economy

Distinct hint words fill a **bar**; at `hint_cost` (default 3) the
Hint button activates. Spending rings one unfound puzzle word's tiles — **no
connecting line**, so the player still works out the order.

- **The pool is shared in coop**, which forces the random pick server-side and
  persisted: a client-side roll would show three players three different hints
  for one spent token.
- **The bar caps** at `hint_cost`. Hint words found while a hint sits unspent
  are lost, and nothing warns about it — the full bar is the signal, which is why
  the filled state is styled distinctly rather than merely being 100% wide.
- **The button is clickable before the bar fills**, and answers the click with
  the count still to go — a `warning` result, "3 more words needed for a hint".
  The bar shows *progress* but never states the remaining number, so an early
  click is a fair question, and a disabled button is the one response that can't
  answer it. The two states still read differently: the button only fills amber
  (`hintReady`) when a hint is actually there to cash. Words is the literal unit
  — `spend_hint`'s ledger adds exactly one point per hint word — and
  the singular ("1 more word needed") is unit-tested, since it's the state
  preceding every hint anyone ever earns.
- **One hint at a time.** A second is refused while one is unsolved; the board
  can only ring one word legibly.
- **Not turn-gated.** Spending is a decision about a team resource, not a move.
- **It goes in the log.** `spend_hint` writes one `events` row (`kind = 'hint'`,
  `took_turn` false), and the log shows it: a `warning` bar, a lightbulb glyph,
  "Hint used" where a word would be, and a live `#N` that replays its ring.
  **One row, attributed to whoever cashed it**, even in coop where the bar and
  the ring are on every row: a shared pool still has a single person who
  decided to spend it, and the hint counts to their `n_hints_used`.

---

## 6. Frontend

Folder mirrors the other games'. Three notes worth carrying:

**There is no puzzle picker.** A date names nothing — with 884 of them, the easy
mistake was starting one you'd already played and only noticing once the board
was up. So there is no choice: `strands.next_puzzle_for_club(p_seen_by)` hands
back the earliest puzzle none of the *selected players* has played, in
**any club**, and `SetupForm` renders the shared
`common/setup-form/SetupNextPuzzleSection` — one read-only line, `date: title`.

The puzzle's title is that line's label: it is how a person recognizes a
strands puzzle (it is the game's own title, and on screen
from the first second of play). The slot keeps a fixed height so the three
`SetupSection`s and the timer below it can't jump when the RPC lands.

A plain `<input type="date">` sits under the line as the **override** — for the
rare case where you know the date and want that one, including one you've
played before. It calls `strands.puzzle_for_date`, which filters nothing and
starts a second game on a puzzle rather than reopening the first.

**Neither picker answers "nothing" quietly.** Both return `ok` · `{result:
'found', puzzle}` or a **`form-validation` naming `puzzle_id`** — `PN416`
"Everyone here has played every puzzle. You can open one already played by its
date." and `PN417` "No puzzle for `<date>`. Try another date." Running out
BLOCKS Start, and what fixes it is a control on this very form, which is the
shape of a validation rather than a gray line mentioning it in passing. Both
sentences are connections' PN302/PN303 verbatim: the same condition in the other
dated-archive game must not be described differently.

The in-game **New game** path asks the same RPC and deliberately says something
else for PN416 — an acknowledge dialog naming `gmake g-strands-fetch` — because
the server's sentence points at a date field that surface does not have. A
caller may say MORE than the message it replaces, never less
([envelopes.md](../envelopes.md)); connections' New game does the same with
PN302.

The rules, the `security definer` reason, the per-player-not-per-club
exclusion, the override's deliberate asymmetry and the exhausted state are
written up once in
[`src/connections/doc.md` → RPCs](../../src/connections/doc.md#rpcs); the
two games' functions are twins. `tests/strands/next_puzzle_test.sql` is where
both are pinned.

**No typed WORDS — but typed LETTERS.** A board repeats letters, so a typed
*string* doesn't identify a path: `PAPARAZZI` on a board with four `A`s is
genuinely ambiguous. `typeLetter` (lib/trace.ts, the keyboard twin of
`clickTile`) resolves one keystroke against the tiles that could actually come
next:

- **Nothing traced** → any unused cell bearing the letter, anywhere. That
  competes with all 48 cells, so it's usually ambiguous — a word's first letter
  is usually a click.
- **Mid-word** → only the ≤8 neighbors of the last cell, minus cells already in
  the trace (a path can't visit one twice; clicking your own cell still means
  "undo back to here", which stays click-only). A small field, so this is
  usually unique — which is what makes typing the *rest* of a word work.
- **Several matches** → they ring **red** for a beat and wait for a click. No
  message: this slot IS the entry area, so a pill would hide the word being
  built to say something the board says better. **No match** → a `lost` result,
  because that's nearly always a mistake rather than a choice.
- An unmatched letter **never restarts the trace elsewhere** the way a far
  *click* does. A click names a cell unambiguously; a keystroke doesn't, so
  jumping the trace across the board would be guessing at intent.

Physical keys also do the rest: **Backspace** drops the last tile,
**Enter** submits, **Tab** is caught and goes nowhere (the page declares an
empty tab ring, so no tile is ever a tab stop), and any key dismisses the last
result.

**The arrows and Space are a selection cursor** (`useTileCursor` over
`useBoardSelectionCursor`, the shape `lib/boardShape.ts`): a ring in the app's cursor blue, hidden until
an arrow asks for it, and **Space is exactly a click** on the ringed letter —
extend, back up, or start over, by `clickTile`'s rule. It is how a red-ringed
candidate is chosen without the mouse. A typed letter, a submitted word and a
click each move the cursor to where the move went and hide it, so the next
arrow shows it there — beside the candidates after a letter that rang red.
The ring is an SVG circle at the cell's edge rather than the shared outline,
because this board draws no boxes; it sits outside the trace-end ring, so both
show on one letter, and arrowing never moves the trace's end.

**A click never submits.** Re-clicking the last tile would be a misclick magnet:
that tile is where the cursor already is, so clipping it while reaching for the
next letter would fire a half-built word at the server. It truncates like any
other selected tile — clicking *any* letter in the trace, the last one included,
backs up to just before it — and the two deliberate routes (Enter, the Submit
button) carry submission alone. That makes the word-entry row load-bearing
rather than a convenience, since a phone has no Enter key. The last tile keeps
its second ring: it marks where the trace ends, which is what tells you which
neighbors are live and what Backspace will take.

**The word-entry row** is the shared `<WordEntryRow>` (⌫ | the traced word in a
`<WordEntryInput>` | Submit) — the same control every other game's entry wears.
strands can't use `<WordEntryArea>`: its string is *derived* from the trace
(`useTrace`), so WordEntryArea's `value`/`onChange` contract runs backwards.
The buttons are the pointer twins of Backspace and Enter, and the win is touch —
on a phone there's no keyboard, so the Submit button is the ONLY way to send a
word. The row **shares its fixed-height slot with the feedback pill** (you're
either building a word or reading what the last one did) — the same swap
`<WordEntryArea>` makes; stackdown, whose pill has a separate reserved row, is
the odd one out. The local slot's standing conditions are the verdict, out of
the race ("Solved: waiting on the rest" for a solver), whose turn, and the
**puzzle's title as a `prompt`** on an untouched board — it leaves when a trace
begins and comes back if that trace is taken back or rejected, until the first
row is logged, and a rejection shows over it ([ui.md → Feedback
pill](../ui.md#feedback-pill)).

**Bare letters, no tile boxes** — a documented departure from the
tile-and-warm-ramp vocabulary in [ui.md](../ui.md). A disc IS the mark here, and
a box around it reads as noise; the board instead gets one frame at its edge,
because without it the letters float in the page.

The path layer is **one SVG under the letters**, in cell units (`viewBox="0 0 6
8"`), so a cell center is exactly `(col+0.5, row+0.5)` and every radius is a
fraction of a cell — no pixel maths, no resize observer. Discs are drawn in the
same SVG as the lines, which is what guarantees a line passes *under* its discs
at any size.

**Every log row leads with a verdict GLYPH** — trophy (spangram), star (theme
word), check (hint word), X (rejected) — from the shared icon registry, named
for the verdict rather than for this game so another word game's log can reuse
them. Two jobs: an eye running down the log sorts finds from misses without
reading a word, and it is the NON-COLOR encoding of the same fact, which the PDF
printer will need — [common/pdf/doc.md](../../src/common/pdf/doc.md) prints in
three shades of gray, where purple and gold are the same ink. The glyph sits in
a FIXED-width slot, so words start at the same x whichever mark precedes them,
and it tints with its word so the two can never disagree about a row.

**Colors**, and each says one thing: purple = a found theme word, gold = the
spangram, light purple = the live trace, gray = a word nobody found (drawn at
the reveal). Green belongs to the hint bar; a hint word is gold,
since it is progress rather than the goal. The event log uses *darker text
variants* of purple and gold — a color tuned as a disc fill under white letters
is not the same color that reads as 15px type on a white row.

**Results speak the shared word-game format** — `WORD — body`, word first and in
caps, which is how the four `useFoundWordSubmit` games write theirs. strands
can't use that hook (its acceptance is server-side, not a local list lookup), so
it matches the *output* instead of inventing a second dialect; `too short` and
`not a word` are word-for-word boggle's.

**New game advances to the next UNPLAYED puzzle**, carrying the club's knobs
(and the mode itself) forward. It omits `puzzle_id` and lets `create_game` derive
it — the same function the setup dialog previews, so the two can't disagree.
Mid-game the registry's `NEW_GAME_CONFIRM` asks first; the preview read
(`next_puzzle_for_club`) exists only to catch a spent archive before the create,
and can go stale harmlessly, because the authority is the create. Restart is for
replaying the same board. When the archive is spent for these players it says so
as a one-button notice.

### Print to PDF

One **track per board** (`common/pdf/columns`, three to a page): coop's team
board is a single column, compete gets one per player — there each racer really
does have a different board over the same letters, and a merged column would
file one player's words under another's grid. Same reasoning wordle and waffle
print by.

Printing a board whose meaning is COLOR needs the encoding to move to **shape**
(common/pdf/doc.md — color only for meaning, never as the only carrier):

| on screen | on paper |
|---|---|
| purple disc + line (theme word) | a solid gray line through the letters |
| gold (the spangram) | the same line, drawn **heavier** |
| gray (a missed word, at the reveal) | a **dashed** line |

Letters print black throughout, over a **white knock-out disc** on every traced
cell — the mono equivalent of the on-screen colored disc, and the reason a
connector doesn't run straight through the glyph it connects. Circling every
found tile instead would ink most of the page: the puzzle words tile the board
exactly, so a solved board is entirely covered.

The log's verdict glyphs are the vector marks from `common/pdf/marks` (a filled
square for a find, bigger for the spangram, ✓ for a hint word, ✗ for a
rejection) — jsPDF's core fonts are WinAnsi, so a unicode star or trophy would
not render at all. That non-color encoding is why the on-screen glyphs were
added when they were.

The shield applies here too, and needs no separate rule: missed words come from
the puzzle words, which print only while the solution is shown, and mid-game
compete prints only my own track because `gd` holds no rival's board yet — a
rival's column would be an empty grid claiming they found nothing.

### Turn-history replay

Click any `#N` in the log to see the board as it stood at that submission
(`useHistoryViewer` + `lib/history.ts`, the shared arrangement).

**A filter, not a reconstruction** — which is unusual, and falls out of the
tiling invariant. The board only ever ACCUMULATES: a puzzle word is found once,
its tiles lock, nothing is removed or changed. So "the board at turn N" is
literally "the puzzle words among the first N+1 rows". waffle re-applies each
swap to its scramble; stackdown's tiles vanish; strands just slices.

The boundary is **inclusive** — turn N shows the board *after* it, with the
tiles that turn traced ringed in the history blue. That matters most for rows
that changed nothing: a rejected word's route is exactly what you want when
reviewing why it failed, and an exclusive boundary would hide it.

`#N` counts the rows on show and the handle carries the row's own id, so every
row is live whatever the filter. The builder folds the board being looked at and
resolves the id against it — a row that list does not hold replays nothing.

### The component tree

Folder [`src/strands/`](../../src/strands/), the shape
[`docs/playarea.md`](../playarea.md) describes, on the page blobs: `useGame` is
`makeGameData(game_data, me)` — no read, no subscription — and every type the
folder exports is in [`types.ts`](../../src/strands/types.ts), the `gd` sketch
at its top.

```
<PlayAreaLoader {...PlayAreaLoaderProps}>   useGame: gd from the game_data blob
  └── PlayArea                      the coordinator: picks the board to show
        ├── BoardCol                the board, the entry slot, the hint bar; owns the move
        │     ├── Board             the drawing layer; decides each letter's marks
        │     │     └── Tile        one letter — on a disc, traced, ringed
        │     ├── HistoryBanner ←   in the entry slot while a past turn is open
        │     ├── WordEntryRow ←    ⌫ | the traced word | Submit — or the pill, in the same slot
        │     └── HintBar           the bar and its Hint button
        ├── InfoSheet ←             off-canvas on a phone, a flex child on desktop
        │     └── InfoCol           the readouts and the action row
        │           ├── StateLine   "3 words · 1 hint used"
        │           ├── OpponentStrip ←    compete only: each racer's hints, then how they came out ("1 (solved)")
        │           ├── InfoActionsRow ←   one row, every action, in the menu's order
        │           ├── the revealed words "Words: …", once Reveal is pressed
        │           ├── SetupDisclosure ←
        │           └── GameEventLog       every row I may see
        └── CelebrationBlockingModal ←     my win, when it happens
```

`PlayArea`'s hooks: `useGetEndingMessage` (my ending's message, from my
ending label: `lib/endingLabel.ts`, on every `gd` player), `useTurnStartFlash`
(the bell, and the board's flash, as the turn becomes mine), `useHistoryView`
and `useActionsAndMenu`.
`BoardCol`'s: `useTrace` (the trace, held as tile ids), `useSubmitTrace` (its
trip to `submit_path`), `useSpendHint`, `useBoardColActions` (Submit, ⌫, a typed
letter and Hint, with the gate `canPick` and the ambiguous-letter rings) and
`useShowPuzzleTitle`, and the keyboard's cursor `useTileCursor` — the siblings'
hook, called by the column rather than the board, since a typed letter and
Submit move the cursor too (`moveTo`). The Submit action's own `pending` is the
one in-flight guard. No `MobileStatusBar`: the pill slot says
the prompt and the verdict on a phone.

**One case, the data's.** The board, the solution and the log's words are
stored lowercase; the capitals are drawn — CSS on the board, the traced word
and the log, by hand in a pill's sentence, the banner and the PDF.

---

## 7. The archive, and being a good guest

`gmake g-strands-fetch` (network, incremental, rare) writes
`supabase/data/strands-puzzles.jsonl`; `gmake g-strands-puzzles` loads that file
into the database with **no network at all**, and is what `db-data` runs.

The split exists because folding the fetch into the import meant `gmake db
ENV=local` — routine and frequent — fired ~900 requests at nytimes.com on every
reset. The archive is committed like the rest of `supabase/data/`, so a fresh
clone imports offline too.

The feed (`nytimes.com/svc/strands/v2/<date>.json`) is **public** — no cookie
jar, unlike the NYT crossword path. It starts 2024-03-04.

**The import guard**
([`lib/strandsPuzzle.ts`](../../supabase/scripts/lib/strandsPuzzle.ts)) checks
five things per puzzle, and runs on both sides — at fetch so bad data never
reaches the file, at import so a hand-edited file fails loudly:

1. the board is 8 rows of 6;
2. every path is contiguous under 8-way adjacency;
3. every path actually **spells** its word on that board — the check that
   catches a feed change flipping coordinates to `[col,row]`, which no shape
   check would notice;
4. the spangram **spans** two opposite edges (all ~900 archived puzzles do);
5. the words **tile** the board exactly.

The importer **updates on conflict** (`source_id`), so a re-fetch carrying a
corrected puzzle refreshes its row in place — games in flight are untouched
either way, since every game plays from its own frozen copy.

NYT's `solutions` list (its own list of hint words) is deliberately **not**
imported: our hint words come from `common.words` at the chosen band, and that
band is the difficulty lever.

### The oracle

Two puzzles are kept whole, `solutions` included, in
[`oracle.fixture.ts`](../../src/strands/lib/oracle.fixture.ts). That list is a
**parity oracle** for the tracer — the role `boggle-c-solver/` plays for boggle:
~2500 words a third party asserts are findable on those boards, all of which our
rules must agree with. It is what established 8-way adjacency, and the test pins
that under 4-way *fewer than half* remain traceable.

The search harness lives in the test file, not `lib/`: the app never needs to
*find* a word on a board (the server classifies; the FE only validates the path
actually traced), so shipping an unused solver to serve a test would be
backwards.

---

## 8. Compete

Each player races the **same puzzle on their own progress**: own found words,
own hint bar, own locked tiles. `strands.players` carries that state, and it is
the shape in BOTH modes — coop moves the bar and the ring on every row in
lock-step (its pool is shared), compete moves only the actor's. One code path,
one predicate apart.

### The winner, and why the race can't end early

**Whoever SOLVED using the fewest hints**, earliest solve breaking a tie.

That single rule sets everything else. A player still going might finish on
fewer hints than the current best, so first-to-solve would crown the wrong
person and make the hint count decorative. Instead a solver **ends their own
race** — their board freezes, their number is final, they can't spend
another hint — and the game ends when nobody is still racing: all solved or
conceded, or the timer.

Getting a hint POINT costs nothing; only cashing one does. That's the whole
tension: a player who never spends can be beaten only by another who never
spent and solved sooner — so the pressure is to solve *clean* first, fast
second.

### What a rival may see

Exactly one number mid-game: **hints used**. It's the ranking, so it makes the
race legible, and it says nothing about the puzzle.

Withheld until the game ends:

| hidden | why |
|---|---|
| their found words | `useGame`'s seat rule leaves their rows out and their board and count null — word counts are progress |
| their hint **bar** | its fill proxies how many hint words they've found, so publishing it would leak sideways exactly what the seat rule hides |
| their revealed word | part of the answer |

A solve (`common.game_players.solved_at`) **is** public: race status, not puzzle
content — knowing someone finished tells you the bar you have to clear, which is
the same kind of fact as their hint count. The blob carries a rival's count
and bar; the seat rule withholds them mid-race.

This is a **deliberate divergence** from the rest of the roster, which shows
peers a progress metric "so the race has tension" (connections' mistakes,
boggle's score). Here the hint count carries that instead.

### Concede

`strands.concede` locks the `strands.games` row and calls `common._concede`,
which records the concession (and ends the game as a loss if every player has
conceded). Then, because a racer can also end by solving, its own
`_maybe_finish_compete` checks whether the concession left nobody racing — a
table where one player SOLVED and the rest walked away ends with that solver
winning, the reason `conceded`.

**A conceder is out, in both directions.** `submit_path` and `spend_hint`
refuse a conceded caller (the FE freezes the board, but a submit in flight or a
stale second tab must not let a drop-out complete the win condition), and the
ranking counts only solvers. A solver cannot concede: a player who is already
out is refused by `common._concede` (PN508), so a solve stays ranked
(`conceded_test.sql`).

The row lock is deliberate: `submit_path` and `stop_game` serialize on that
row, and without it a last solve racing a last concession could each snapshot
the other as "still racing" and leave the game stuck with nobody left to end
it. See [common-schema.md → Concede](../common-schema.md#concede--per-player-drop-out).

The manual **Stop** stays neutral in both modes. A race called off early didn't
finish, and handing the trophy to whoever was ahead would reward stopping at the
right moment.

### The summary

The summary reads `summary_data`: coop's line counts the team's words found,
never out of how many; compete's publishes **nothing** of a rival mid-way. Each
line leads with my ending label once I am out of play ("Solved (waiting on the
rest)"), and at the end names the winner and the MARGIN (`Won by bea · 0
hints`, from `nWinnerHints`). A place below first says what lost it: "2nd (more
hints)" when someone above used fewer, "2nd (solved later)" when they used as
many — read from `nHintsUsedById`.

## 9. Tests

**pgTAP** (`supabase/tests/strands/`, all on the synthetic fixtures in
`setup.psql` — a rows-are-words board of dictionary-proof nonsense, plus the
ambiguous-ABBA board that pins the match-by-placement fix):

| file | pins |
|---|---|
| `gameplay_test.sql` | the classification order, the hint bar's fill/cap/dedup, the coop solve = board consumed, a trace into a deleted game |
| `validation_test.sql` | every malformed-path shape gets its **designed** P0001 (planted one by one — the original guard used `rs @> array[null]`, which can never match, so this file exists to fail on a regression to that); integral floats normalize instead |
| `hint_test.sql` | spend semantics: random pick persisted, coords only, one at a time, cleared by placement, a hint asked of a deleted game |
| `turn_order_test.sql` | the opt-in turns coop: pointer seating, `'not your turn'`, advance on accepted moves only |
| `compete_test.sql` | the race: per-player boards, what the blob carries of a rival, fewest-hints ranking, concede-with-a-solver |
| `conceded_test.sql` | a conceder gets no more moves; a solver's concede is refused and her solve stays ranked; all-conceded → `conceded`; a racer's hint rings her own board alone |
| `timeout_test.sql` | the timer in both modes: coop a `timeout` loss, compete ranks whoever had solved; the log holds the whole race |
| `ending_test.sql` | the endings + the reveal gate |
| `game_data_test.sql` | the page blobs: a fresh game whole, mid-game coop and compete, the endings, a Restart, a rebuild of every game without re-dating it |
| `rls_test.sql` | the solution shield, and the member gate |

**FE Vitest** (`src/strands/`), all on `lib/gameData.fixture.ts`, which builds
the blob from facts as the builder would: `hooks/useGame.test.ts` (the links,
the counts, the boards and the seat rule), `lib/board.test.ts` +
`lib/trace.test.ts` (the geometry and the reducer), `lib/board.oracle.test.ts`
(the ~2500-word NYT parity oracle — see [The oracle](#the-oracle)),
`lib/history.test.ts` (the snapshot filter), `lib/answer.test.ts` (every
answer), `pdf/model.test.ts` (the print model, incl. the shield), and
`components/PlayArea.test.tsx` — **the mounted tree**, mocking only `db`.

That last one exists for a reason worth keeping: everything above it is a pure
function, and the pgTAP files own the rules, so the layer nothing watched was
the **wiring** — which control renders in which state and what each is handed.
The suite is deliberately about STATE → CONTROLS rather than game logic:
playing vs out of the race vs ended, the action row in every phase, and the
reveal's three faces — including compete's two halves, where the RACE being won
isn't my solve but solving-and-losing-on-hints is.

**pgTAP** also owns the puzzle choice: `next_puzzle_test.sql` pins
`next_puzzle_for_club` — ascending, per-PLAYER rather than per-club, spanning
clubs, and the exhausted case raising PN416. Its sixth
assertion is the one that separates per-player from per-club, and was verified
by planting the club-based rule and watching only that test fail.

**e2e** (`e2e/`): `strands.e2e.ts` (a coop game played through),
`strands-typing.e2e.ts` (typed letters and the cursor), `strands-mobile.e2e.ts`
(the phone layout), `strands-print.e2e.ts` (the PDF), `solved-reveal.e2e.ts` (a
coop win names the words unasked),
`puzzle-pickers.e2e.ts` (the FE↔server seam: starting with no puzzle chosen,
and the next dialog then offering a different one).
