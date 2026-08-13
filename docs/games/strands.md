# strands (PaulPath)

A NYT-Strands-style word search: an 8×6 board of letters hiding a set of **theme
words** plus a **spangram** — the one that runs edge to edge and names the theme.
You trace a word by clicking its letters in order. Valid non-theme words earn
hint points; enough of them buys a hint.

"strands" is the codename (as "codenamesduet" is for Codenames Duet). The
user-facing brand is **PaulPath**, which lives only in the manifest's `BRAND`
const; gametype / schema / folder are all `strands`.

**Sibling pair** — `strands_coop` + `strands_compete`, one schema, one folder,
mode branching at render time on `game.mode`. See [Compete](#8-compete).

For the shared layer see [`common.md`](../common.md); for play-surface
conventions [`playarea.md`](../playarea.md).

---

## 1. The two invariants

Both were **verified against the real feed**, not inferred from the rules, and
both are load-bearing.

### Adjacency is 8-way

Consecutive tiles may touch diagonally as well as orthogonally. Every sampled
puzzle uses diagonal steps (3–15 of ~40), so a 4-way tracer cannot enter most
boards at all. From 2025-06-15, `AMBITION` runs
`A[2,3] → M[1,3] → B[1,2] → I[0,1] → …` — that third step is a diagonal.

The rule lives once, in [`src/strands/lib/board.ts`](../../src/strands/lib/board.ts),
and both the puzzle importer and the FE import it from there. The
[oracle test](#the-oracle) pins it.

### The hidden words tile the board exactly

Theme words + spangram cover all 48 cells, each exactly once, with no overlap.
Consequences the code leans on rather than re-deriving:

- **Winning IS consuming the board.** "Every theme word found" and "every cell
  used" are the same statement, so `submit_path` counts words (the cheaper half)
  and `terminal_test` checks the other half actually holds.
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
infrastructure *for that alone*. strands has no such choice: classifying a traced
word needs a dictionary lookup against `common.words`, so a round trip is paid
regardless. Once it is, theme-matching in the same RPC is free — and the puzzle's
entire content, *where the words are*, stays server-side.

The usual objection to server round trips is latency under rapid input, which is
why boggle and spellingbee ship word lists and self-score. strands inverts that:
tracing is deliberate and infrequent.

**The shield** is waffle's / crosswords' pattern — a column grant omitting
`solution`, plus a `SECURITY DEFINER` `_solution_for` surfaced through the
`security_invoker` `games_state` view, gated on `common.games.solution_revealed`.
Reading that shared flag (rather than re-deriving "is it over?") is what keeps
strands consistent with the other thirteen games; `gametypes.hides_solution = true`
earns the shared `RevealButton` + `reveal_solution` for free.

> **Recorded as provisional.** If the verdict ever feels laggy, the fallback is
> trusting-commit: ship the solution + legal words and let the RPC record the
> FE's verdict, as `connections.submit_guess` does. `submit_path` already owns
> the row lock, counters, terminal check and turn advance — none of which move —
> so the flip is adding a `result` parameter. What does *not* survive it is the
> shielding, and that is a schema edit.

**Both shielded tables `revoke select` before their column grant.** Grants are
additive, so a table-wide `grant select` that ever reached the database would not
be undone by re-applying `supabase/sql/strands.sql` — the column grants would be
added alongside it and `solution` would stay readable while the file claimed
otherwise. Since that directory is the authoritative current definition, the
shield starts by clearing whatever came before. (Found by planting exactly that
break and watching the file fail to heal it.)

**Match by PLACEMENT + word**, not by ordered path and not by string alone.

A find is identified by *which tiles it consumes* and *what those tiles spell* —
never by the order they were visited in. Both halves are needed: string alone
misclassifies (in one sampled puzzle all 8 theme words also appear in NYT's own
solutions list), and cells alone would accept a scramble.

The ordering half was a **bug**, fixed 2026-08-04. A word with a repeated letter
can sit on two interchangeable tiles, and then more than one legal trace covers
the identical cells and spells the identical word. Real case (2026-08-02, "Eyes
on the prize") — INTENTION runs through two `N`s at `[5,1]` and `[6,1]`, each
adjacent to both of the other's neighbours:

```
I[5,0] N[6,1] T[6,2] E[7,3] N[7,2] T[7,1] I[7,0] O[6,0] N[5,1]   ← was rejected
I[5,0] N[5,1] T[6,2] E[7,3] N[7,2] T[7,1] I[7,0] O[6,0] N[6,1]   ← was accepted
```

Same nine tiles; the only difference is which `N` was touched first. Comparing
the stored coord array scored the first as an ordinary dictionary word, telling
a player who *had* found the word, in its place, that they hadn't. `_path_key`
now compares the sorted cell set, and the same fix applies to the two other
places that compared paths: clearing a spent hint, and deciding whether a word
is still worth hinting at.

**No Realtime Broadcast channel.** A peer sees your word when you **submit** it;
nobody watches anyone else's tiles light up mid-trace. That is the opposite of
connections, which shares partial selection so coop players build a guess
together — and it means `postgres_changes` on the three strands tables (plus
`common.games`) carries everything. Recorded so the absence doesn't read later
as an oversight.

---

## 3. Schema — `strands.*`

Two files, per [Schema vs code](../supabase.md#schema-vs-code):
`supabase/migrations/20260804000000_strands.sql` (shape, applied once) and
`supabase/sql/strands.sql` (functions/views/policies/grants, re-applied every
deploy).

| table | purpose |
|---|---|
| `puzzles` | The imported NYT archive. `source_id` (puzzle number), `puzzle_date` (unique), `board` (8 rows of 6), `clue`, and the shielded `solution`. Only `(id, source_id, puzzle_date, clue)` are granted to `authenticated` — enough for the date picker to name what it's offering, not enough to study tomorrow's board. The clue joined that list on 2026-08-13: it's how a person recognises a puzzle (it's the game's own title, and on screen from the first second), so withholding it mostly meant starting one you'd already played. It was never a cheating control either — studying ahead only ever needed starting the puzzle, revealing, and deleting the game. |
| `games` | One playthrough. Follows the [library-puzzle provenance rule](../common.md#library-puzzle-games-provenance-not-dependency): everything needed to play *and* identify the game is copied on, and `puzzle_id` is a soft FK (`on delete set null`), so the archive can be re-imported freely. Carries the three setup knobs, denormalized because they're immutable and read on every move. |
| `players` | One row per player: the hint economy (`hint_points`, `hints_spent`, `active_hint_coords`) plus `solved` / `solved_at`. The **same shape in both modes** — coop moves every row in lock-step (the pool is shared), compete moves only the actor's (see [Compete](#8-compete)). Mid-race a rival's private fields are nulled by `players_state`. |
| `events` | The append-only log — **one table, not two**, and not two *kinds* of table either. `kind` discriminates a **guess** (a submitted path, carrying `word` + `result`) from a **hint** (a cashed token, carrying neither). Found theme words are the projection `result in ('theme','spangram')`; credited hint words are the distinct `hint_word` set. Only state that can't be derived lives as columns — on `players`, above. |

`solution` shape:

```
{ spangram:   { word, coords: [[r,c], …] },
  themeWords: [ { word, coords: [[r,c], …] }, … ] }
```

Coordinates are `[row, col]`, 0-based, everywhere — stored solutions, traced
paths, hint reveals — matching the feed, so there are no adapters.

**`status` carries `words_found` but never the TOTAL.** That blob is readable by
the whole club, and "this board holds six words" is real information about a
puzzle whose entire content is shielded — so the readouts count up rather than
counting down, and `submit_path` doesn't return the total either. The server
still computes it for the terminal check; the client learns the game is over
from `terminal` / `common.games`, not by reaching a number it was told.

**Realtime publishes all three tables** — `games`, `players`, `events` — and
all three are required: an unpublished table in a `postgres_changes`
subscription silently kills the *whole* subscription. The registry test
(`supabase/tests/common/realtime_publication_test.sql`) guards the set.

#### Why hints share the guess table

A spent hint is a log row, and it lives in `events` rather than a
`strands.hints` sibling for one concrete reason: **the history viewer addresses
a turn by POSITION in the displayed rows** (`snapshotAt(rows, index)`,
`viewingIndex === i`). Two tables would mean merging two streams by timestamp on
every render and then indexing into the merge, with cross-table ordering ties
left nondeterministic — plus a second publication entry, a second policy, and a
second delete in `replay_board`. One table keeps the log a single sequence.
`scrabble.plays` is the same pattern (`kind in ('word','exchange','pass',
'forfeit')`).

The shape that makes it cheap: **`result` is null on a hint row**, and every
query in `supabase/sql/strands.sql` filters on `result` — so a hint is invisible
to all of them *by construction*. Adding hints changed no existing query.
`hint_test.sql` pins that (the guess-predicate count excludes the hint row), so
it can't quietly stop being true.

**A hint row stores its coords and not its word.** The coords are what let the
viewer re-ring a past hint exactly as it looked; the word is withheld because a
hint has never said it, and the log is the one place that would outlive the
on-board ring being retired. They go to `TurnSnapshot.hintCoords`, kept separate
from `highlight` so the board draws them as *rings with no connecting line* —
replaying a hint as a traced route would show an order the hint never gave.

The one thing this discloses that nothing else did: **the location of a hinted
word nobody went on to find**, visible once the compete log opens at terminal
but before an opt-in solution reveal. A narrow, deliberate acceptance — every
*found* word's coords were already open at terminal via its `theme`/`spangram`
row. If it ever needs closing, the fix is one expression in a `security_invoker`
view, the same mechanism `games_state` and `players_state` already use.

### Play states

Coop: `playing` → `won` (all found) / `lost` (timer expired) / `ended` (manual,
neutral).

The clock is a **loss** under the roster's one test — *you lose if the game had a
reachable end and you didn't reach it* ([states.md](../states.md)) — so strands
sits with wordle and connections, not with an untargeted word hunt where the
clock is merely how a session stops.

---

## 4. RPCs

| RPC | job |
|---|---|
| `create_game(target_club, setup, player_user_ids, mode)` | Copies the puzzle onto the row, seeds counters + `status`, seats turn-order when `setup.coop_style = 'turns'`. Title is `"<date>: <clue>"` — the clue is the prompt, not the answer, so it spoils nothing and tells two games apart far better than a bare date. |
| `submit_path(target_game, path)` | The move RPC. See the order below. |
| `spend_hint(target_game)` | Picks a **random** unfound theme word and publishes its **coords**, never its word. |
| `end_game` / `submit_timeout` / `replay_board` | The neutral manual stop, the clock, and the restart. |

### Classification order — a rule, not an implementation detail

1. the path matches an unfound theme word's path → **theme** / **spangram**
2. shorter than `min_word_length` → **too_short**
3. already credited this game → **duplicate**
4. in `common.words` at the setup band → **hint_word** (+1 point, capped)
5. otherwise → **invalid**

**The theme check runs first and unconditionally.** Not because NYT ships short
theme words — the archive minimum is exactly 4 — but because *33 of 148 sampled
theme words are exactly 4 letters*, so a club raising `min_word_length` to 5
would have real answers rejected under a length-first check. The collision is
with our own knob.

**Hard vs soft rejects.** A structurally impossible path (off-board,
non-adjacent, self-crossing) **raises**: the FE's reducer cannot produce one, so
it means a broken or hostile client, and logging it would pollute a turn log
players read. A path through a **spent tile** also raises, with one honest route
in: a coop submit in flight while a peer's find lands can cross tiles the sender
didn't yet see consumed — a realtime-lag-sized window in which the raise's
message reads fine as the error pill and nothing commits. Every malformed-path
shape gets a *designed* P0001, never a raw cast error (`validation_test.sql`
plants each one). A merely wrong word returns softly and *is* logged.

The dictionary filter is the **may-enter tier** ([common.md](../common.md)):
`difficulty <= band` and nothing else. No slur / crude / slang / dialect filter —
the player chose to type it.

> **The band runs backwards from waffle's.** A *higher* band makes strands
> *easier*: more words qualify, so hints come faster. Same direction as
> spellingbee's `legal`, opposite of waffle's tier. The setup form says so out
> loud.

---

## 5. The hint economy

Distinct valid non-theme words fill a **bar**; at `hint_cost` (default 3) the
Hint button activates. Spending rings one unfound theme word's tiles — **no
connecting line**, so the player still works out the order.

- **The pool is shared in coop**, which forces the random pick server-side and
  persisted: a client-side roll would show three players three different hints
  for one spent token.
- **The bar caps** at `hint_cost`. Points found while a hint sits unspent are
  lost, and nothing warns about it — the full bar is the signal, which is why the
  filled state is styled distinctly rather than merely being 100% wide.
- **The button is clickable before the bar fills**, and answers the click with
  the count still to go — a `warning` pill, "3 more words needed for a hint". The bar
  shows *progress* but never states the remaining number, so an early click is a
  fair question, and a disabled button is the one response that can't answer it.
  The two states still read differently: the button only fills amber
  (`hintReady`) when a hint is actually there to cash. Words is the literal unit
  — `spend_hint`'s ledger adds exactly one point per valid non-theme word — and
  the singular ("1 more word needed") is unit-tested, since it's the state
  preceding every hint anyone ever earns.
- **One hint at a time.** A second is refused while one is unsolved; the board
  can only ring one word legibly.
- **Not turn-gated.** Spending is a decision about a team resource, not a move.
- **Logged as a turn.** `spend_hint` writes one `events` row (`kind = 'hint'`),
  so a spent hint takes an ordinary numbered position in the log — a `neutral`
  bar, a lightbulb glyph, "Hint used" where a word would be, and a live `#N`
  that replays its ring. **One row, attributed to whoever cashed it**, even in
  coop where the counters fan out to every player: a shared pool still has a
  single person who decided to spend it.

---

## 6. Frontend

Folder mirrors the other games'. Three notes worth carrying:

**The setup picker shows the clue.** A date names nothing — with 884 of them the
easy mistake is starting a puzzle you've already played and finding out once the
board is up. So `SetupForm` selects `clue` alongside the date and prints it under
the input, quoted, in full-strength text (it's a value you act on, not the muted
helper line above it). Its `<p>` carries a `min-height` and always renders: the
archive arrives asynchronously, and three `SetupSection`s plus the timer sit
below it, so a conditionally-mounted line would drop the rest of the form by a
row the moment the fetch resolved. One line is enough — measured, the longest
clue in the archive is 38 characters against a 428px box.

**No typed WORDS — but typed LETTERS.** A board repeats letters, so a typed
*string* doesn't identify a path: `PAPARAZZI` on a board with four `A`s is
genuinely ambiguous, and that hasn't changed. What changed is where the
disambiguation happens. `typeLetter` (lib/trace.ts, the keyboard twin of
`clickTile`) resolves one keystroke against the cells that could actually come
next:

- **Nothing traced** → any unused cell bearing the letter, anywhere. That
  competes with all 48 cells, so it's usually ambiguous — a word's first letter
  is usually a click.
- **Mid-word** → only the ≤8 neighbours of the last cell, minus cells already in
  the trace (a path can't visit one twice; clicking your own cell still means
  "undo back to here", which stays click-only). A small field, so this is usually
  unique — which is what makes typing the *rest* of a word work.
- **Several matches** → they ring **red** for a beat and wait for a click. No
  pill: this slot IS the entry area, so a pill would hide the word being built to
  say something the board says better. **No match** → an error pill, because
  that's nearly always a mistake rather than a choice.
- An unmatched letter **never restarts the trace elsewhere** the way a far
  *click* does. A click names a cell unambiguously; a keystroke doesn't, so
  jumping the trace across the board would be guessing at intent.

So the rule the original design derived from still holds — it's refined, not
reversed. Physical keys also do the rest: **Backspace** drops the last tile,
**Enter** submits, **Tab** is swallowed, and any key dismisses the last pill. The
tiles are `tabIndex={-1}`: 48 tab stops would bury every real control, the same
reasoning the shared `WordList` records.

**The move row** is the shared `<MoveRow>` (⌫ | the traced word in an
`<EntryBox>` | Submit) — the same control every other game's entry wears. strands
can't use `<EntryRow>`: its string is *derived* from the path (`wordFromPath`),
so EntryRow's `value`/`onChange` contract runs backwards. The buttons are the
pointer twins of Backspace and Enter, and the win is touch — on a phone there's
no keyboard, so submitting used to mean re-clicking the last letter and nothing
else. The row **shares its fixed-height slot with the verdict pill** (you're
either building a word or reading what the last one did), which is `<EntryRow>`'s
own behaviour; stackdown, whose pill has a separate reserved row, is the odd one
out.

**Bare letters, no tile boxes** — a documented departure from the
tile-and-warm-ramp vocabulary in [ui.md](../ui.md). A disc IS the mark here, and
a box around it reads as noise; the board instead gets one frame at its edge,
because without it the letters float in the page.

The path layer is **one SVG under the letters**, in cell units
(`viewBox="0 0 6 8"`), so a cell centre is exactly `(col+0.5, row+0.5)` and every
radius is a fraction of a cell — no pixel maths, no resize observer. Discs are
drawn in the same SVG as the lines, which is what guarantees a line passes *under*
its discs at any size.

**Every log row leads with a verdict GLYPH** — trophy (spangram), star (theme
word), check (valid word), X (rejected) — from the shared icon registry, named
for the outcome rather than for this game so another word game's log can reuse
them. Two jobs: an eye running down the log sorts finds from misses without
reading a word, and it is the NON-COLOUR encoding of the same fact, which the
PDF printer will need — [pdf.md](../pdf.md) prints in three shades of grey,
where purple and gold are the same ink. The glyph sits in a FIXED-width slot, so
words start at the same x whichever mark precedes them, and it tints with its
word so the two can never disagree about a row.

**Colours**, and each says one thing: purple = a found theme word, gold = the
spangram, light purple = the live trace, grey = a word nobody found (drawn at the
reveal). Green belongs to the hint bar and the `valid word` pill. The turn log
uses *darker text variants* of purple and gold — a colour tuned as a disc fill
under white letters is not the same colour that reads as 15px type on a white row.

**Pills speak the shared word-game format** — `WORD — body`, word first and in
caps, which is `useWordSubmit`'s `line()` convention. strands can't use that hook
(its acceptance is server-side, not a local list lookup), so it matches the
*output* instead of inventing a second dialect; `too short` and `not a word` are
word-for-word boggle's.

**New game advances to the next UNPLAYED puzzle** in the current mode, carrying
the club's knobs (and the mode itself) forward, and the confirm names the date.
The played set comes from the `club_game_status` view + the shared
`nextUnplayedPuzzle` rule (`common/lib/game/nextPuzzle`), exactly connections'
shape — a "New game" that re-dealt a date the club has seen isn't new. Restart
is for replaying the same board. At the end of the archive it says so as a
one-button notice.

### Print to PDF

One **track per board** (`common/pdf/columns`, three to a page): coop's team
board is a single column, compete gets one per player — there each racer really
does have a different board over the same letters, and a merged column would
file one player's words under another's grid. Same reasoning wordle and waffle
print by.

Printing a board whose meaning is COLOUR needs the encoding to move to **shape**
(pdf.md — colour only for meaning, never as the only carrier):

| on screen | on paper |
|---|---|
| purple disc + line (theme word) | a solid grey line through the letters |
| gold (the spangram) | the same line, drawn **heavier** |
| grey (a missed word, at the reveal) | a **dashed** line |

Letters print black throughout, over a **white knock-out disc** on every traced
cell — the mono equivalent of the on-screen coloured disc, and the reason a
connector doesn't run straight through the glyph it connects. Circling every
found tile instead would ink most of the page: the hidden words tile the board
exactly, so a solved board is entirely covered.

The log's verdict glyphs are the vector marks from `common/pdf/marks` (a filled
square for a find, bigger for the spangram, ✓ for a valid word, ✗ for a
rejection) — jsPDF's core fonts are WinAnsi, so a unicode star or trophy would
not render at all. That non-colour encoding is why the on-screen glyphs were
added when they were.

The shield applies here too, and needs no separate rule: missed words come from
`solution`, which is null until the reveal, and mid-game compete prints only the
caller's track because RLS hasn't handed over anyone else's events — a rival's
column would be an empty grid claiming they found nothing.

### Turn-history replay

Click any `#N` in the log to see the board as it stood at that submission
(`useHistoryViewer` + `lib/history.ts`, like the other seven).

**A filter, not a reconstruction** — which is unusual, and falls out of the
tiling invariant. The board only ever ACCUMULATES: a theme word is found once,
its tiles lock, nothing is removed or changed. So "the board at turn N" is
literally "the theme words among the first N+1 rows". waffle re-applies each
swap to its scramble; stackdown's tiles vanish; strands just slices.

The boundary is **inclusive** — turn N shows the board *after* it, with the
cells that turn traced ringed in the history gold. That matters most for rows
that changed nothing: a rejected word's route is exactly what you want when
reviewing why it failed, and an exclusive boundary would hide it.

`#N` is a live handle only when the shown rows ARE the board's own sequence —
the shared picker's `boardIsShown`, true for coop's Team view and for your own
in compete. Pick one player out of a shared coop log and position 3 isn't the
board's turn 3, so the handle degrades to a plain number.

### The data hook

`useGame` subscribes to `strands.events`, `strands.players`, `strands.games`
**and `common.games`**. That last one is unusual for a per-game hook and is the
shield's fault: `games_state.solution` is gated on
`common.games.solution_revealed`, and both writers of that flag touch only that
row — so without it the flag flips, the shell re-renders, and the hook keeps
serving the stale `solution: null` it fetched before the reveal. (Found by
clicking Reveal and watching nothing happen.)

Reads go through the two `security_invoker` views: `games_state` (the solution
gate) and `players_state`, which is the mid-race privacy mechanism — it nulls a
rival's `hint_points` and `active_hint_coords` until you may see them (own row,
or terminal). The RLS *policy* says who sees a row; the view says which fields.

---

## 7. The archive, and being a good guest

`gmake g-strands-fetch` (network, incremental, rare) writes
`supabase/data/strands-puzzles.jsonl`; `gmake g-strands-puzzles` loads that file
into the database with **no network at all**, and is what `db-data` runs.

The split exists because folding the fetch into the import meant `gmake db
ENV=local` — routine and frequent — fired ~900 requests at nytimes.com on every
reset. The archive is committed like the rest of `supabase/data/`, so a fresh
clone imports offline too.

The feed (`nytimes.com/svc/strands/v2/<date>.json`) is **public** — no cookie jar,
unlike the NYT crossword path. It starts 2024-03-04.

**The import guard** ([`lib/strandsPuzzle.ts`](../../supabase/scripts/lib/strandsPuzzle.ts))
checks five things per puzzle, and runs on both sides — at fetch so bad data never
reaches the file, at import so a hand-edited file fails loudly:

1. the board is 8 rows of 6;
2. every path is contiguous under 8-way adjacency;
3. every path actually **spells** its word on that board — the check that catches
   a feed change flipping coordinates to `[col,row]`, which no shape check would
   notice;
4. the spangram **spans** two opposite edges (all ~900 archived puzzles do);
5. the words **tile** the board exactly.

The importer **updates on conflict** (`source_id`), so a re-fetch carrying a
corrected puzzle refreshes its row in place — games in flight are untouched
either way, since every game plays from its own frozen copy.

NYT's `solutions` list (its own valid non-theme words) is deliberately **not**
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
actually traced), so shipping an unused solver to serve a test would be backwards.

---

## 8. Compete

Each player races the **same puzzle on their own progress**: own found words,
own hint bar, own locked tiles. `strands.players` carries that state, and it is
the shape in BOTH modes — coop moves every row in lock-step (its pool is
shared), compete moves only the actor's. One code path, one predicate apart;
connections does the same with `mistake_count`.

### The winner, and why the race can't end early

**Whoever SOLVED using the fewest hints**, earliest solve breaking a tie.

That single rule sets everything else. A player still going might finish on
fewer hints than the current best, so first-to-solve would crown the wrong
person and make the hint count decorative. Instead a solver goes **locally
terminal** — their board freezes, their number is final, they can't spend
another hint — and the game ends when nobody is still racing: all solved, all
conceded, or the clock.

Getting a hint POINT costs nothing; only cashing one does. That's the whole
tension: a player who never spends can be beaten on speed by nobody, only
matched — so the pressure is to solve *clean*, not fast.

### What a rival may see

Exactly one number mid-game: **hints used**. It's the ranking, so it makes the
race legible, and it says nothing about the puzzle.

Withheld until terminal:

| hidden | why |
|---|---|
| their found words | the `events` policy gains its compete arm — word counts are progress |
| their hint **bar** | its fill proxies how many valid words they've found, so publishing it would leak sideways exactly what the events RLS hides |
| their revealed word | part of the answer |

`solved` / `solved_at` **are** public: race status, not puzzle content — knowing
someone finished tells you the bar you have to clear, which is the same kind of
fact as their hint count.

This is a **deliberate divergence** from the rest of the roster, which shows
peers a progress metric "so the race has tension" (connections' mistakes,
boggle's score). Here the hint count carries that instead.

### Concede

`strands.concede`, **not** `common.concede`. The shared one ends a game as a
collective loss the moment the last player drops — but a table where one player
SOLVED and the rest walked away must end with that solver winning. So strands
takes the documented split: `common._set_conceded` for the guarded flag flip,
then its own `_maybe_finish_compete`.

**A conceder is out, in both directions.** `submit_path` and `spend_hint`
refuse a conceded caller (`'you have conceded'` — the connections guard: the FE
freezes the board, but a submit in flight or a stale second tab must not let a
drop-out complete the win condition), and the finisher's ranking excludes
conceded players even where a solved row exists — solve-then-concede is
nonsensical but reachable by RPC, and it forfeits (`conceded_test.sql`).

`concede` also takes the `strands.games` row lock **before** the flag flip,
deliberately: `submit_path` and `end_game` serialize on that row, and without it
a last solve racing a last concede could each snapshot the other as "still
racing" and leave the game stuck in `playing` with nobody left to end it. Lock
order is `strands.games` → `common.games` on every path, so no deadlock.

The manual **End** stays neutral in both modes. A race called off early didn't
finish, and handing the trophy to whoever was ahead would reward stopping at the
right moment.

### Terminal vocabulary

`won_compete` / `lost_compete` (nobody solved — `status.outcome` names which of
timeout / all-conceded / unsolved) / `ended`. The `_compete` suffix is
load-bearing rather than cosmetic: `common.concede` reads it off the gametype
string to decide how an all-conceded table ends.

The club label publishes **nothing** mid-race — `status` is club-readable — and
at terminal names the MARGIN (`Won · 0 hints`) rather than the finish order.

## 9. Tests

**pgTAP** (`supabase/tests/strands/`, all on the synthetic fixtures in
`setup.psql` — a rows-are-words board of dictionary-proof nonsense, plus the
ambiguous-ABBA board that pins the match-by-placement fix):

| file | pins |
|---|---|
| `gameplay_test.sql` | the classification order, the hint bar's fill/cap/dedup, coop terminal = board consumed |
| `validation_test.sql` | every malformed-path shape gets its **designed** P0001 (planted one by one — the original guard used `rs @> array[null]`, which can never match, so this file exists to fail on a regression to that); integral floats normalize instead |
| `hint_test.sql` | spend semantics: random pick persisted, coords only, one at a time, cleared by placement |
| `turn_order_test.sql` | the opt-in turns coop: pointer seating, `'not your turn'`, advance on accepted moves only |
| `compete_test.sql` | the race: per-player boards, the privacy line, fewest-hints ranking, concede-with-a-solver |
| `conceded_test.sql` | a conceder gets no more moves and can't win (the forfeit ruling, incl. solve-then-concede); all-conceded → `'conceded'`; the mid-race `active_hint_coords` shield |
| `timeout_test.sql` | the clock in both modes: coop `lost`/`'timeout'`, compete crowns a solver or ends `lost_compete`/`'timeout'`; the terminal RLS flip on `events` |
| `terminal_test.sql` | terminal states + the reveal gate |
| `rls_test.sql` | the solution shield + per-mode row visibility |

The publication registry (`supabase/tests/common/realtime_publication_test.sql`)
carries the three strands rows.

**FE Vitest** (`src/strands/`): `lib/board.test.ts` + `lib/trace.test.ts` (the
geometry and the reducer), `lib/board.oracle.test.ts` (the ~2500-word NYT parity
oracle — see [The oracle](#the-oracle)), `lib/history.test.ts` (the snapshot
filter), `pdf/model.test.ts` (the print model, incl. the shield). The shared
`nextUnplayedPuzzle` rule is tested in `common/lib/game/nextPuzzle.test.ts`.

**e2e** (`e2e/`): `strands.e2e.ts` (a coop game played through),
`strands-mobile.e2e.ts` (the phone layout), `strands-print.e2e.ts` (the PDF).
