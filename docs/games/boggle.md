# boggle

A find-words-in-a-grid game (Boggle): players trace words through a grid of
letter tiles, stepping between orthogonally **or** diagonally adjacent tiles and
never reusing a tile within one word. The board is pre-solved at creation, so the
game knows every word that's *findable* — which is what makes the "did you find
them all?" reveal and the board-difficulty constraints possible.

> **Brand ≠ codename.** The user-facing brand is **MothCubes** (it lives only in
> the manifest `BRAND` const — see [docs/naming.md](../naming.md) and
> [[feedback_codename_brand_naming]]). Everywhere in *code / DB / schema / tests*
> the codename is `boggle`. Ported from `~/src/wsboggle` (the rules/spec) and
> `~/src/cboggle/make-dawg` (consulted only while building the solver).

boggle is a **coop / compete sibling pair** (`boggle_coop`, `boggle_compete`) and
inherits the shared chrome — timer, chat, presence-pause, manual "End game" —
through `<GamePage>` + `useCommonGame`, like every other multiplayer gametype.

> **Status: live.** boggle is the **10th** game (its `boggle_coop` / `boggle_compete`
> are the gametypes), built end-to-end
> (solver, generator edge function, migration, RPCs, FE) and shipping. Design
> forks are recorded in [§11](#11-resolved-decisions).

---

## 1. The game

A square board of `n × n` lettered tiles (`n` ∈ 4 / 5 / 6, set by the dice set).
A word is legal when you can trace it as a path of adjacent tiles — each step to
one of the up-to-8 neighbours, no tile visited twice — and the word clears the
minimum length.

- **Dice sets.** All eight wsboggle sets ship (4×4 Classic/Revised, four 5×5
  sets, two 6×6 sets), ported verbatim from `dice.py`. A board is rolled from the
  chosen set's bag of dice. Some faces are **multiface** — a single tile that
  contributes two letters at once: `Qu In Th Er He An` (you can't use half a
  tile). One face on the 6×6 super set is a **blank** that matches no letter, so
  no word can path through it (rendered as a faint `?`, like a scrabble blank).
- **Scoring ladders.** wsboggle's four ladders — `flat` (every word 1),
  `basic` (1–11 by length), `fib` (Fibonacci, 1–377), `big` (prefer-big, 1–50) —
  picked in setup, default `basic`. The chosen ladder drives generation scoring,
  the score constraint, and per-word points.
- **Minimum word length.** 3 / 4 / 5, default 3. A guess shorter than this is
  rejected.
- **Timer.** The shared `TimerField` (none / count-up / count-down MM:SS),
  default none; a countdown lets the player pick the duration.
- **Ending.** There's no intrinsic win threshold — you hunt until the timer
  expires, a player hits **End game**, or (compete) everyone's done. The
  end-of-game reveal lists the **required** words nobody found.

### Modes (sibling-manifest pair)

- **Coop** (`boggle_coop`, 1–8 players, solo-capable): one shared board, one
  shared found-words list — every teammate's accepted word piles into the same
  pool, scored once for the team.
- **Compete** (`boggle_compete`, 2–8 players): everyone hunts the **same** board
  independently. You see only your **own** words until the game ends; an
  `OpponentStrip` shows peers' live scores (not their words or counts). Most
  points wins. Scoring is **independent per player** — no classic dupes-cancel
  (deferred, [§12](#12-deferred--future)).

---

## 2. Required / legal / bonus words — the core model

The single most important concept in boggle is the split between the *required*
set (the board's goal + reveal) and *bonus* words (extra legal finds). Two
independent difficulty bands govern them, and **both lists are enumerated at
board-build time and shipped to the FE** — the FE validates + scores every guess
locally against required ∪ bonus and submits trusting-commit (the same model as
spellingbee, via the shared `useWordSubmit` hook). No `common.words` round-trip
at guess time.

- **Required words** — the set the board is **built and judged against**:
  `difficulty ≤ band` plus the **clean filter** (`american, crude=0, slur=0,
  slang=0`) and `len ≥ min_word_length`. The solver finds them all at board
  creation; every board constraint (word count, score, longest word) is measured
  **only** against this set, and the unfound ones are the "missed words" reveal.
  Shipped to the FE (it isn't hidden — see [§6](#6-schema-boggle)).

- **Bonus words** — real words that aren't required but are still within the
  **legal band** and traceable on the board. Scored normally; **never listed**
  when unfound (the reveal is required-only). Enumerated once on the accepted
  board (a second `listWords` pass against the legal-band trie — see
  [§5](#5-board-generation)) and stored in `bonus_words`.

- **Legal words** = required ∪ bonus — the acceptance set. A guess is legal iff it
  is a member of that shipped list (membership implies traceable + real, since the
  list was produced by solving *this* board). The FE keeps a local `traceableStr`
  check only to distinguish the two reject messages ("not on the board" vs "not a
  word"); the server trusts the FE's word + points + `is_bonus`.

**The two bands and their deliberate asymmetry.** Setup picks *both* a required
band and a legal band, with `legal_band ≥ band` (every required word is also
legal). The required band carries the clean filter because it's the set that's
*surfaced* (constraints, missed-words reveal). The legal band filters on
**difficulty only** — any dialect (us/uk/au/ca) and any register (slurs, crude,
slang) qualifies — because among friends a bonus is "any real word you can dig
up" within the chosen obscurity ceiling. Raise the legal band to reward rarer
finds; lower it to keep bonuses close to the required difficulty. Defaults:
required ≤3 (familiar), legal ≤5.

Enumerating the legal set costs one extra solver pass on the *accepted* board (a
5×5/6×6 legal list is ~a few hundred words, ~10 KB) — it is never part of the
roll→solve→reject loop, so board-creation constraints stay required-only.

---

## 3. The solver (`lib/solver.ts`)

The generator needs to find every required word on a candidate board, fast enough
to reject-sample boards interactively. The solver is **pure TypeScript** running
natively in the Deno edge function — no WASM, no FFI.

- **Algorithm.** A **flat typed-array trie** plus a **generation-stamp** on each
  terminal node: each solve bumps a counter and stamps a word's node when found,
  so dedup needs no word-string building and no hash set. This algorithm — not
  the language — is the lever; it's ~2× faster than the original C's DAWG +
  hash-table approach, and in V8 a TS port of it beats that original C.
- **Board sizes.** Because the 6×6 sets ship (36 tiles), the DFS tracks visited
  tiles with a **two-word 64-bit mask** (`usedLo` / `usedHi`) — one code path for
  4×4 / 5×5 / 6×6. A single 32-bit JS-number bitmask tops out at 32 tiles.
- **Multiface + blanks.** Multiface faces expand to their letter pairs during the
  trace; the blank face matches nothing, so paths can't cross it.
- **Shape.** A `createSolver(trie)` factory returns `{ solve }`; a fresh solver
  per generation means concurrent games share no mutable state. (A module-global
  singleton was measured and is *identical* in the shipping runtimes — Deno
  ~38k solves/sec either way — so the clean factory wins.)

`boggle-c-solver/` (repo root) holds the original C, the improved C, and a
six-way native/WASM × C/TS benchmark, all reproducing an identical correctness
tuple. It stays as the **golden-master parity oracle**: the shipping TS solver is
tested against a fixture (`solver.fixture.ts`, 90 boards across all sizes incl.
multiface) generated from that C.

---

## 4. Board generation (`boggle-build-board` edge function)

A board is built **on demand** at "Start game" — there is no pre-generated board
library and no import step. The edge function (running as the caller) rolls,
solves, and reject-samples until a board meets the setup's constraints, then
creates the game in one round-trip:

1. Verify the JWT; read `{ target_club, setup, player_user_ids, mode }`.
2. Get the **required trie** for `difficulty ≤ setup.band` (built from the bundled
   word list — [§5](#5-dictionary-delivery) — memoized per band at module scope).
3. Loop up to a try budget (also wall-clock-bounded so impossible constraints
   fail fast instead of crashing the worker):
   - Roll the chosen dice set (random die order + a random face per die,
     multiface faces carried through).
   - Solve for required words (flat-trie DFS, gen-stamp dedup, with a `max`
     fail-fast so an over-rich board is abandoned early).
   - Accept iff it meets **every** constraint: word count in `[minWords,
     maxWords]`, score (per the chosen ladder) in `[minScore, maxScore]`, longest
     word in `[minLongest, maxLongest]`, all measured over the required set.
4. On accept → enumerate the **bonus** set: build a second trie for `legal_band`
   (`requiredTrie(legal_band)` — the same builder, a wider band) and run
   `listWords` once on the accepted board, minus the required set (`listBonusWords`
   in `src/boggle/lib/generate.ts`). Then call `boggle.create_game` with the board
   + the required-word list + the bonus-word list (both `[{word, points}]`). On
   exhaustion → return a friendly **"constraints too strict, relax them"** error,
   which the FE surfaces on the setup dialog.

`legal_band` shapes only the post-acceptance bonus enumeration, never board
*acceptance* (constraints are required-only), so the reject loop stays fast — the
bonus pass is one extra solve on the single accepted board. The `scoring_ladder`
is validated at the API boundary before generation.

**Measured cost** (one accepted board): ~60–110 ms for typical bands; ~286 ms for
the extreme corner (an easy band *and* a required 11-letter word). Cold start
(decode the asset + build the first band trie) is a one-time ~166 ms per isolate.
Both sit comfortably inside an on-demand "Start game" action.

---

## 5. Dictionary delivery

The required-word source is the shared `common.words` list (see
[common.md → The word list](../common.md#the-word-list-commonwords)), **not**
wsboggle's word list. It's shipped to the edge function as a **bundled asset**
rather than queried at cold start:

- **Build step:** `npm run boggle:wordlist` queries `common.words` for the clean
  required-eligible rows (`american, crude=0, slur=0, slang=0, len ≥ 3`),
  selecting `(word, difficulty)` for **all** bands (so any pickable band can be
  built), and writes `boggle-build-board/wordlist.ts` as a gzip+base64 blob
  (~273k words, ~1.2 MB). It reads the **table**, not `~/src/gamelist/words.tsv`
  (that file is only the `common.words` importer's input).
- **Generated, not committed.** The asset is git- and eslint-ignored, and
  **regenerated by `npm run deploy`** before `supabase functions deploy` (and by
  `import-to-hosted.sh` before its deploy, from the local stack — the hosted DB
  isn't seeded yet at that point). Run it manually before `supabase functions
  serve` locally.
- **Cold start (once per isolate):** decode the blob into a module-scope
  `[word, difficulty][]`. **Per game-start:** build the band-filtered trie
  (~9–30 ms), memoized by band.
- **Why bundle vs query the DB:** ~2×+ faster cold start than bulk-reading
  88k–267k rows, network-independent, and no Postgres load on every isolate
  spin-up. The dictionary is stable, so "redeploy to update it" costs nothing
  today. (The Supabase Storage middle-ground, if staleness ever bites, is in
  [§12](#12-deferred--future).)

---

## 6. Schema (`boggle.*`)

Migration `supabase/migrations/20260628000000_boggle.sql`. The standard sibling
pair on one `boggle` schema.

**`boggle.games`** → `common.games(id)`:

- `club_handle`, `mode` (`coop` / `compete`) — denormalized so RLS checks
  membership without a join and the FE reads the whole board in one query.
- `board text` — the rolled board as a row-major raw-face string (A–Z, a
  multiface digit `1`–`6`, or `0` for a blank), length `n²`; `n int` (4–6).
- `min_word_length int`, `legal_band int` — `min_word_length` is the entry floor;
  `legal_band` is retained for reference (it was the ceiling the bonus list was
  enumerated against). The rest of setup (`band`, `scoring_ladder`, `timer`,
  constraint bounds) lives in `common.games.setup`.
- `required_words jsonb` (`[{word, points}]`) + `bonus_words jsonb` (same shape,
  the legal − required set; empty when `legal_band == band`), both **readable** by
  club members and shipped to the FE. `required_words_count int`,
  `required_words_score int`.

**No hidden-solution view.** A deliberate divergence from waffle, which hides its
answer behind a column-grant + `security_invoker` reveal view. boggle ships both
word lists to the FE from the start — hiding them would be anti-cheat contortion
the trust model rejects, and shipping them makes the FE simpler (instant
validation + scoring against required ∪ bonus, client-side missed-words reveal, in
one shared TS hook). So there's no reveal view: the **missed-words list is
computed client-side** as `required − found` (bonus words are never revealed).
*(spellingbee now works the same way — the two converged.)*

**`boggle.found_words`** — `(game_id, user_id, word, points, is_bonus, found_at)`,
PK `(game_id, user_id, word)`. **Mode-aware RLS** (the spellingbee pattern):
coop → everyone sees all found words; compete → you see only your own until the
game is terminal, then all.

---

## 7. RPCs (all `security definer`)

- **`create_game(target_club, setup, player_user_ids, mode, board)`** — called by
  the edge function. Validates club membership, player count, timer, `band`
  (1–6), `legal_band` (band..6), `scoring_ladder`, `min_word_length` (3–9), and
  the board structure; inserts the `common.games` header + the `boggle.games`
  row; titles the game `Boggle n×n`.
- **`submit_word(target_game, word, points, is_bonus)`** — the **trusting commit**.
  The FE validated the word against the shipped legal list (required ∪ bonus) and
  scored it, so the RPC trusts `word` + `points` + `is_bonus` and only:
  1. enforces the game is live (else `gameOver`);
  2. dedups against the caller's scope (coop = team, compete = self);
  3. inserts the row + refreshes the club-page status.

  No word-content or dictionary check, and no scoring, in plpgsql — it does not
  read `common.words` at all anymore. (Drives off the shared `useWordSubmit` hook,
  same as spellingbee.)
- **`end_game` / `submit_timeout`** — flip the game terminal; `submit_timeout`
  mirrors spellingbee's timer-expiry handler. No reveal view: the FE renders the
  missed words from data it already holds. `end_game` is coop's manual stop.
- **`concede`** — the compete per-player drop-out. boggle is a timed hunt with no
  per-player elimination, so it's a **thin wrapper over `common.concede`**
  (compete-only guard). FE shows `<ConcedeGameButton>` in compete, marks a
  conceder "out" in the OpponentStrip, "You conceded" locally-terminal look. See
  [common.md → Concede](../common.md#concede--per-player-drop-out). pgTAP:
  `concede_test.sql`.

### Where validation lives

The work splits by **where the data is**, so nothing intricate is written twice:

| piece | needs | lives |
|---|---|---|
| board generation + required solve + bonus enumeration | the dictionary trie | **edge function** (`lib/solver` + `generate`) |
| guess validity + scoring (membership in required ∪ bonus) | the shipped lists (FE has them) | **FE** shared `useWordSubmit` |
| reject-message nuance (not-on-board vs not-a-word) | the board (FE has it) | **FE** `lib/boardTrace` |
| dedup + live-game gate + status | the DB rows | **server** `submit_word` |

Both word lists are enumerated once at build time and shipped, so the FE is
authoritative for what counts + how much it scores; the server just records +
dedups. Exactly the scrabble/spellingbee trusting-commit model.

---

## 8. Frontend (`src/boggle/`)

**v3 layout** — the shared two-column scaffold (`common/components/game/PlayArea.module.css`,
imported as `shared`): a board column + a fixed info column, no full-page scroll
(per [docs/ui.md](../ui.md) and [docs/design-decisions.md](../design-decisions.md)).
boggle is spellingbee's structural twin (hunt words → typed entry → found-words
`<WordList>` → compete `OpponentStrip` → client-side missed-words reveal); the one
difference is the **square tile grid** (sized like waffle's, the other square
board), swapped in for spellingbee's hex flower.

- **Board column** — the square `n × n` tile grid (multiface tiles render "Qu" etc.,
  the blank a faint `?`). It hugs the **largest square that fits** via the shared
  HUG model (`.boardCol --side = min(--avail-w, --avail-h, n·--max-tile-size +
  gaps)`, with `--cols`/`--rows` set inline since `n` ∈ 4/5/6); the letter scales
  with each tile through `container-type: size` + `42cqmin`, kept (rather than
  waffle's column-count-tuned `--side/12`) precisely because it's **n-agnostic**.
  The shared `ShuffleButton` (⟲) **floats over the board's top-right** and does a
  **cosmetic 90° matrix rotation** of the displayed grid — tiles reposition but each
  letter stays upright (a matrix rotation, not a CSS spin), so the board is readable
  from any side. **Local to this player in both modes**: never persisted, never seen
  by others. A fixed-height **below-board slot** under the grid holds exactly one of:
  the typed-word input row, the sticky own-move `<FeedbackPill>`, or the permanent
  terminal pill (they replace each other so the board never reflows).
  - **Move entry** is the shared **capture model** (`useCaptureKeys` + a chrome-less
    `<EntryBox>` display, same as spellingbee): window key-capture, letters stored
    UPPERCASE, the icon-only `DeleteButton` + `SubmitButton` flanking the box. Enter
    submits; **Up arrow** recalls the last submitted word for editing, **Down arrow**
    clears (the universal `useCaptureKeys` last-move history). Typed only —
    no click-to-trace. Own-move results show as a **local sticky `<FeedbackPill>`**
    (required `+N` / bonus / too-short / off-board / not-a-word), dismissed by the
    next keystroke — not the GamePage header feedback channel.
- **Info column** (the canonical v3 order — see design-decisions.md → Info column):
  the live **state line** (`X / Y words · Z pts`), the compete **`OpponentStrip`**
  (the shared common one, `metricLabel="Score"`, score-only — counts stay private),
  the **action row** (`EndGameButton` coop / `ConcedeGameButton` compete during play;
  the bold outcome line + a compact back-to-club button at terminal), a **help line**,
  the **setup disclosure**, and the **`WordList`** filling the rest.
  - **`WordList`:** the **shared `common/components/game/lists/WordList`** (identical to
    spellingbee's, since it IS the same component) — finder color (coop), a bonus
    dot, a 5 s new-word flash (`common/hooks/game/useRecentlyFound`), click-to-define via
    the shared `DefinitionPopover`, and the post-terminal missed-words reveal. boggle
    builds its rows via `lib/displayRows` → `WordListRow[]` (the live count moved to
    the info-column state line, so the list header is just a label now).

**End game** is an info-column action-row button (off the GamePage menu); the
terminal copy comes from a unified `buildOver` (`{outcome, verdict, message, tone}`)
driving the below-board pill, the action-row line, and the `GameOverModal`. boggle
has no intrinsic win — coop is a neutral shared hunt; compete picks the highest score.

**Guess flow.** Because the FE holds both word lists, *every* guess resolves
instantly with no round-trip and commits optimistically: a word in required ∪
bonus → **+N** (bonus finds get a trailing `•`), committed in the background;
a miss → not-a-word if it traces on the board (`lib/boardTrace`), else
not-on-board; too short / duplicate → instant info. The server only records +
dedups the accepted words.

**Setup form.** Dice set · required difficulty (the shared `DifficultyField`,
full `universal…expert` list) · legal/bonus difficulty (a second `DifficultyField`
whose minimum tracks the required band) · scoring ladder · minimum word length ·
an optional collapsible **Board constraints** min/max grid (words / score /
longest) · timer. Mode-aware copy (coop vs compete).

Other files: `manifest.ts` (the two sibling manifests, `BRAND='MothCubes'`,
`startGameInClub` → invoke `boggle-build-board`, `submitTimeout`, `labelFor`),
`db.ts`, `theme.css`, `logo.svg`, `hooks/useGame.ts` (realtime refetch on
`boggle.{games, found_words}`), `lib/{setup, boardTrace, displayRows}`. Registered
in `src/games.ts`; `boggle` is in `supabase/config.toml` schemas and the eslint
`GAMETYPES`. Presence-pause is inherited via `<GamePage>` + `useCommonGame`
([[feedback_pause_on_disconnect]]).

### Printing the board (PDF)

boggle joins the printable games — a **"Print board (PDF)"** GamePage menu item that hands
you a paper record of the game: the fixed-size letter grid (a 6×6 prints bigger than a 4×4)
with the Setup to its right, above the found-words list in columns (missed required words
fold in at terminal) — `src/boggle/pdf/printBogglePdf.ts`. The shared clean-printable design
language + helpers live in [docs/pdf.md](../pdf.md).

---

## 9. Tests

**Vitest** (`src/boggle/lib/`):
- `solver.test.ts` — parity against the C oracle fixture (90 boards, all sizes,
  multiface + blanks) and the ladders.
- `dice.test.ts` — the eight sets (n² dice of valid faces), multiface + blank
  display.
- `generate.test.ts`, `boardTrace.test.ts` (traces validated against the solver),
  `displayRows.test.ts`, `setup.test.ts` (the cross-field band guard).

**pgTAP** (`supabase/tests/boggle/`):
- `create_game_test` — board validation, band / `legal_band` (rejects below the
  required band) / ladder / player-count guards, stale `setup.mode` rejection.
- `gameplay_test` — required vs bonus classification, the `legal_band` ceiling (a
  real word above it → `notAWord`), dedup, soft rejections, manual end →
  terminal.
- `rls_test` — coop sees all / compete own-only-until-terminal.

**e2e** (`e2e/boggle.e2e.ts`) — drives the running app: the board renders, a
required word lands, an off-board word is rejected.

---

## 10. Deployment notes

boggle has **no data import** (it generates boards on demand), but its edge
function needs the bundled `wordlist.ts` asset, which is git-ignored. Both deploy
paths regenerate it first:

- `npm run deploy` → `npm run boggle:wordlist && supabase functions deploy && …`.
- `import-to-hosted.sh` step 6 regenerates the asset **from the local stack**
  (the hosted `common.words` isn't seeded until a later step) before deploying
  functions, and step 3 includes `boggle` in the PostgREST exposed-schemas
  allowlist.

---

## 11. Resolved decisions

Settled forks, recorded as fact (this is what shipped):

- **On-demand generation, no library.** Boards are rolled + solved at game-start
  by `boggle-build-board`, not pre-generated — player-selectable constraints would
  make a pre-generated set multiply combinatorially (the waffle rationale).
- **Pure-TS solver, no WASM** — the algorithm (flat trie + gen-stamp dedup) is
  the win, not the language ([§3](#3-the-solver-libsolverts)).
- **Both word lists are shipped to the FE, not hidden** — the trust model makes
  hiding them pointless and shipping them simpler ([§6](#6-schema-boggle)).
- **Trusting commit** — validation + classification + scoring are FE-side and
  trusted (against the shipped lists); `submit_word` only dedups + records, no
  `common.words` lookup ([§7](#7-rpcs-all-security-definer)).
- **Two difficulty bands** — a clean required band and a difficulty-only legal
  band, independently picked with `legal_band ≥ band`
  ([§2](#2-required--legal--bonus-words--the-core-model)).
- **All dice sets ship**, including 6×6 — which forced the 64-bit used-tile mask.
- **Rotate is cosmetic and local** to each player, never persisted.
- **Compete scoring is independent** per player (dupes-cancel deferred).
- **Missed-words reveal** lists the **required** words nobody found; bonus words
  are never listed when unfound.

---

## 12. Deferred / future

- **Word-list freshness via Supabase Storage.** The bundled list is frozen at
  deploy; updating the dictionary means redeploying the function. Since
  `common.words` is stable that's fine today. If frequent updates ever matter, the
  middle ground is a gzipped list in a Storage bucket, `fetch`ed at cold start —
  refresh by re-uploading one file, no redeploy and no DB scan. (Sits between
  "bundle": fastest/stale, and "query the DB at startup": always-fresh/slowest.
  Measured cold-start floors: bundled ~21 ms required / ~76 ms full; DB query
  ~48 ms / ~128 ms local, more on hosted.)
- **Compete classic dupes-cancel** scoring as an opt-in.
- **A "check board" / hint helper** (cf. MonkeyGrams' planned one).
