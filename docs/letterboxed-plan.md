# letterboxed (brand **SnakeBox**) — working plan

> **Working doc.** This is a plan, not a reference. Once the game ships, the
> durable material moves to `docs/games/letterboxed.md` + rows in
> `docs/features.md`, and this file gets deleted. See
> [docs/deferred.md](deferred.md) for where leftovers go.

Codename `letterboxed` everywhere in code, CSS, schema, and prose. **SnakeBox**
is the brand and appears **only** in the manifest's `BRAND` — same split as
wordwheel/MooseWheel. See [docs/naming.md](naming.md).

A port of NYT's Letter Boxed. The 15th game.


## 1. The game

Twelve distinct letters, three on each side of a square.

- A word uses board letters only, and **no two consecutive letters may come
  from the same side** (you always cross the box).
- Every word after the first **starts with the previous word's last letter**.
- Letters may be reused freely, within a word and across words.
- You win by touching **all twelve letters**, in as few words as possible.

### The four structural facts that drive every decision below

1. **The board is tiny and immutable.** Twelve letters plus a side partition.
   Nothing mutates — letters get *marked used*, they never leave. Same row as
   strands in `features.md` → Board change during play.
2. **Game state is one chain of words.** Everything else derives from it:
   used-letters = the union, tail letter = the last char, score = the length.
   There is no other state.
3. **Validation is three cheap checks** — in the board's playable set, no
   same-side consecutive pair, starts with the current tail.
4. **The complete playable word set is computable at build time.** Filter
   `common.words` with the indexed subset test spellingbee already runs
   (`letter_mask & ~board_mask = 0`), then apply the adjacency filter. A few
   hundred to a few thousand words. **This one fact is what makes par, hints,
   and dead-end detection nearly free** — everything in §4 and §6 rests on it.

### Where it sits on the roster

It fills two real gaps: it's the only game where a word's **last letter**
constrains the next (a genuinely new verb), and the only one where **move count
is the score in coop too**, not just compete.


## 2. Modes

### Coop, free-for-all

One shared chain; anyone submits. The server validates against the **current**
tail, so a race loser gets *"the chain moved on — now starts with E"* rather
than a corrupted chain.

### Coop, turn-by-turn

Uses `coop_style: 'turns'` + `common.games.current_turn_user_id` +
`_advance_turn` verbatim; `TurnStatusLine` and `waitingTurnPill` drop in with no
new copy. This is the strongest turn-by-turn fit on the roster — the chain hands
off natively ("I ended on T, you start on T"). No passing.

### Compete

Private chains, identical board — wordle's model, including mode-aware RLS on
the events table that opens at terminal. Mid-race a rival sees **one number**:
words played.

**Winner: first to cover all twelve letters within the cap. Race ends.** That
puts letterboxed with PN/WK/SD/SS/MG/CP rather than the fewest-X games.

<details>
<summary>Why not "fewest words" (the first design, rejected)</summary>

The roster has two fewest-X compete games — wordle (fewest guesses) and strands
(fewest hints) — and neither metric is **grindable**: wordle's guesses are
capped, and a spent strands hint can't be un-spent. Letterboxed's chain is the
opposite: freely resettable, so clearing and retrying resets your word count to
zero. "Fewest words" therefore rewards patience, and the equilibrium is
everyone reaching par with the win going to whoever sat there longest — an
endurance test with the other players watching, which is exactly the failure the
Zoom-call metaphor in CLAUDE.md exists to catch.
</details>

### The cap — `max_words`, a direct setup choice

