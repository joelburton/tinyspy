# Code review — 2026-07-31

Repo-wide review of the 14 unpushed commits (`cd61bbf`…`c67e6b8`): the end-states
sweep, replay/new-game terminal rows, icon-only actions, global/local feedback
routing, coop `target_rank`, and the new replay RPCs. Scope: cross-game
consistency (button placement + messages), code correctness (FE + DB), and docs
accuracy. Every finding below was verified against the current code (file:line
refs are to `main` at `c67e6b8`).

**Gates at review time:** `tsc -b` clean; eslint clean on real sources (but see
finding C5d); all 1822 pgTAP tests pass; the deleted
GameOverModal/TerminalModal/useTerminalModal left zero remnants in `src/` or
`e2e/`. The hard layout rules — no-reflow, InfoSheet flex-column scroll,
participant-gate vs turn-gate — all came up clean across the diff.

---

## 1. Correctness findings (ranked)

### C1 — Solved wordle-compete player's pill says "Lost — race continues"

`src/wordle/components/PlayArea.tsx:416` calls `outOfRacePill(myConceded)` with
no `activeText`, so the default `'Lost — race continues'` shows for *every*
non-conceded locally-done state — including `mySolved` (folded into
`isLocallyDone` at line 377). A solver hasn't lost; fewest-guesses is decided at
the end, and they may well be winning. Waffle handles the identical state
correctly (`'Solved — waiting on the rest'` / `'Out of swaps — waiting'`,
`src/waffle/components/PlayArea.tsx:436-440`).

**Fix:** pass an activeText like waffle's
(`mySolved ? 'Solved — waiting on the rest' : 'Out of guesses — waiting'`).

### C2 — Scrabble's New game silently drops conceded players from the rematch

`src/scrabble/components/PlayArea.tsx:407`:
`player_user_ids: players.filter((p) => !p.conceded)`. Every sibling
(psychicnum:337, bananagrams:218, stackdown:305, connections:302, waffle,
codenamesduet) passes the full roster — and scrabble's own comment eight lines
up says "'same again' means the same opponents."

- Scenario A: 2-human compete, one concedes, winner clicks New game →
  `create_game` called with **one** player → compete's ≥2-player check rejects →
  "New game failed" pill, dead end.
- Scenario B: 3 players, one conceded → that friend is silently excluded from
  the rematch.

**Fix:** drop the filter.

### C3 — New replay RPCs don't lock the game row (psychicnum, connections, stackdown)

`scrabble.replay_board` (20260627000000_scrabble.sql:1655) takes
`select … for update` with a comment explaining why: a replay racing an
in-flight move must serialize against it. The three other new replays don't —
psychicnum.sql:1212 (no `for update`), connections.sql:1310 (no lock at all),
stackdown.sql:840 — yet their move RPCs (`connections.submit_guess`:721,
`psychicnum.submit_guess`:577, `stackdown.submit_word`:391) all lock the games
row. A replay interleaving with an uncommitted move can leave the "fresh" game
with a stray log row / decremented budget; worst case, a game-ending in-flight
move re-terminals the just-reset game with the old run's outcome.
docs/supabase.md's "**every** mid-game mutation locks the game row" is now
internally inconsistent.

Same pre-existing gap (outside this diff) in
spellingbee/wordwheel/waffle/wordle's `replay_board`.

**Fix:** add `for update` to the three new replays; backfill the older four
whenever those migrations are next touched.

### C4 — Turn-order rewind not propagated to the older replays

This branch's psychicnum/connections/scrabble replays rewind
`current_turn_user_id` to the opener (e.g. psychicnum.sql:1230-1234). waffle,
wordle, and wordiply are also turn-order-capable
(`common._require_turn` at waffle.sql:651, wordle.sql:492, wordiply.sql:821) but
their pre-existing `replay_board`s contain **zero** references to
`current_turn_user_id` (verified) — a replayed turn-order game there resumes
with the *last mover of the previous run* holding the turn rather than the
original opener. Playable, but inconsistent with the behavior this branch just
defined and tested for the siblings.

