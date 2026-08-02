# Pre-freeze DB audit — naming + vocabulary tidy list

2026-08-01. The working punch list for schema/RPC tidying **before leaving alpha**
(after which baseline migrations freeze and every change costs an appended
migration — see [deferred.md → To discuss](deferred.md#to-discuss)). Sourced from a
full sweep of all 14 migration files (~19k lines, 188 functions) plus a review of
the titles/status-lines work (`63302a1`…`1fc6de5`).

Work an item → delete it from this file. When the file is empty (or everything
left is explicitly "keep"), this audit is done and the file gets deleted, with any
durable decisions recorded in naming.md / states.md / the per-game docs.

Tiers are ordered by **how much freezing hurts**: Tier A is persisted row
vocabulary (old rows carry old values forever), Tier E is comments (free today,
frozen into the baselines later).

---

## 0. Assessment of the titles + status-lines work

The design is sound: `update_state`/`end_game` merging `status` while `reset_game`
assigns is well-reasoned and well-commented; every terminal write states its
`outcome`; `_sync_title` being derived-not-assigned handles replay correctly; the
generated table + `UNKNOWN_READS_AS_LIVE` test close the "play_state lives in two
places" trap for labels. `labelFor` defends against NULL status (`row.status ?? {}`),
so the two games that never seed status at create (connections, psychicnum) render
fine. No bugs found in the new work itself.

Three residual oddities it left behind, worth a deliberate decision:

- [ ] **crosswords `reveal_cells` (reveal-all) ends the game as `won`**
  (`_maybe_finish` → `20260706000000_crosswords.sql:293`). waffle and wordle
  deliberately chose `ended` + `outcome:'revealed'` for the same gesture — in
  crosswords, revealing the whole grid puts a green "Won" on the club list.
- [ ] **scrabble coop's bag-out finish is play_state `won` but renders "Ended"** —
  the neutral label is intentional (commit `12e8335`), but then the state name is
  lying. If it's a neutral finish, `ended` is the honest state.
- [ ] **The wordiply all-conceded fixture doesn't match the SQL**: the generated
  status-lines table shows state `ended`, but `common.concede` actually writes
  `lost`. The label survives only because `competeLabel` keys off
  `outcome === 'conceded'` before looking at play_state
  (`src/wordiply/manifest.ts:108`). Exactly the two-places trap — fix the fixture
  (and see A1, which may change the value anyway).
- [ ] **deferred.md's "Choose better status lines" item is stale** — its punch list
  is done and the "Known inconsistencies" section it points at is gone. Delete or
  trim to what remains.

---

## Tier A — persisted vocabulary (do before freeze)

play_state values and `status`/`setup` jsonb keys live in rows; once rows survive
deploys, every rename needs a data migration. **Remember: changing a terminal
play_state means updating BOTH the SQL and the game's `labelFor` (+ the report
fixtures) — nothing asserts they agree.**

- [ ] **A1. All-conceded ends in three different play_states.** `common.concede`
  hardcodes `'lost'` (`20260615000000_common.sql:1811`), so
  spellingbee/wordwheel/stackdown/scrabble/boggle/crosswords/wordiply compete
  games end at `lost`; the elimination games' own `_maybe_finish_compete` paths
  write `lost_compete` (connections `…003:658`, waffle `:677`, wordle `:478`,
  psychicnum `…002:860`). Same cause, two values (plus wordiply's fixture claiming
  `ended`). Fix: `common.concede` writes `lost_compete` when the gametype is a
  compete variant. The wrinkle is **bananagrams** — single-mode, uses
  `common.concede`, vocabulary has no `_compete` suffix — so it keeps `lost`;
  pass the terminal state in from the per-game wrapper, or derive from the
  gametype string. Note scrabble's hand-rolled `'lost'` at `…scrabble:623` has a
  comment justifying it (null-winner FE branch) — resolve that in the same pass.
- [ ] **A2. connections `solved`/`solved_compete` → `won`/`won_compete`.**
  states.md blesses the divergence, but thinly: the pair isn't self-consistent
  (coop loss is plain `lost`, not `unsolved`), crosswords writes `won` for the
  identical event, and every label now reads "Won" anyway. Rename
  (`…003:846`, `:890`), update both connections `labelFor`s, delete the blessing
  from states.md:54.
- [ ] **A3. Winner-uuid status key has three names**: `winner` (waffle `:698`,
  wordle `:497`, crosswords `:320`, stackdown `:520`, scrabble `:607`),
  `winner_user_id` (spellingbee `:1023`, wordwheel `:1067`, wordiply `:743`),
  `winner_id` (boggle `:585`). Pick one — recommendation: `winner_user_id`
  (self-describing, matches the `user_id` column convention, doesn't read as a
  name next to the universal `winner_username`). Majority-rules `winner` also
  defensible; one name, whichever.
- [ ] **A4. `outcome` values split into two philosophies.** Most games write the
  *cause* (`timeout`, `manual`, `conceded`, `exhausted`); connections, psychicnum
  and codenamesduet write play_state duplicates (`lost_timeout`,
  `lost_compete_conceded`, `lost_compete_timeout` — `…001:893`, `…002:1073`,
  `…003:662/:1115`), and crosswords writes `finished` where everyone else says
  `manual` (`…crosswords:917`). Converge on cause-only — play_state already
  carries the verdict, and the status-line grammar wants the reason noun.
- [ ] **A5. Three camelCase keys inside otherwise-snake_case `setup`**:
  `coopStyle` (psychicnum, connections, waffle, wordle, wordiply),
  `firstTurnUserId` (those five + scrabble), `firstClueGiverUserId`
  (codenamesduet). These also persist in saved club defaults
  (`clubs_gametypes.default_setup`), and deferred.md already names setup-key
  renames as the post-freeze breakage case — the single worst category to leave
  inconsistent. Snake_case them now (SQL readers + FE writers + saved-defaults
  blobs in dev DBs; a `db:reset` clears the latter).
- [ ] **A6. Timeout-with-no-target policy differs per game**: spellingbee/
  wordwheel/boggle do `lost` if a target was set else `ended`
  (`…spellingbee:1189`, `…boggle:513-517`); wordiply coop is always `ended`
  (`…wordiply:615`); scrabble coop is always `lost` (`…scrabble:529`, with a
  comment arguing its case). Pick the rule — majority is "the clock only loses
  when there was a target to miss" — and record any surviving exception in
  states.md.
- [ ] **A7. Smaller status-blob drift**, same pass:
  - boggle writes `score` where spellingbee/wordwheel write `found_words_score`
    (`…boggle:287` vs `…spellingbee:745`) — same word-game status shape otherwise.
  - stackdown's bare `'found'`/`'total'` keys (`…stackdown:344`) — `total` is on
    naming.md's generic watch list; siblings say `found_words_count`/
    `required_words_count`.
  - boggle's leaderboard element uses watch-listed bare `count` (`…boggle:521`);
    the five leaderboard-writing games each have a different element shape —
    worth at least a look.
  - connections + psychicnum never seed `status` at create (NULL until the first
    move); every other game seeds it. FE defends, but seed for consistency.
- [ ] **A8. wordiply compete has no `lost_compete` at all** — timeout-with-winner
  and everyone-exhausted both land `won_compete`, manual/no-winner lands `ended`
  (`…wordiply:669`). Boggle, the other score-race, does have `lost_compete`.
  Maybe deliberate (the comparator usually names a winner) — decide and record.

## Tier B — column renames (need a migration later)

- [ ] **B1.** `wordiply.guesses.created_at` → `guessed_at` (`…wordiply:143`; the
  other four `guesses` tables — codenamesduet, psychicnum, connections, wordle —
  all say `guessed_at`).
- [ ] **B2.** `waffle.swaps.created_at` → `swapped_at` (`…waffle:220`; siblings:
  `scrabble.plays.played_at`, `stackdown.submissions.submitted_at`).
- [ ] **B3.** `psychicnum.guesses.was_correct` → `is_correct` (`…002:173`;
  wordle's name, `…wordle:143`. Pure tense drift).
- [ ] **B4.** `codenamesduet.guesses.outcome` (text enum, `…001:156`) → `result`
  (connections' name for the same concept, `…003:217`; also stops colliding with
  the status-jsonb `outcome` key).
- [ ] **B5.** `psychicnum.players.secrets_found` — an int with a plural-noun name
  (`…002:149`); violates naming.md's own `_count` rule. (The status key of the
  same name rides along, and its partner `total_secrets` uses `total_` where the
  word games use `required_`.)
- [ ] **B6.** `wordiply.guesses.guess_index` → `seq` (`…wordiply:142`; waffle/
  wordle/stackdown/scrabble all use `seq`).
- [ ] **B7.** `bananagrams.progress.done` → `solved` (`…bananagrams:187`;
  waffle/wordle/stackdown's name for the same per-player finished flag).
- [ ] **B8.** connections `puzzles.nyt_date` vs `games.puzzle_date`
  (`…003:117` / `:184`) — same value, two names, and a vendor name in an
  identifier (crosswords keeps NYT provenance inside `meta` jsonb). Unify on
  `puzzle_date`; `club_game_status` re-exposes `nyt_date` (`:403`) so the FE
  reader changes too.
- [ ] **B9.** Drop crosswords' vestigial `'nyt'` check value
  (`…crosswords:41`; the comment at `:35-37` already admits nothing writes it).
  Known item, now's the moment.
- [ ] **B10.** Index-name strays (prevailing pattern `<schema>_<table>_<cols>_idx`):
  `games_club_handle_idx` on codenamesduet (`…001:82`, no schema prefix),
  `codenamesduet_guesses_game_idx` (`…001:161`, `game` not `game_id`),
  `messages_club_handle_sent_at_idx` / `words_difficulty_idx` / `words_len_idx`
  (common.sql, missing the `common_` prefix its other indexes use). Cheap,
  matters only if ever referenced by name — do while the files are open.
- [ ] **B11.** Write the `owner_id` convention down in naming.md (nullable =
  the shared/team row, non-null = a per-player copy). Used consistently in
  `common.game_scratchpads` (`common.sql:710`) and `crosswords.cells`
  (`…crosswords:111`), recorded nowhere.

## Tier C — function surface (appendable later, tidier now)

- [ ] **C1. `crosswords.solution_for` vs `crosswords._solution_for`** — one
  underscore apart, both granted to `authenticated`, *opposite* shielding
  semantics (ungated .ipuz export at `:867` vs terminal-gated view shim at
  `:252`), different param names for the same id (`target_game` vs `g_id`). The
  sharpest footgun in the audit. Rename the public one (`export_solution` /
  `ipuz_solution`).
- [ ] **C2. `common.wordle_colors`** (`common.sql:1154`) — a game codename in the
  common schema, shared by wordle *and* waffle; the clearest violation of
  naming.md's headline "role, not implementation" rule. → `letter_colors` or
  `guess_colors`. waffle's `compute_colors` (`…waffle:61`, the repo's only
  `compute_` verb) can join the same tidy.
- [ ] **C3. Two unrelated `_title` functions** — `scrabble._title(uuid)` looks a
  game up and computes its title (`…scrabble:422`); `waffle._title(text[], text)`
  is a pure formatter (`…waffle:364`). Rename one. Consider giving
  scrabble/stackdown/bananagrams the `_sync_title(g_id)` wrapper shape
  wordle/waffle share — same "keep the title current" concept, four
  implementations, three naming schemes today.
- [ ] **C4.** `scrabble._finish(g_id, outcome, out_seat)` (`…scrabble:487`) —
  `out_seat` reads as a PL/pgSQL OUT param but is the winner's seat (an IN).
  → `winner_seat`.
- [ ] **C5.** crosswords `_finish_coop_won`/`_finish_compete_won` (`…crosswords:278/:302`)
  vs wordiply `_finish_coop`/`_finish_compete` (`…wordiply:588/:647`) — same
  concept, drop the `_won`.
- [ ] **C6.** `validate_*` vs `require_*` in common — two verb families for
  identical raise-on-bad behavior (`validate_timer`/`validate_mode` at
  `common.sql:998/:1059` vs `require_compete`/`require_club_member`/
  `require_game_player`/`require_player_count_max`). Pick one verb. Related:
  `_require_turn` is `_`-prefixed while its `require_*` family isn't, and
  `common.require_player_count_max` (`:2586`) is the file's lone
  `create or replace`.
- [ ] **C7. Cosmetic, do-if-touching**: `ai_exchange`/`ai_pass` truncate their
  human twins' names (`exchange_tiles`/`pass_turn`); the `g_id` vs `target_game`
  param split across helpers; `common.set_scratchpad(target_game, p_owner,
  p_body)` mixing three param styles in one signature; `validate_timer`'s
  `timer_obj` (the repo's only `_obj` param, `obj` being watch-listed);
  `common.create_game`'s `saved_default` param feeding a column named
  `default_setup`; scrabble's local `_advance_turn` shadowing
  `common._advance_turn` — deliberate and always schema-qualified (both are
  called, `…scrabble:985` vs `:989`), but a distinguishing name would help
  readers.

## Tier D — grant/revoke hygiene (one mechanical pass)

Not a real exposure under RLS + friends-only, but the convention is otherwise
uniform and the pass is mechanical:

- [ ] `common.concede` is the only granted RPC missing its
  `revoke … from public` pair (granted `common.sql:1818`, no revoke anywhere).
- [ ] ~20 helpers have neither revoke nor grant, so they keep Postgres's default
  EXECUTE-to-PUBLIC — including `scrabble._finish` (unconditionally terminates a
  game). Full list: common `_bump_scratchpad_version`, `color_for_username`,
  `default_gametypes_for_club`, `is_club_member`, `slugify_club_name`,
  `touch_games_last_active`, `word_letter_mask`, `wordle_colors`; scrabble
  `_advance_turn`, `_finish`, `_new_bag`, `_remove_tiles`, `_status`,
  `_tile_value`; waffle `_board_visible`, `_color_rank`, `_correct_words`,
  `_title`, `_word_slots`, `compute_colors`; stackdown `_found_title`,
  `_is_exposed`, `_word`; psychicnum `_unfound_secret`; bananagrams
  `_win_blockers`; crosswords `_bump_cell_version`.
- [ ] Three pure-math helpers are granted to `authenticated` with no
  security-invoker view forcing it: `spellingbee._rank_idx`,
  `wordwheel._rank_idx`, `wordiply._length_score`. (The other ten granted
  `_`-prefixed helpers — the `_solution_for`/`_rack_for` family — are justified:
  view shims need the grant.)

## Tier E — comments and docs (free now, frozen into baselines later)

- [ ] Six SQL comments reference the deleted `GameOverModal`
  (`…001:924`, `…002:1028`, `…003:1181/:1256`, `…waffle:1046`,
  `…spellingbee:1289`, `…wordwheel:1333`).
- [ ] codenamesduet `create_game` header claims `status='active'` (`…001:343`) —
  contradicting the no-`'active'` rule stated in common.sql:318 itself.
- [ ] spellingbee/wordwheel `games_state` views are now pure pass-throughs (the
  word lists stopped being hidden) with comments describing removed machinery
  (`…spellingbee:186/:292`, `…wordwheel:221/:327`) — drop the views or update
  the story.
- [ ] The "setup.mode is no longer valid" guard exists in only 4 of 11 multi-mode
  games (spellingbee, wordwheel, wordiply, boggle) — add everywhere or delete as
  migration-era scaffolding.
- [ ] **docs/naming.md predates the last two games**: wordwheel + wordiply are
  missing from the gametype list (`:23`, `:251`), the codename↔brand table
  (`:47-54` — MooseWheel, WordWire), and the `submit_word` canonical entry; and
  its claim that child tables use `created_at` (`:256`) is false — they use
  `guessed_at`/`found_at`/`played_at`/`submitted_at` (which is the better
  convention; the doc should describe it).
- [ ] crosswords.sql refers to `crossplay` 7× as the *source app* — since
  CrossPlay is also the registered brand, the comments read ambiguously. Clarify
  once ("the prior app this was ported from") if touching the file.

## Flagged by the audit — deliberately KEEP

Recorded so a future sweep doesn't re-file them as findings. The
documented-deliberate set holds up:

- boggle's `ended` normal finish (naming.md:231), the cheat-verb names
  (`request_*` vs `reveal_next_*`), `_maybe_finish_compete` vs `_finish`
  (naming.md:235), the `submit_guess`/`submit_word`/`play_word`/`submit_swap`
  verb split (naming.md's canonical table).
- **crosswords `clear_board` is NOT a `replay_board` rename candidate** —
  crosswords replay is a documented won't-do (deferred.md); `clear_board` is a
  genuinely different gesture that does not call `common.reset_game`.
- `stackdown.submissions` vs `psychicnum.guesses` for the same
  word/hint/reveal union shape — two table names, but a rename buys little.
- bananagrams' two per-player tables (`player_boards` + `progress`) — a real RLS
  boundary (owner-only vs club-readable), documented in the divergence register.
- `common._set_conceded` vs `common.concede` split — elimination games
  deliberately take the half-step; the header comment explains it.
- `scrabble.players.user_id` nullable (the AI-seat XOR) — unique but correctly
  documented inline.

---

## Suggested order of attack

**Tier A + B1–B3 are the "do before freeze" set** — they change what's persisted
in rows. Tiers C–E are worth a sweep while editing baselines is still free, but
wouldn't block leaving alpha. Every SQL change here re-runs the usual gates
(`npm run db:reset` + `npm run import`, `npm run test:db`, `npx tsc -b`,
`npm test`, `npm run report:labels` for anything touching status/labels).