> **Revised by the §9 spike.** This started as waffle's `max_swaps = par +
> extra_swaps`. It can't be: **par is structurally 2** on every board we can
> generate (§9.1), so `par + extra` is a constant wearing a computation's
> clothes. The cap is just a number the players pick — wordle's 5–8 guess field,
> not waffle's par+extra.

`max_words` is a setup integer (2–6, proposed default 5 — NYT's dailies target
4–5). No par column, no build-time BFS to derive one.

The cap applies to **both** modes, so the two siblings teach one constraint. In
coop a relaxed pair can pick a loose cap and play "can we do it at all," while a
tight cap turns it into a par chase.

**The cap is a shape constraint, not a bustable budget.** Because undo refunds
(§3), you can't lose by exhausting it — your chain may simply never exceed N
words. This differs from waffle, whose swaps genuinely run out. It's faithful to
NYT (solo Letter Boxed has no fail state either; the satisfaction is beating
par), but it means **the timer carries more weight here than in waffle**, and
the setup copy should nudge toward one at tight caps.

### Ending without a solve

| | |
|---|---|
| Coop, timer expires | **Loss** (the roster's coop default) |
| Compete, timer expires | Resolve on **most letters covered** → fewest words → earliest → co-winners (MC/RA/WW resolve-from-standing; WW's comparator shape) |
| No timer, group calls it (`end_game`) | Collective loss, nobody wins |

Fewest-words is safe as a *timeout tiebreak* even though it was wrong as the
primary metric: at the buzzer there's nothing left to grind.


## 3. Undo, clear, and dead ends

The chain can **strand you** — the tail letter may have no playable
continuation. Without an escape the game becomes unwinnable by accident, so:

- **Undo last word** is the primary escape, and it **refunds** against the cap.
  A non-refunding undo would make a dead end fatal and leave the player sitting
  idle, which is the failure we're designing against.
- **Clear chain** is the bigger hammer — crosswords' "Clear board" precedent.

### Who may undo, per mode

| mode | undo | clear |
|---|---|---|
| Coop, free-for-all | anyone, last word only | yes |
| Coop, turn-by-turn | the **current player — and it consumes their turn** | **not offered** |
| Compete | your own chain, always | yes |

**Why undo costs a turn in turn-coop.** A free undo makes the chain meaningless;
no undo makes a dead end fatal. Spending the turn prices it correctly. It also
creates the mode's best dynamic: undoing doesn't help *you* — you retreat and
the **next** player inherits the improved position. It's a sacrifice, so word the
log and pill accordingly: *"Leah cleared the dead end"*, not *"Leah undid
TRACE"*.

**Why clear isn't offered in turn-coop.** If both actions cost one turn,
clearing four words is strictly cheaper per word than undoing one, inverting the
pricing. And it's redundant: repeated undo already bottoms out at the empty
chain, one turn at a time — which is the correct speed, since a group that
genuinely needs to restart should feel it.

**No deadlock risk**: chain length decreases monotonically under undo, so the
worst case is a group burning a few turns retreating to empty, which is
self-correcting and legible in the log. The solo edge case doesn't exist —
`CoopStyleField` hides for solo, so turn-coop never runs with one player.


## 4. Boards: a seed table sampled and re-partitioned at game time

**Hybrid, and the split isn't the obvious one.** Not a whole-puzzle library
(connections/stackdown/strands) and not fully on-demand
(spellingbee/boggle/waffle/wordwheel/wordiply), but **wordwheel's shape: a
precomputed *seed* table, sampled and re-partitioned per game.**

- *Why not fully on-demand.* A good board must be known solvable in few words,
  which means finding word pairs A, B with `last(A) == first(B)` and
  `|letters(A) ∪ letters(B)| == 12`. Grouped by the joining letter that's still
  `count-ending-in-L × count-starting-with-L` — ~10⁸ pairs for a common letter.
  Not a runtime scan.
- *Why not a whole-puzzle library.* The expensive half (finding the pair) is
  reusable, but the **partition** — assigning twelve letters to four sides of
  three — is cheap, and it's what makes a puzzle feel different. One seed yields
  many genuinely distinct boards.

### Offline: `gmake g-letterboxed-seeds`

Mirrors `g-wordwheel-pangrams`. Scans `common.words` for chained word pairs
(`last(A) == first(B)`) whose letters union to exactly twelve, and emits
`letterboxed.seeds` keyed by the sorted twelve — deduped exactly as
`wordwheel.pangrams` is, keeping the easiest solving pair per key.

**Two pool filters, both load-bearing:**

- **Drop words with a doubled letter** (`bell`, `coffee`). A repeated letter is
  two consecutive letters on the same side *by definition*, so such a word is
  unplayable on every possible board — not a bad seed, not a word at all here.
  That's **24% of the dictionary** (65,239 of 270,014), so filtering at load
  rather than at seed-selection matters.
- **Drop words with >12 distinct letters** — they can't fit any board.

Rejects: playable sets below the richness floor (§9.3); boards solvable in one
word (2,946 words have exactly twelve distinct letters, so this is rare but
real).

**`seed_band` is fixed at ≤ 2, not a player knob** — see §8.

### At game time: the `letterboxed-build-board` edge fn

The sixth of that family.

1. Sample a seed.
2. Find a random valid **partition** into 4×3 by backtracking over the conflict
   graph (an edge between letters adjacent in either solution word). Twelve
   nodes — microseconds, and a fresh partition per game is what makes one seed
   reusable. **Cannot fail**: the importer only stores seeds it has proved
   partitionable (§9.2), so no fallback path is needed here.
3. Fetch the **playable set** via the indexed subset test + adjacency filter.
4. Call `create_game` with sides + the playable set.

**Par is not computed.** Because the partition is built so that both seed words
are playable, and both are legal at the game's band, the chain A→B *is* a
2-word solution — so par ≡ 2 by construction, on every board. The build-time
BFS this plan originally carried has been deleted; the only BFS left is the
FE's hint search (§6).


## 5. Where the code lives — and why no BFS in plpgsql

**The playable set ships to the FE on the game row.** Per CLAUDE.md's trust
model this costs nothing: friends don't dig through devtools, and there is no
anti-cheat requirement to protect. What it buys is large:

- **The hint BFS becomes ~30–40 lines of TypeScript on the FE** — a `Map`-keyed
  search with a parent map, unit-testable in Vitest like any other lib. No RPC,
  no edge-fn round trip, no SQL.
- Instant local validation feedback is a free bonus (not the motivation).

The alternative was a BFS in plpgsql, which would have been the most complex SQL
in the repo for a single button: ~50–70 lines as a recursive CTE (where `union`
gives visited-set dedup for free, but carrying the word path along makes every
row distinct and silently breaks that dedup), or ~100–140 lines imperative with
a `boolean[]` visited array over `used_mask * 27 + tail_idx` and a parent array.
Only pgTAP could test either.

**Nothing complex moves server-side instead**, because par is already computed
in TypeScript by the board builder and stored on the row. So `submit_word` needs
only `word = any(playable)` + a tail check + an append — array membership, not
search. That's the wordwheel/spellingbee division of labor: **edge fn thinks,
plpgsql books, FE interacts.**

### Still server-authoritative

The FE having the list does **not** make this trusting-commit. The server
re-validates and arbitrates append order, because chain order is real and
free-for-all races need an authority. Closest to scrabble, but not identical —
`features.md`'s trust-model row needs a **fourth value**, not an existing one.


## 6. Hints

**Disabled in compete.** Under "first to meet the bar wins," an optimal hint is
a straight-up win button — whoever clicks fastest wins. (Under the rejected
fewest-words metric a hint cost you through the comparator; that pricing died
with the metric.)

**In coop**, the hint runs the same BFS from the live state — which *is* the BFS
state, `(letters used, tail letter)` — and returns a word **on a shortest path
to all-twelve-used**. Not "a word that works" but "a word that keeps you on
par." The same call detects **stuck** (no continuation) and **off-par** (still
finishable, but not in N).

Graded, cheapest first — ship 1 and 3, defer 2:

1. **Shape only** — "a word starting with T uses 3 new letters."
2. **Partial** — `T _ _ _ _ _` (crosswords' check/reveal vocabulary).
3. **The word.**

Track `hints_used` per player and show it in coop; don't penalize. **Don't**
port strands' earned-hint economy — there's no "valid non-theme word" to earn
with here, since every valid word is progress.

A stuck **compete** player has no detector, which is fine: undo is free and
refunds, so they can always back out. They just have to notice themselves.


## 7. Common features

| feature | how it lands |
|---|---|
| **Turn log** | An **append-only event stream**, `letterboxed.events`, kinds `played` / `undone` / `cleared` / `hint`. Strands' shape (CLAUDE.md records the `guesses` → `events` rename). Undo and clear become log entries instead of row deletions, so `useHistoryViewer` is a **fold over events** rather than a reconstruction — closer to strands' pure filter than to duet/connections' replay. Compete reuses `wordle.guesses`'s mode-aware RLS wholesale. Line: `4. TRACE — +3 letters (5 left)` |
| **Restart** | The easiest `replay_board` on the roster — the board is immutable data, so it copies sides + playable set + par into a new row and clears events |
| **Dictionary bands** | Two knobs, spellingbee's required/legal split (§8) |
| **Timer** | Optional, as everywhere. Carries more weight here (§2) |
| **Print to PDF** | The square plus the chain as a word list; the turn-log body family in `common/pdf/` |
| **Mobile** | Good. Click letters on the square (NYT's own input) with `useCaptureKeys` for physical keys, `EntryRow`/`EntryBox` for the typed box. Small square board, so the info-sheet recipe applies. Not desktop-only |
| **Click-to-define** | Nearly free on chain words via `common.words.definition` + the common lookup |


## 8. Bands — one player knob, one fixed floor

> **Revised by the §9 spike.** Two player-facing bands collapse to one.

- **`seed_band`, fixed at ≤ 2 — not exposed.** This is **spellingbee's
  precedent**: it forces a band-1 pangram so the board's own target word is
  always *gettable*. Same reasoning here — the guaranteed 2-word solution should
  be two words a person might actually think of. Band ≤ 2 yields 459k seeds,
  which is ample (§9.1).
- **`legal_band`** — what the server **accepts**, and the only band players
  choose. Setup copy: *"which words count."*

**Decoupling these is the point.** Had `seed_band` tracked `legal_band`, a band-5
game's guaranteed solution would be two words nobody knows — the guarantee would
be technically true and practically worthless. Pinning the seed low while letting
acceptance run high gives both: a findable backbone solution, and credit for the
fancy word you were proud of.

Note the direction — a **wider** legal band makes the game **easier**. That's
the strands inversion, and it goes in the schema comment because it's the
mistake a future reader will make. The spike quantifies it: median playable
words per board runs **280 → 378 → 500 → 704 → 850** across bands 1→5, so this
is a real lever on how much room a player has, not just flavor.

Plus the roster-standard clean filters: `crude = 0 AND slur = 0`, no slang,
`american AND british` by default.


## 9. Seed-yield spike — RESULTS (2026-08-05)

Measured against the local `common.words` (270,014 clean words at len ≥ 3).
Exhaustive pair enumeration: 779M pairs tested in 18s, so the importer is a
~20-second one-off. Sampling: 400 boards per band, fully solved.

### 9.1 Yield is enormous, and par is pinned at 2

**1,218,412 distinct 12-letter sets** have a chained 2-word solution.

| seed band | seeds at this band | cumulative |
|---|---:|---:|
| 1 | 222,976 | 222,976 |
| 2 | 236,229 | **459,205** |
| 3 | 121,098 | 580,303 |
| 4 | 276,883 | 857,186 |
| 5 | 256,388 | 1,113,574 |
| 6 | 104,838 | 1,218,412 |

Band ≤ 2 alone gives 459k boards — far past "will we repeat," which is why
§8 can afford to pin the seed band low and spend the whole knob on `legal_band`.
(Band 4 out-yielding band 3 isn't an anomaly: `common.words` simply holds more
band-4 words than band-3, 63,846 vs 24,003.)

**Par came back 2 on 2000 of 2000 sampled boards.** That isn't a measurement so
much as a confirmation of something structural: the partition is *built* to make
both seed words playable, so if both are also legal at the game's band, the
chain A→B is a 2-word solution and par can't exceed 2. It can't go below 2
either, except on a board whose twelve letters spell a single word (2,946 such
words exist — worth a cheap rejection check, not a search).

**Consequence: the par machinery is deleted** — no par column, no build-time
BFS, no `par + extra` cap. §2 and §4 revised accordingly. *(An earlier run
sampling seeds whose band exceeded `legal_band` did produce par 3, 4, and 5 —
that's the same fact from the other side: raise the band above the seed's and
the guaranteed solution stops being legal.)*

### 9.2 The partition constraint bites rarely — and the importer absorbs it

An initial 2,000-board sample showed zero failures, which was luck, not proof:
checked exhaustively against the real seed table, **~0.2% of pairs cannot be
partitioned at all**. A long word puts its repeated letter next to many others
(`paradigmatic` gives its `a` six distinct neighbours), and a node that busy can
run out of sides.

**Resolved by filtering at import**, so every stored seed is partitionable by
construction and the board builder needs no fallback path — 744 of 458,931
candidates dropped. Because the check is exhaustive backtracking, a stored seed
is guaranteed to partition under *any* ordering, which is what lets the builder
re-roll a different random partition per game and still be certain of finding
one. Cheap and bounded: 12 nodes, worst case ~2.1k states visited.

### 9.3 Playable-set size — the real difficulty lever

Words findable on a board, by `legal_band`:

| band | min | p25 | median | p75 | max |
|---|---:|---:|---:|---:|---:|
| 1 | 94 | 210 | 280 | 375 | 813 |
| 2 | 131 | 289 | 378 | 515 | 1,854 |
| 3 | 142 | 389 | 500 | 639 | 1,415 |
| 4 | 241 | 502 | 704 | 887 | 2,603 |
| 5 | 347 | 649 | 850 | 1,076 | 2,899 |

A 3× swing from band 1 to band 5. Keeping `legal_band` was the right call, and
for a stronger reason than the one it was kept for: it's a genuine lever on how
much room a player has, not only a fancy-word allowance.

**Richness floor: reject boards under ~150 playable words at the game's band.**
p25 sits at 210+ everywhere, so this trims only the thin tail.

### 9.4 A quarter of the dictionary is unplayable here

65,239 of 270,014 clean words (**24%**) contain a doubled letter and therefore
can't be played on any board. Filter them at pool load, not at seed selection —
the first spike run wasted a third of its candidate seeds on pairs that could
never be realized.

### Settled by ruling

- Hints disabled in compete.
- `legal_band` stays regardless of what the spike shows.
- Large games being mediocre is acceptable — "neither is wordle." Free-for-all
  coop remains a first-class mode, not a fallback.
- `numberOfPlayers: [1, 6]` (matches wordwheel/wordiply/strands).
- Brand **SnakeBox**; codename `letterboxed` everywhere else.

### Still open after the spike

- **⚑ Seed-table size — Joel wants to discuss this before ship.** The importer
  currently stores everything it finds: **458,187 rows, ~25MB**. That is far
  more than any club will ever draw from, and the arguments cut both ways —
  storage is cheap and a bigger pool means less repetition, but a smaller table
  is easier to eyeball, faster to back up, and cheaper to reason about. Options:
  keep all; sample down to ~50k at import; or keep band 1 only (222,367 rows) and
  treat band 2 as headroom. **Not blocking implementation** — the schema and the
  builder are identical either way, so this can be decided any time before ship
  by re-running the importer.
- **`max_words` default.** Proposed 5 (NYT's dailies target 4–5), range 2–6.
  Wants a play-test more than an analysis.
- **Does the seed table need wordwheel's rare-letter weighting** so J/Q/X boards
  appear? Defers cleanly; better deliberate than incidental.

### Small rules to pin before implementation

- **Minimum word length** — NYT uses 3. Proposed: fix at 3, no knob.
- **May a word add no new letters?** Proposed: yes, legal. "Bridge" words that
  only change the tail are real Letter Boxed strategy, and the cap self-limits
  abuse.
- **May the same word be played twice?** Proposed: reject exact repeats — a pure
  no-op loop.
- Does the seed table need wordwheel's **rare-letter weighting** so J/Q/X boards
  appear? Defers cleanly; better deliberate than incidental.


## 10. Build shape

Mirrors wordwheel, the most recent build of this size.

- `supabase/migrations/<ts>_letterboxed.sql` — shape: `seeds`, `games`,
  `events`, `players`, the realtime publication, band checks
- `supabase/sql/letterboxed.sql` — behavior: `create_game`, `submit_word`,
  `undo_word`, `clear_chain`, `end_game`, `concede`, `replay_board`, views,
  RLS, grants
- `supabase/functions/letterboxed-build-board/`
- `supabase/scripts/import-letterboxed-seeds.ts` + a `g-letterboxed-seeds`
  target wired into `db-data`
- `src/letterboxed/` — manifest, `db.ts`, `hooks/useGame`, board square,
  chain log, `lib/history.ts`, `lib/solve.ts` (the shared BFS), `pdf/`,
  `theme.css`
- `docs/games/letterboxed.md`, rows in `docs/features.md`, and the
  `docLinks` / `logos` / `gameStatusLabels` test entries

**Sizing.** Cheaper than strands (no archive fetch, no path matching), about
wordiply (one edge fn, a small board), but more than a pure spellingbee fork —
the chain / undo / dead-end machinery has no existing analogue.