### C5 — Minor

- **(a) No double-submit guard on any New game / Replay handler** (all 11,
  including `useStandardGameActions.replay`). Two quick clicks → two fresh games;
  the first sits orphaned in the club list and peers get two invitation toasts.
  Self-healing at friends-scale, but real.
- **(b) bananagrams celebration `'someone'` fallback**
  (`src/bananagrams/components/PlayArea.tsx:310-319`): `winnerName` falls back to
  the string `'someone'`, a *legal username* under `^[a-z][a-z0-9-]{2,14}$` — a
  player literally named "someone" gets confetti on a no-winner timeout. Gate on
  `ctx.status?.winner_username != null` instead of the fallback string.
- **(c) coop `target_rank: 0` is an instant win** — `_rank_idx ≥ 0` is true
  after any accepted word. Validation deliberately allows 0..6 in both modes and
  compete has the same semantics pre-existing; only matters if the FE ever
  exposes rank 0.
- **(d) `npm run lint` fails whenever local Supabase is running** —
  `eslint.config.js:59` ignores only `dist` + the boggle wordlist, so the
  generated `supabase/.temp/…/index.ts` produces 189 bogus `prefer-const`
  errors. One-line fix: add `'supabase/.temp'` to `globalIgnores`.
- **(e) connections replay docstring is wrong** (connections.sql:1293-1295):
  says status "goes back to the empty object create_game leaves it at" — a fresh
  game's status is actually **NULL** (`common.create_game` omits it); a replayed
  one gets `'{}'`. No behavioral impact (both `labelFor`s do `row.status ?? {}`)
  but the comment teaches something false.

### C6 — Probable oversight (flagging, not asserting intent)

**The new coop target rank is invisible during play.**
`src/spellingbee/components/InfoCol.tsx:126,183` and wordwheel's twin gate both
target readouts on `isCompete`; spellingbee's print-model setup list
(`PlayArea.tsx:172`) is also compete-gated. A coop team that set "Win at Solid"
sees the goal nowhere after the setup dialog closes until the win verdict names
it. Server, verdict, and celebration sides are all correct — the InfoCols were
simply untouched by the commit.

### Verified clean

No-reflow (MobileStatusBar always mounted with fixed `--mobile-status-height`;
pills swap inside reserved slots); no setState-in-effect / stale closures in the
new hooks; InfoSheet scroll fix matches the known-good flex-column +
`min-height:0` recipe; replay/new-game navigation (mode composition, `nextUnplayedPuzzle`,
PostgREST row-cap not hit); celebration sides correct everywhere (coop team win;
compete winner in scrabble/bananagrams; never pops on mount; replay re-arms);
`TerminalCopy.outcome` removal left no consumers; winner-name resolution (ties,
all-conceded, AI winners) consistent. DB side: all four new RPCs follow the
SECURITY DEFINER + pinned search_path + `require_game_player` + grant
conventions; no two-current-games race (replay reuses the row;
`reset_game` never touches `is_current_view`); replay copies the right state in
all four games; coop target_rank logic correct at the boundary and fires once;
RLS unchanged, hidden solutions re-shield on replay (`games_state` gates on
`is_terminal`, which `reset_game` clears); realtime-publication invariant intact;
15-char usernames consistent across CHECK/regex/tests/seeds; `src/types/db.ts`
gained `replay_board` in exactly the right four schemas.

**pgTAP gaps (minor):** non-player rejections use `throws_ok(…, NULL, NULL, …)`
(any error passes — errcode 42501 not pinned); mid-game replay asserted only
implicitly (scrabble); coop `target_rank` carried through replay is untested
(coop_target_test never replays, replay_test never sets a coop target); explicit
`"target_rank": null` in coop untested.

---

## 2. Consistency drift list (ranked)

Deliberate documented differences all verified as intentional and left alone:
scrabble's 1-2-word verdicts (small commit slot), no-Restart in
codenamesduet/bananagrams (ui.md:138), waffle/wordle's terminal Reveal,
bananagrams' inverted info column + desktop-only block, connections'
no-status-bar (mobile.md:633), boggle compete's silent header, wordiply's
no-celebration, codenamesduet's timed `ownAction` pills, "tone follows the
event" greens.

