# boggle — MothCubes (PLAN / design decisions)

> Status: **plan, not yet built.** This doc is the agreed design we'll implement
> against. Codename `boggle`; user-facing brand **MothCubes** (lives only in the
> manifest `BRAND` const — see [[feedback_codename_brand_naming]] conventions in
> `docs/naming.md`). Ported from `~/src/wsboggle` (the rules/spec) and
> `~/src/cboggle` (the DAWG builder only).

A find-words-in-a-grid game (Boggle): players trace words through orthogonally
or diagonally adjacent letter tiles, no tile reused within a word. Coop + compete
sibling pair, like spellingbee.

---

## 1. Locked decisions

| area | decision |
|---|---|
| Shape | `boggle_coop` + `boggle_compete` sibling pair; one `boggle` schema; one `src/boggle/` folder. Modeled on spellingbee. |
| Board generation | **On-demand** edge function `boggle-build-board` (rolls + solves + rejection-samples to meet constraints, then creates the game). |
| Solver | **Pure TypeScript**, flat typed-array trie + generation-stamp dedup. Runs natively in the Deno edge function — **no WASM**. (Why: see §6 + `boggle-c-solver/README.md`.) |
| Dictionary source | `common.words` (NOT wsboggle's word list). |
| Dictionary delivery | **Ship a bundled word-list asset** with the edge function; build the trie at cold start, reuse across warm invocations. (See §5 + the Storage fallback in §9.) |
| Required vs legal | The solver and all board constraints consider **required words only**. Legal/bonus words are **never** precomputed — guesses are validated at play time. |
| Required difficulty | **Per-game pick** via the shared difficulty-band component (full precise band list, `universal…expert`). Required = `difficulty ≤ chosen band`. Default **familiar (≤3)**. Cheap: ~9–30 ms to build the band trie per game-start. |
| Dice sets | **All wsboggle sets** (4×4 Classic/Revised, four 5×5 sets, two 6×6 sets), ported verbatim from `~/src/wsboggle/.../dice.py`, including multiface faces (Qu/In/Th/Er/He/An). Sets are integral to the game; the solver supports 4×4/5×5/**6×6**. |
| Guess validation | The **required list is shipped to the FE** (trust model: we don't withhold it for anti-cheat). The FE classifies instantly: in the required set → **required**; not in it but traces on the board → candidate **bonus**; not traceable → reject — all client-side. Only **bonus legality** ("is this obscure word real?") needs the server (`common.words` lookup, any dialect/difficulty incl. slurs/crude/slang — the FE doesn't carry the full dictionary). Required-ness is a **set-membership** test, *not* a difficulty check. Traceability + points are FE-side (shared TS `scoreFor`); the RPC trusts them, per the scrabble precedent. |
| Scoring | wsboggle's scoring **ladders** (flat / basic / fib / big), **player-chosen in setup**; default **basic**. The chosen ladder drives generation scoring, the min/max-score constraint, and per-word points. |
| Timer | FreeBee's `TimerField` exactly (none / count-up / count-down MM:SS). **Default none**; if countdown is chosen, the player picks the duration. |
| Compete scoring | Independent per-player (each scores their own found words; no dupes-cancel). Classic dupes-cancel deferred as a possible later option. |
| Reveal | Missed **required** words shown at end (the easier list). Bonus words never listed when unfound. |
| Parity oracle | `boggle-c-solver/` (in repo root) — the C solver reproduces the TS solver's exact output; used as a golden-master test. |

### Resolved in review

- **Rotate button** = a *cosmetic* 90° rotation of the displayed grid, **local to
  this player in both modes** (state lives only in that player's client; never
  written to the server, never seen by others).
- **All dice sets ship** — they're integral to the game (and the 4×4/5×5 families
  have several distinct cube sets; see wsboggle's `dice.py`). The solver therefore
  must handle 6×6, so it uses a **board-size-agnostic used-tile representation**
  (a small visited array, or a two-word 64-bit mask) rather than a single
  32-bit JS-number bitmask (which tops out at 32 tiles). See §6.
- **Legal-guess dictionary is unfiltered** — a guess counts if it's any row in
  `common.words` (any dialect us/uk/au/ca, any difficulty, incl. slurs/crude/slang)
  + meets min length + traces on the board. The *required* list stays clean
  (`american, crude=0, slur=0, slang=0, difficulty ≤ band`); only the required list
  is ever surfaced (constraints, missed-words reveal).
- **Guess traceability is trusted from the FE** — no server DFS. The FE traces the
  path locally before submitting.
- **The required list is shipped to the FE** (not hidden). Hiding it would be
  anti-cheat contortion the trust model rejects, and exposing it makes the FE
  simpler: instant required/off-board feedback, client-side missed-words reveal,
  and scoring stays in one shared TS function. Deliberate divergence from
  spellingbee's hidden-solution pattern. `submit_word` only does the **bonus**
  legality lookup + dedup; required is trusted, scoring is FE-side.
- **Band picker** uses the shared difficulty-band component showing the full,
  precisely-labeled list (`universal…expert`).

---

## 2. Concepts: required / legal / bonus

- **Required words** — the *easier* list the board is built and judged against
  (`difficulty ≤ chosen band`, plus `american, crude=0, slur=0, slang=0`,
  `len ≥ min_word_length`). The solver finds these at board creation; the
  min/max-word-count, min/max-score, and longest-word constraints are all measured
  **only** against required words. Unfound required words are the "missed words"
  revealed at game end.

  A word is "required" **iff it is a member of this precomputed set** — which folds
  together the clean filter, the band, traceability on *this* board, and the
  solver's dedup. It is **not** recoverable from a word's difficulty alone;
  required-vs-bonus is a **set-membership** test. The required list **is shipped to
  the FE**, so it classifies required guesses and computes the missed-words reveal
  itself (per the trust model we don't withhold it for anti-cheat). The only thing
  the FE can't do is judge an *unknown* word's legality — it doesn't carry the full
  dictionary — so bonus candidates go to the server for a `common.words` lookup.
- **Bonus words** — real words more obscure than the required band but still
  traceable on the board. Legal guesses, scored normally, **never precomputed** and
  **never listed** when unfound.
- **Legal words** = required ∪ bonus. We never materialize this set; a guess is
  legal iff it (a) is **any** row in `common.words` (any dialect us/uk/au/ca, any
  difficulty, including slurs/crude/slang), (b) meets `min_word_length`, and
  (c) traces a valid path on the board (the FE checks this; the server trusts it).

Rationale for not precomputing legal words: it keeps the board generator small and
fast (it only cares about the required list), and a per-word trace on the FE is
trivially cheap. This is the user's explicit model.

Note the deliberate asymmetry: the **required** list is filtered clean
(`american, crude=0, slur=0, slang=0`) because it's the only set ever *surfaced*
(constraints + missed-words reveal), whereas **legal guesses** accept any real
word — friends can play whatever they can find.

---

## 3. Board generation (`boggle-build-board` edge function)

1. Verify JWT; read `{ target_club, setup, player_user_ids, mode }`.
2. Get the **required trie** for `difficulty ≤ setup.band` (built from the bundled
   word list — see §5; memoized per band at module scope).
3. Loop up to `max_tries`:
   - Roll the chosen dice set (Fisher–Yates positions + a random face per die;
     multiface faces like **Qu** / In / Th / Er / He / An carried through).
   - Solve for required words (flat-trie DFS, gen-stamp dedup, `max`-constraint
     fail-fast).
   - Accept iff it meets every constraint: word count in `[minWords,maxWords]`,
     score (per the chosen ladder) in `[minScore,maxScore]`, longest ≥
     `minLongest`, min word length.
4. On accept → call `boggle.create_game` with board + required-word list (each with
   length/points/difficulty). On exhaustion → return a friendly **"constraints too
   strict, relax them"** error (the FE surfaces it on the setup dialog).

**Measured cost** (one accepted board, the hard case = require an 11-letter word):
~60–110 ms for typical bands; ~286 ms for the extreme corner (Easy band + an
11-letter word). Comfortably within an on-demand "Start game" action. Most boards
are far cheaper. Full numbers in `boggle-c-solver/README.md`.

---

## 4. Schema + RPCs (`boggle` schema)

Found-words visibility mirrors spellingbee's mode-aware RLS. The required list is
**not** hidden (deliberate divergence — see below).

**`boggle.games`**
- `id uuid pk references common.games(id)`, `club_handle`, `mode ('coop'|'compete')`
- `dice_set text`, `board text` (row-major raw faces; multiface encoded), `board_w`, `board_h`
- setup echo: `band`, `min_word_length`, `scoring_ladder`, `timer`, constraint bounds
- `required_words jsonb` — `[{word, len, points}]` (readable by players)
- `required_words_count int`, `required_words_score int`

**No hidden-solution view.** Deliberate divergence from spellingbee/waffle: boggle
ships the required list to the FE from the start (hiding it would be anti-cheat
contortion the trust model rejects). This removes the column-grant exclusion + the
`games_state` `security_invoker` reveal view; the **missed-words reveal is computed
client-side** (`required − found`).

**`boggle.found_words`** — `(game_id, user_id, word, points, is_bonus, found_at)`,
PK `(game_id, user_id, word)`. Mode-aware RLS: coop → everyone sees all found words;
compete → you see only your own until terminal, then all.

**RPCs**
- `create_game(...)` — called by the edge function; inserts `common.games` + `boggle.games`.
- `submit_word(game_id, word, points)` — **trusting-commit**. The FE has already
  traced the word and classified it (it holds the required list); the RPC records it
  and does the one check the FE can't:
  1. reject non-alpha (server-side too); enforce `min_word_length`;
  2. dedup against the caller's scope (coop = team, compete = self);
  3. **required** (`word` ∈ the game's `required_words`) → store, trusting FE points;
  4. **otherwise** → look up `common.words` (**any** row: any dialect/difficulty
     incl. slurs/crude/slang) → store as **bonus** (FE points) if found, else reject
     as not-a-word; return the verdict.
  - No scoring in plpgsql — points come from the shared TS `scoreFor`; the RPC
    trusts them (scrabble precedent).
- `end_game` / `submit_timeout` — flip terminal; `submit_timeout` mirrors
  spellingbee's timer-expiry handler. No reveal view — the FE renders missed words
  as `required − found` from data it already holds.

---

## 5. Dictionary delivery (decision: ship a bundled word list)

- **Build step:** `npm run boggle:wordlist` queries the **`common.words` table**
  for the clean required-eligible rows (`american, crude=0, slur=0, slang=0,
  len≥3`), selecting `word, difficulty`, all bands present (so any pickable band
  can be built), and writes the asset `boggle-build-board/wordlist.ts`
  (gzip+base64). It reads the **table**, **not** `~/src/gamelist/words.tsv` — that
  file is solely the `common.words` importer's input.
- **Generated, not committed.** The asset is git-ignored (~1.2 MB) and
  **regenerated by `npm run deploy`** before `supabase functions deploy` (and run
  manually before local `supabase functions serve`). This is the bundle-it option;
  the §9 Storage route remains the fallback if staleness ever matters.
- **Cold start (once per isolate):** parse the asset into a module-scope
  `[word, difficulty][]`.
- **Per game-start:** build the required trie for `difficulty ≤ band` (~9–30 ms),
  memoized by band.
- **Why ship vs query the DB:** building from the bundled file is ~2×+ faster at
  cold start than bulk-reading 88k–267k rows from `common.words`, is
  network-independent, and doesn't hammer Postgres on every isolate spin-up. The
  dictionary is stable, so "redeploy to update it" is a non-issue. (Measured
  comparison preserved below in §9.)

---

## 6. Why pure TS (no WASM) — summary

The board generator could run as C→WASM in the edge function, but the exploration
showed a TS solver is the better fit and **not** a performance compromise:

- The big lever is the **algorithm, not the language**: a flat trie + a
  generation-stamp on the terminal node (dedup without building word strings or
  hashing) is ~2× faster than the original C's DAWG + hash-table approach.
- With that algorithm, native C is fastest, but TS-in-V8 still beats the *original*
  C, and the worst-case board is tens-to-low-hundreds of ms regardless.
- TS builds its required trie from the bundled word list (sourced from
  `common.words`), filtered to the game's band — needs no FFI/WASM glue in Deno and
  is readable, matching the repo's ethos.
- **Board sizes:** because all dice sets ship (incl. 6×6 = 36 tiles), the DFS uses
  a **two-word 64-bit used-tile mask** (`usedLo`/`usedHi`) — one code path for
  4×4/5×5/6×6. A single 32-bit JS-number bitmask, like the throwaway benchmark used
  for 4×4, can't address >32 tiles.
- **Measured (Phase 1):** ~**38k solves/sec in Deno** (the edge runtime), ~34k
  under Vitest/Vite — one required-dict 4×4 solve. A standalone-script benchmark
  hit ~55k, but that was an artifact of plain-`node` top-level code: in the
  runtimes we actually ship to, a module-global singleton and the closure factory
  measure **identical** (Deno: 38.5k vs 39.3k — factory even marginally ahead), so
  there is no micro-structure win to chase. We use the **clean factory**
  (`createSolver(trie)`); a fresh solver per generation also means concurrent games
  share no mutable state (no reentrancy concerns). ~34–38k is ample — worst case
  (an 11-letter required word) ≈ 150 ms for one board, typical boards milliseconds.
  The real win was the **algorithm** (trie + generation-stamp dedup), not the
  micro-structure.

`boggle-c-solver/` holds the original C, the improved C, and the full six-way
benchmark (native/WASM × C/TS), all reproducing an identical correctness tuple. It
stays as the **golden-master parity oracle** for the shipping TS solver.

---

## 7. Frontend (`src/boggle/`)

Layout: **two fixed-height columns, no full-page scroll** (per `docs/ui.md`).
- **Left:** the board grid (CSS-grid, variable size; multiface tiles render "Qu" etc.).
- **Right info panel:** the `<input type=text>` + the found-words list.
  - **Input:** Enter submits; **Up arrow** recalls the last submitted word for
    editing; non-alpha characters are rejected at the input so global `?`/`/`
    shortcuts still fire. Typed only — no click-to-trace.
  - **WordList:** reuse FreeBee/spellingbee's component look & behavior (finder
    color in coop, 5 s new-word flash, click-to-define via `common.defs`).
  - **Rotate button:** the shared `ShuffleButton` (⟲) → cosmetic 90° rotation of the
    grid, **local to this player only in both modes** (never persisted, never seen
    by others).
  - **Guess flow:** the FE holds the required list + board + shared `scoreFor`. A
    guess in the required set → instant **required +N**; not in it but traced by
    `lib/boardTrace` → sent to `submit_word` for the bonus legality check; not
    traceable → instant **not-on-board** reject. Instant feedback for the common
    cases (required words, off-board input); the server is hit only for genuine
    bonus-or-not-a-word candidates. Missed words at end = `required − found`,
    rendered client-side.
- **Coop:** shared found-words list (teammates' accepted words, not attempts/fails).
  **Compete:** own words only until terminal; leaderboard by points; missed required
  words revealed at end.
- Files: `manifest.ts` (two manifests, `BRAND='MothCubes'`, `startGameInClub` →
  invoke `boggle-build-board`), `db.ts`, `theme.css`, `logo.svg`,
  `components/{PlayArea,SetupForm,Help}.tsx`, `hooks/{useGame,useGlobalKeyHandler}`,
  `lib/{setup, boardTrace, displayRows}`. Register in `src/games.ts`; add `boggle`
  to `supabase/config.toml` schemas. Inherits pause-on-disconnect via `GamePage` +
  `useCommonGame` ([[feedback_pause_on_disconnect]]).

### Setup form options
dice set (full wsboggle list) · required difficulty (the **shared difficulty-band
component**, full precisely-labeled `universal…expert` list) · **scoring ladder
(flat / basic / fib / big, default basic)** · min word length (3/4/5) · optional
board constraints (min/max words, min/max score, longest-word) · timer (FreeBee
`TimerField`; **default none**, countdown lets you pick the duration). Mode-aware
copy (coop vs compete).

---

## 8. Build order & testing

1. ✅ **TS solver module** (`src/boggle/lib/solver.ts`) + Vitest parity test vs the
   C oracle. Done: `buildTrie` / `parseBoard` / `createSolver`; trie + gen-stamp
   dedup; multiface tiles; basic/flat/fib/big ladders; two-word mask for 4×4/5×5/6×6;
   max fail-fast. Parity fixture (`solver.fixture.ts`, 90 boards across all sizes
   incl. multiface) generated from `libwords.c` via `boggle-c-solver/dump_fixture.c`;
   8/8 tests pass. Perf measured ~34k solves/sec (see §6).
2. **Generation logic + dictionary asset + edge function.**
   - ✅ `src/boggle/lib/dice.ts` — all 8 dice sets (verbatim from wsboggle), incl.
     multiface (1–6) + blank (0) faces; display helpers. Tested.
   - ✅ `src/boggle/lib/generate.ts` — seeded `mulberry32` + `rollBoard` +
     synchronous `generateBoard` (roll→solve→reject, max fail-fast, max_tries →
     null). `solver.listWords` materialises the required-word list once on accept.
     Solver now handles blank tiles. Tested (20 boggle tests pass total).
   - ✅ `supabase/scripts/generate-boggle-wordlist.ts` (`npm run boggle:wordlist`)
     — queries `common.words` → bundled gzip+base64 asset
     `supabase/functions/boggle-build-board/wordlist.ts` (272,914 words, 1.18 MB;
     **git-ignored + eslint-ignored**, regenerated by `npm run deploy`).
   - ✅ `boggle-build-board/dict.ts` (decode once + band-trie cache) + `index.ts`
     (handler: build band trie → `generateBoard` → return board; **auth +
     `create_game` are Phase 3 TODOs**). **Latency proven in Deno:** cold start
     (decode + band≤3 trie) **166 ms** once per isolate; warm trie 0.002 ms;
     generation per board ~0.3 ms loose, ~14 ms longest≥10, ~150 ms longest≥11.
     Worst realistic Start (cold isolate + 11-letter board) ≈ 320 ms.
3. ✅ **Schema + RPCs** — `supabase/migrations/20260628000000_boggle.sql`:
   `boggle.games` (readable `required_words`, no hidden view) + `found_words`
   (mode-aware RLS) + `create_game` / `submit_word` (trusting-commit) /
   `end_game` / `submit_timeout`; gametypes registered; `boggle` added to
   `config.toml`. pgTAP: create_game/gameplay/rls (46 assertions). Full DB suite
   PASS (1024 tests; updated `common/clubs_gametypes_test` for the 2 new
   gametypes). db:lint clean for boggle.
   - ✅ Edge function **wired**: `boggle-build-board/index.ts` now verifies the
     caller, generates the board, and calls `boggle.create_game` over PostgREST
     (mirrors `spellingbee-build-board`). `dict.ts` Deno-type-checks; both lint
     clean. *Unverified:* the full HTTP round-trip (needs `supabase functions
     serve` + a JWT + a seeded club — a `/verify`-style step before shipping).
4. ✅ **Manifest + registry.** `src/boggle/`: `manifest.ts` (two sibling
   manifests, `BRAND='MothCubes'`, `startGameInClub` → invoke `boggle-build-board`,
   `submitTimeout`, `labelFor`), `db.ts`, `lib/setup.ts` (types/defaults/validate),
   `theme.css`, `logo.svg`, and **stub** `components/{PlayArea,SetupForm,Help}`
   (PlayArea renders the real board read-only — proves Start→edge→DB→render).
   Registered in `src/games.ts`; `boggle` appended to eslint `GAMETYPES`. tsc +
   eslint clean; FE suite 366 passing (schema-exposure guard incl.).
5. **PlayArea (Phase 5):** flesh out the stubs — two-column grid + typed input +
   WordList (FreeBee reuse) + rotate (`ShuffleButton`) + `lib/boardTrace`; real
   SetupForm (dice set, shared difficulty band, ladder, word length, constraints,
   `TimerField`); fuller Help.
6. **Coop/compete polish**, end-game reveal, timer, remaining tests.

---

## 9. Deferred / future notes

### Word-list freshness via Supabase Storage (if "stale bundled list" ever bites)
We chose to **bundle** the word list with the edge function (§5). The downside is
it's frozen at deploy — updating the dictionary means redeploying the function.
Since `common.words` is stable, that's fine today. **If frequent dictionary updates
ever matter**, the middle-ground option is: put the gzipped word list in a
**Supabase Storage** bucket and `fetch` it at cold start. That keeps cold start
cheap (~0.27 MB gz transfer + ~10 ms gunzip + build), avoids any deploy-bundle size
limit, and lets you refresh the dictionary by **re-uploading one file** — no
function redeploy and no 88k-row DB scan. It sits between "bundle" (fastest, stale)
and "query the DB at startup" (always fresh, slowest + DB load).

### Measured: ship-bundled vs query-`common.words` at cold start (one per isolate)
| | ship bundled list | query `common.words` |
|---|---:|---:|
| required (88k) | ~21 ms | ~48 ms local floor (hosted ~100–200 ms w/ conn+driver) |
| full (267k) | ~76 ms | ~128 ms local floor (hosted ~250–500 ms) |

(`parse+build` ~20/72 ms is common to both; the difference is local file read vs
DB connection + bulk transfer + row-object parsing.)

### Other deferreds
- Compete classic **dupes-cancel** scoring as an opt-in.
- A "check board" / hint helper (cf. MonkeyGram's planned one).
