# strands (PaulPath)

A NYT-Strands-style word search: an 8×6 board of letters hiding a set of **theme
words** plus a **spangram** — the one that runs edge to edge and names the theme.
You trace a word by clicking its letters in order. Valid non-theme words earn
hint points; enough of them buys a hint.

"strands" is the codename (as "codenamesduet" is for Codenames Duet). The
user-facing brand is **PaulPath**, which lives only in the manifest's `BRAND`
const; gametype / schema / folder are all `strands`.

**Coop-first.** Only `strands_coop` is registered, in `common.gametypes` and in
`src/games.ts` — a Start button for an unbuilt game is worse than a missing one.
`strands.create_game` refuses `mode = 'compete'` explicitly rather than
half-working. See [Compete, when it lands](#8-compete-when-it-lands).

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
strands consistent with the other twelve games; `gametypes.hides_solution = true`
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

**Match by path, not by string.** In one sampled puzzle all 8 theme words also
appear in NYT's own solutions list, so string matching would misclassify. Path
matching also means tracing the right letters through the wrong cells is not a
find.

**No Realtime Broadcast channel.** A peer sees your word when you **submit** it;
nobody watches anyone else's tiles light up mid-trace. That is the opposite of
connections, which shares partial selection so coop players build a guess
together — and it means `postgres_changes` on the two tables carries everything.
Recorded so the absence doesn't read later as an oversight.

---

## 3. Schema — `strands.*`

Two files, per [Schema vs code](../supabase.md#schema-vs-code):
`supabase/migrations/20260804000000_strands.sql` (shape, applied once) and
`supabase/sql/strands.sql` (functions/views/policies/grants, re-applied every
deploy).

| table | purpose |
|---|---|
| `puzzles` | The imported NYT archive. `source_id` (puzzle number), `puzzle_date` (unique), `board` (8 rows of 6), `clue`, and the shielded `solution`. Only `(id, source_id, puzzle_date)` are granted to `authenticated` — enough for the date picker, not enough to study tomorrow's board. |
| `games` | One playthrough. Follows the [library-puzzle provenance rule](../common.md#library-puzzle-games-provenance-not-dependency): everything needed to play *and* identify the game is copied on, and `puzzle_id` is a soft FK (`on delete set null`), so the archive can be re-imported freely. Carries the shared coop hint state (`hint_points`, `hints_spent`, `active_hint_coords`) and the three setup knobs, denormalized because they're immutable and read on every move. |
| `guesses` | The append-only log — **one table, not two**. Found theme words are the projection `result in ('theme','spangram')`; credited hint words are the distinct `hint_word` set. Only state that can't be derived lives as columns. |

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

**Realtime publishes both `games` and `guesses`**, and both are required: an
unpublished table in a `postgres_changes` subscription silently kills the *whole*
subscription.

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
non-adjacent, self-crossing, through a spent tile) **raises**: the FE's reducer
cannot produce one, so it means a broken or hostile client, and logging it would
pollute a turn log players read. A merely wrong word returns softly and *is*
logged.

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
- **One hint at a time.** A second is refused while one is unsolved; the board
  can only ring one word legibly.
- **Not turn-gated.** Spending is a decision about a team resource, not a move.

---

## 6. Frontend

Folder mirrors the other games'. Two notes worth carrying:

**No text entry at all** — the first game on the roster with none. A board
repeats letters, so a typed string doesn't identify a path: `PAPARAZZI` on a
board with four `A`s is genuinely ambiguous. Physical keys still do the rest —
**Backspace** drops the last tile, **Enter** submits, **Tab** is swallowed, and
any key dismisses the last pill. The tiles are `tabIndex={-1}`: 48 tab stops
would bury every real control, the same reasoning the shared `WordList` records.

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

**New game advances to the next day's puzzle**, carrying the club's knobs
forward, and the confirm names the date. Restart is for replaying the same board.
At the end of the archive it says so as a one-button notice.

### The data hook

`useGame` subscribes to `strands.guesses`, `strands.games` **and
`common.games`**. That last one is unusual for a per-game hook and is the shield's
fault: `games_state.solution` is gated on `common.games.solution_revealed`, and
both writers of that flag touch only that row — so without it the flag flips, the
shell re-renders, and the hook keeps serving the stale `solution: null` it fetched
before the reveal. (Found by clicking Reveal and watching nothing happen.)

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
checks four things per puzzle, and runs on both sides — at fetch so bad data never
reaches the file, at import so a hand-edited file fails loudly:

1. the board is 8 rows of 6;
2. every path is contiguous under 8-way adjacency;
3. every path actually **spells** its word on that board — the check that catches
   a feed change flipping coordinates to `[col,row]`, which no shape check would
   notice;
4. the words **tile** the board exactly.

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

## 8. Compete, when it lands

Per-player hint pools (moving that state off `strands.games` onto a
`strands.players` table), guesses private until terminal via the mode-aware RLS
arm the other compete games carry, `won_compete` / `lost_compete`,
`common.concede`, and an `OpponentStrip`.

The `_compete` suffix is load-bearing, not cosmetic: `common.concede` reads it off
the gametype string to decide whether an all-conceded table ends `lost_compete` or
plain `lost`.

## 9. Deferred

Catch-up work — each is a thing the other games already have, so none is new
invention:

- **Print to PDF** ([pdf.md](../pdf.md)). Composes from the shared `common/pdf/`
  helpers: the board grid, the found words, the theme clue.
- **Turn-history viewer.** strands suits it unusually well — the board is
  strictly cumulative, so "the board at turn N" is a *filter over the log*, not a
  reconstruction. Wire through the shared `useHistoryViewer` + a per-game
  `lib/history.ts`. Note it interacts with the turn-log picker: `boardIsShown`
  goes false when a single player is picked out of a shared coop log, so `#N`
  degrades rather than replaying the wrong turn.
- **Mobile on-device pass.** The recipe is composed and the shape is friendly (a
  portrait 6×8, tap input), but it hasn't been checked on real hardware.