### H1 = finding C1 above (wrong "Lost" pill for a wordle solver).

### H2 — Dual-placement rule broken in four games

`docs/playarea.md:104-112`: locally-terminal shows in BOTH the action row and
the below-board pill — "the rule, not redundancy to trim." spellingbee
(`PlayArea.tsx:485`), wordwheel (`:496`), and boggle (`:422`) pass bare
`localFeedback` with no conceded branch; scrabble's pill chain
(`PlayArea.tsx:478-484`) has none either. A conceded compete player gets no
below-board explanation — and on mobile the InfoCol row is off-canvas. wordiply
(spellingbee's own fork) does it right (`PlayArea.tsx:306-308`).
**Fix:** insert `outOfRacePill(true)` into the four chains.

### H3 — Crosswords is the sole end-states-sweep holdout

No outcome-message line, no `TerminalActionRow`, no New game; a labeled
non-primary Back-to-club (`src/crosswords/components/PlayArea.tsx:841-845`); no
locally-terminal row (pill only). Replay is separately deferred
(deferred.md → Terminal results). **Fix:** adopt `TerminalActionRow`
(message + NewGame + primary iconOnly Club) now; decide Replay separately.

### M — one-decision copy/component unifications

- **M4 bananagrams verdict contract**: trailing periods + full sentences
  (`PlayArea.tsx:353-358`) against terminalCopy.ts's "no trailing period, it's a
  LABEL"; hand-rolled terminal + locally-terminal rows byte-equivalent to
  `TerminalActionRow`/`LocalTerminalRow` (`:446-456`); `'You're out'` vs
  canonical `'You conceded'`; pill `"You conceded — you're out of the race."` vs
  shared `'Conceded — race continues'`. Keep the Bananas!/emoji flavor, drop the
  periods, swap in the shared rows — or record an explicit exception.
- **M5 bananagrams concede confirm** (`PlayArea.tsx:182`) differs from the
  shared `CONCEDE_CONFIRM` (`useStandardGameActions.ts:15`). Use the shared one.
- **M6 connections hand-rolls End/Replay/Concede** near-identical to
  `useStandardGameActions` (`PlayArea.tsx:226-330`; confirm strings already
  match). Adopt the hook (10th adopter); New game stays bespoke (archive-walk).
- **M7 repeated-guess tone**: connections `'You already tried that'` = error
  (`BoardCol.tsx:166`); wordle `'Already guessed'` = warning; word-list games
  `'— already found'` = warning. A soft reject that burns nothing should be one
  tone → connections to warning.
- **M8 no-winner phrasing**: `'Out of time — no winner'` (wordle:540,
  waffle:565, stackdown:596) vs `'— nobody won'` (psychicnum:585,
  connections:616). Pick the majority `— no winner`.
- **M9 spellingbee/wordwheel compete manual end** skips `endedCopy()` and
  mis-capitalizes: `'Ended: No winner'` / `'Game over'`
  (`spellingbee/PlayArea.tsx:661`, wordwheel:671) — the only mid-verdict capital
  in the roster. Route through `endedCopy('compete')`.
- **M10 peer-pill lifetime split**: explicit `ms: 3000` (wordle, waffle,
  connections, psychicnum, scrabble) vs the 2200 default (spellingbee,
  wordwheel, boggle, wordiply, stackdown). Pick one — cheapest is raising the
  GamePage default to 3000 and dropping the explicit overrides.
- **M11 rank-climb pills are sticky** (`spellingbee/PlayArea.tsx:407`,
  wordwheel:411) while every other one-shot peer event is timed; a sticky header
  pill hides the PlayersStrip. → `{ kind: 'timed', ms: 3000 }`.
- **M12 "Restart" vs "Replay board"**: the terminal button says "Restart"
  (`RestartButton.tsx`), the menu item + confirm dialog in the same ten games
  say "Replay board", docs call the feature Replay. One word both places;
  cheapest is changing the shared `RestartButton` default label once.

### L — low-priority

- **L13 docs/ui.md:176** claims Back-to-club is in "every game's playing action
  row"; true in only 6/13 (the entry-row games). Either add it to the others'
  playing rows or soften the doc — **decision needed, not just a fix**.
- **L14 stale docstrings**: `useStandardGameActions.ts:28-29` lists 6 adopters
  (actual 9); `scrabble/PlayArea.tsx:600-602` claims `Completed:`/`Ended: time`
  colon-forms and a timeout-vs-manual distinction the code doesn't make (both
  return plain `'Ended'`, lines 630-631); wordle/stackdown/wordiply status-bar
  non-adoption has no recorded rationale (connections is the only recorded
  "deliberately not").
- **L15 watcher state**: waffle shows `LocalTerminalRow "Watching — not in this
  game"` (`InfoCol.tsx:245`); stackdown renders `null` (`InfoCol.tsx:194`).
  Waffle's is the better UX; low urgency (no spectators by design).
- **L16 micro-copy tics**: celebration title `"You win! 🎉"` ×5 vs scrabble's
  `"You won! 🎉"`; psychicnum `Correct`/`Incorrect` vs connections
  `Correct!`/`Incorrect`; `'All conceded'` (scrabble, spellingbee, wordwheel) vs
  `'Everyone conceded'` (crosswords, bananagrams); psychicnum `'Won: the race'`
  vs connections `'You won the race!'` (the latter missing the `Won:` prefix);
  wordle's `'Solved! 🎉'` is the only emoji verdict outside bananagrams (waffle's
  sibling argues for the prefix — suggest `'Won: solved it'`).

---

## 3. Docs — updated in this review

Fixed in place (16 files; states-audit.md untouched per its hands-off
constraint, though it still references the deleted modals throughout):

- **Doc bug**: commit `e876c6d` accidentally glued a duplicate "New game"
  section onto the last line of bananagrams.md — removed; the real §212 stays.
- **Deleted-modal references** missed by `c67e6b8`: codenamesduet.md:530,
  bananagrams.md:210/:229, connections.md:237, common.md:190, ui.md:23/:37.
- **Stale `window.confirm` claims**: codenamesduet.md:218 + psychicnum.md:283
  (End is the styled confirm dialog now); spellingbee.md:477 (Concede is still
  `window.confirm`).
- **Celebrations** added to bananagrams.md, stackdown.md, crosswords.md.
- **Mobile status bar**: mobile.md's "Adopted by" list was 4, code has 7 (added
  waffle/scrabble/wordwheel + a whose-turn `waitingTurnPill` paragraph);
  waffle.md + scrabble.md gained their StateLine sentences; common.md:234 now
  documents the `turnCopy.tsx` seam; playarea.md "eleven" → thirteen + the
  waiting-turn precedence + `TerminalActionRow` in the terminal-swap bullet.
- **coop target_rank**: spellingbee.md:523 test-matrix row corrected + the
  missing coop_target_test.sql rows in both spellingbee.md and wordwheel.md.
- **Other**: ui.md:138 replay-holdouts now names crosswords; wordiply.md:303
  coop-verdict row corrected to `Ended: N%, M letters`; features.md gained two
  tag sections (Replay board; New game from the terminal row).

Checked and clean: README, cheatsheet, naming, states, testing, supabase,
code-conventions, common-folders, pdf, deferred, wordle.md, boggle.md, the
handle-limit claims (mobile.md TODO already checked off at 15; regex `{2,14}`
matches the migration).

---

## 4. Suggested priority

1. C1/H1 (wordle "Lost" pill) and C2 (scrabble roster filter) — user-visible
   wrong behavior, both one-line fixes.
2. H2 (`outOfRacePill(true)` in four games) and H3 (crosswords terminal row).
3. C6 (coop target visibility in the two InfoCols) — likely-oversight UX gap.
4. C3/C4 (replay locks + turn rewind) next time the migrations are touched.
5. The M-list copy decisions — each is a one-word/one-line call.
