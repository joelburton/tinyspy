# Area: codenamesduet

**Brand: TinySpy.** The codename is what the code says everywhere; the
brand appears in the manifest's `BRAND` and nowhere else.

One of the sixteen game areas. The process is [app-audit.md](../app-audit.md)
§4; the plan holds the order, this file holds the reading. Owed work lives in
`src/codenamesduet/todo.md`, not here.

**Status: OPEN** (2026-09-23), roster agreed and stamped.

**Two passes, back to back**: the audit — React, SQL and CSS together — then
the tile-feedback pass against [tile-feedback.md](../tile-feedback.md).

## The roster

Agreed with Joel 2026-09-23 (*"yes."*), `cs-met-codenamesduet` — **58 stamped
files** at the opening:

| where | how many | note |
|---|---|---|
| `src/codenamesduet/` | 43 | Nine arrived `cs-fixed-outcome-fix` (`Board`, `BoardCol`, `GameEventLog`, `PlayArea`, `useBoard`, `useGame`, `turnOutcome`, `pdf/model`, `printCodenamesduetPdf`) — that area ruled its files belong to their own area, which is this one. The rest arrived `cs-unmet` |
| `supabase/migrations/20260615000001_codenamesduet.sql` | 1 | |
| `supabase/sql/codenamesduet.sql` | 1 | |
| `supabase/tests/codenamesduet/` | 12 | all eleven pgTAP files and `setup.psql` |
| `supabase/functions/codenamesduet-suggest-clue/index.ts` | 1 | the AI clue suggester — this game's own code, read here as spellingbee's edge function was |

`src/codenamesduet/logo.svg` and `supabase/functions/codenamesduet-suggest-clue/deno.json`
have nowhere to put a stamp; `todo.md` is markdown and carries none. All three
are roster all the same. `docs/games/codenamesduet.md` is on the roster too,
and is deleted into a new `src/codenamesduet/doc.md` in pass 2, as the earlier
games' docs were.

### What is NOT on it

- **The shared folders it imports** — their contracts are read against this
  game, not re-audited.
- **The five e2e specs** (`codenamesduet`, `-clueform`, `-history`, `-mobile`,
  `-print`) and `e2e/gallery/games/codenamesduet.ts` — `cs-unmet`, off the
  roster as every game's have been.
- **Open at the opening:** whether any pgTAP file pins a shared `common.`
  function rather than this game's own, as spellingbee's `rank_idx_test.sql`
  did. If the reading finds one, it comes off the roster then.

## The reading

### The folder's `todo.md` — read 2026-09-23

Two Bugs (`.clueLabel` read by nothing; `act-new-game` answers `active` before
the game row has loaded), three Soon (the info-column action row's branches;
`CluePanel` needs a name that says what it is; the two finished-player banners
lead with the actor), one Someday (the board's monospace, decided with the
setup forms' mono question). Maybe and Won't do are empty. Nothing is converted
into a finding yet.

Every item was checked against the code, and each still holds:
`act-new-game` is `describe: () => 'active'` (`PlayArea.tsx`); `InfoCol.tsx`
still forks into two `<InfoActionsRow>`s, and the in-play one has no
back-to-club; both banners pass `show="both"`; `Board.module.css` still sets
`ui-monospace, Menlo, monospace`.

**One detail is stale:** the `.clueLabel` Bug says the class is in *the AI
companion's* stylesheet. It is in `CluePanel.module.css` — the companion's has
none — and `cssClasses.test.ts` names no file, so only the todo's prose is
wrong.

**One more item is owed to this area from elsewhere:** `common/sounds/todo.md`
→ Soon, *"codenamesduet rings when you are given a clue"* (Joel, 2026-09-23).
Its "your turn" is an event, not the shared `current_turn_user_id` — the game
neither reads nor writes that column — so the bell in `GamePage` never rings
here, and `playSound('bell')` goes where the clue arrives for the guesser.

### The two standing registers, reconciled — 2026-09-23

`docs/games/codenamesduet.md` held one Deferred entry and two Won't do;
`docs/deferred.md` names this game in its per-game table and in four
cross-cutting items. Where each went:

| entry | verdict |
|---|---|
| BUG — restart leaves the CLUES in the event log (Joel, prod, 2026-08-30, *"may already be fixed locally"*) | **fixed, deleted.** Both halves are closed in the tree, by reading rather than by a two-player run. The server: `replay_board` has deleted `codenamesduet.clues` since it was written (`a7075588`, 2026-08-03), and `replay_test.sql` asserts *"restart → the clue log is wiped"*. So on 2026-08-30 the rows were gone and what showed was the CLIENT's copy — `useClues` keeps what it holds, and a DELETE did not clear it. The client: since `24664a0a` (2026-09-15) `GamePage` keys the play surface on `common.games.restarts`, which `common.reset_game` bumps, and `useClues` is called in `PlayArea` — so a restart unmounts the old clue list and fetches an empty one, for both players, since each sees the bump |
| Won't do: mission / campaign mode | **moved to `todo.md` → Won't do**, text unchanged |
| Won't do: tile `aria-label`s | **moved to `todo.md` → Won't do**, text unchanged |
| deferred.md: the per-game table's row | **repointed** at the folder's `todo.md`, as connections', psychicnum's, spellingbee's and wordle's are |
| deferred.md: thirty-three RPCs answer a deleted game as a fault — four are this game's (`get_clue_context`, `pass_turn`, `submit_clue`, `submit_guess`) | **left.** The shared entry keeps the work; spellingbee converted its own one as a finding (F-spellingbee-10), and these four are the same candidate for pass 2 |
| deferred.md: `cell` vs `tile` (codenamesduet 51 / 62) | **left.** Filed as its own sweep (Joel, 2026-09-16) |
| deferred.md: hide-the-solution-on-loss, crosswords replay | **left.** Struck through, DONE — history |

The doc's two sections are now one `## Deferred` pointing at the todo, as
spellingbee's was.

**One candidate for the prose pass, found here:** `docs/ui.md` → the reveal
section says codenamesduet *"has no replay to protect (its board is the
secret)"*. It has had one since 2026-08-03 — `replay_board`, the mulligan on
the same key cards, whose own comment argues the case against exactly that
sentence.

### What moved under the area — read 2026-09-23

§4's window is empty by construction (the opening commit stamped the folder).
The last commit that wrote this game's code for its own sake is **`ea6d2987`
(2026-07-12, the realtime channel-prefix rename)** — ten weeks back. Since then
**158 commits touched `src/codenamesduet/`, every one a shared area reaching
in**, and **109 touched `src/common/game-page/`**. So the window is not "what
the game has not caught up with": the actions sprint converted it
(`42b8c635`), `outcome-fix` and `history-names` read it end to end, the tiles
pass tuned its board (`c0ea43a4`). Most shell rules arrived here by the commit
that made them.

spellingbee read the 2026-09-15 → 2026-09-22 slice of this window. Its three
false findings hold here too, and four more come from the older slice:

- *"This state survives a restart"* or *"a game→game navigation"* — the play
  surface is keyed on `restarts`, and `GamePageGate` unmounts the subtree on a
  new `gameId` (`e3d8f969`).
- *"A finished player wedges the pause"* — `activePlayers` drops conceded,
  `locally_terminal` and `ai_member` players (`624c8dc2`). **Nothing owed:**
  codenamesduet's SQL sets no `locally_terminal`, and rightly — a player whose
  agents are all found keeps guessing, so they are still in the game.
- *"`computePause` answers who is absent"* — it answers a boolean
  (`197d455a`); the suspend confirm is `askConfirmation(…)` (`b5f21539`).
- *"Needs its own back-to-club / game-over dim / play-surface frame"* — the
  shell owns one back-to-club for every surface (`0cadaa54`), the game-over dim
  is deleted (`765275ec`), and the shell builds the play surface
  (`44b43e04`).
- *"Needs a confirm modal of its own"* — `useConfirmation` is gone; there is
  one way to ask (`12ed195c`).
- *"Restart's button should hide mid-game"* — `useStandardGameActions`
  already does that per asker (`04773acd`). `act-new-game` is the game's own
  and is the todo's Soon item, not a new finding.
- *"The board should shake a refused guess"* — no board shakes whole any more
  (`dce68b6d`, `1bfeb02a`); codenamesduet has no shake at all, and adding one
  is tile-feedback's question, not a finding.

**What the game already reads, so a finding has to be about what it wrote
ITSELF:** `shared.boardSeal` (`Board.tsx`), the shared play-area stylesheet
(`Board.tsx`, `BoardCol.tsx`, `PlayArea.tsx`), `InfoCol.tsx`'s imports from
the info column's own stylesheet and `<InfoActionsRow>`,
`useStandardGameActions` and `describeReveal` (`PlayArea.tsx`).

**What it does NOT read that spellingbee did:** `useMark`, `VERDICT_TONE` and
`--avail-h`. Absence is not a finding by itself — a guess here is not a word
answer, and whether a reveal wants a verdict mark is tile-feedback's question —
but each is a place for the read to look.

## The restructure

Each step is one commit Joel reads; that reading is his careful read of the
code, made on the shape that will stay. Every step is behavior-preserving
unless its heading says otherwise, verified by the net below.

### Step 0 — the baseline — DONE 2026-09-23

Run on the untouched tree with the roster stamped `cs-met-codenamesduet`
(Joel: *"do next"*, then *"both"* to the e2e question):

- `tsc -b` clean; lint clean over `src/codenamesduet/` **and**
  `supabase/functions/codenamesduet-suggest-clue/`.
- The game's unit tests and the guards: 41 files, 356 tests, green.
- The edge function: **it has no tests**, so the net there is `deno check`
  alone — clean. That proves it type-checks, not that it boots.
- pgTAP, the whole suite: `gmake db-sql ENV=local` then `npm run test:db` —
  181 files, 2584 tests, PASS.
- The geometry harness re-seeded with `BASELINE=1`: 21 boards written, and the
  new file **byte-identical to the one it replaced**, so no board had drifted
  since the last seed. (Nothing to commit — the file is gitignored.)
- codenamesduet's five e2e specs: **7 tests, green in 17.8s** — the clue
  form's Tab ring, the history viewer, mobile (two), print, below-board layout
  stability, and New game.

**What the net does not cover, so a step touching it needs its own check:** no
e2e plays a game through to a win or a loss, and none restarts. The AI clue
suggester is reached only through a STUBBED edge function (`codenamesduet.e2e.ts`
routes it to a refusal and a fault), so no run calls the real one. The restart
and the terminal paths are pinned only by pgTAP on the server side and the unit
specs on the client.

**A second candidate for the prose pass:** `codenamesduet.e2e.ts` → the New
game spec's header says there is *"deliberately no 'Restart' twin"* because
replaying the board *"would hand both"* players the secret — the same stale
claim as `docs/ui.md`'s. `replay_board` has been exactly that mulligan since
2026-08-03.

**A later red is the step's.**

### Step 1 — gather this game's owed work into `todo.md` — DONE 2026-09-23

The doc's register was emptied above, before the step had a number. Every
other `todo.md`, every plan, and the docs were grepped for the game. What they
held:

**Moved into `todo.md`:**

- **The clue-arrival bell** → Soon. `src/common/sounds/todo.md` says *"At
  codenamesduet's own area"*; the work is this game's own code, so the todo
  carries it and the sounds entry stays as the rollout's record.
- **The AI companion's minimum size** → Someday. `floating-panels/todo.md`
  lists every companion's eyeballed pair, and Joel's word there is *"as we get
  to these individually in areas, we can figure out"*. The shared entry keeps
  the list.

**`plans/tile-feedback.md` holds three codenamesduet entries, and none is
`todo.md`'s** — all are pass 3's, read against the board when it opens:
the shape-1 section (proposals: **the turn marks first** — the plan records it
drawing neither the dim nor the flash, to be re-checked at pass 3 since the
turn frame moved into the shell — the in-flight dim on a guessed tile, and
attention on the tile your partner just guessed); the roster row (tf0, the
`.triPeer` / `.triMine` triangles, and the tile outline painted with the action
button's blue, `Board.module.css`); and the token row (*do not collapse*
`--codenamesduet-agent` into `--outcome-won-ink-color` though the hex is
identical — confirm and say so in the token).

**Two things for the audit, not the todo** — both are faults in files on this
roster, so they are findings when pass 2 opens:

- `supabase/migrations/20260615000001_codenamesduet.sql` → the RLS comment on
  the key cards ends *"Deferred — see docs/deferred.md → codenamesduet"*. No
  such entry exists, and the per-game row never carried it. It is an APPLIED
  migration, so the fix is not an edit there; whether the hardening is owed
  at all (under the friends-trust model it reads as a Won't do) is Joel's.
- `supabase/sql/codenamesduet.sql` → `create_game`'s comment points at
  *"docs/deferred.md → Setup-shape evolution"*, which is struck through there
  as decided (YAGNI). The pointer lands, but on a ruling, not an open item.

**Checked and holding nothing owed:**

- `common/game-page/todo.md`'s whole-table stop for races — codenamesduet has
  no compete mode.
- Its per-game `tone`-for-outcome sweep — the game's five uses of `tone` are
  all a BUTTON's tone, which is correct.
- `common/info-sheet/todo.md` (a shared `<InfoCol>`) — shared work, and it
  cites this game only as having drifted once.
- `common/keyboard/todo.md`'s nested-ring bug — this game is its evidence that
  nothing hits it today.
- `common/setup-form/todo.md`'s mono question — the todo already carries the
  board's half, in Someday.
- `common/actions/todo.md`'s Help-lists-`hidden` question — shared, and it
  changes all games at once.
- `plans/keyboard-nav-plan.md`, `plans/dark-mode.md`, `plans/turn-bell.md`
  and `plans/playarea-readability.md` cite this game as evidence or as a row in
  their own survey. Each is a plan with its own home, and the readability
  survey is what pass 1's steps are.
- `docs/mobile.md` → TODO, `docs/ui.md` → Explicitly deferred — nothing
  that names this game.

**What `todo.md` holds after the step:** two Bugs, four Soon (the action-row
collapse, the `CluePanel` name, the banners, the bell), two Someday (the
companion's size, the board's monospace), two Won't do.

### Step 2 — the loader / loaded split (readability 3.1) — DONE 2026-09-23

The shape the earlier games settled: `PlayAreaLoader` owns the reads and the
three gates — `<Loading>`, `<EnvelopeErrorPage>`, `<NoSuchGamePage>` — and
hands `PlayArea` everything non-null, with `setup` narrowed once in its JSX.
The manifest's lazy line names the loader, and the spec mounts it at every
site with the three hooks mocked exactly as before.

**Where this game differs: THREE reads, not one.** `useGame`, `useBoard` and
`useClues` all move into the loader. `useBoard` takes the partner-key reveal as
an argument — it is what turns the choice into `peerKey` — so
`useSolutionReveal` moved up with it, and the loaded component takes
`peerKeyShown` and `togglePeerKey` as props. The reveal's long rationale
comment moved down to `actReveal`'s binding, where the choice is made. Moving
the reveal OUT of `useBoard`'s signature (the hook returns the key, the
surface decides whether to show it) would put the toggle back in the surface;
that is a change to the hook's contract, not part of a split, and is left for
the audit to weigh.

**The two rosters are two props.** The context's `players` is the club roster
every game gets (read as `members` by New game); `useGame`'s `players` are the
two SEATED players, each with a `seat`. The loaded component takes the second
as `seatedPlayers` and reads it as `players` in its body, so no line below the
destructuring changed.

**What went with it:** `codenamesduetSetup` and its cast (five readers now
read `setup`), `useTurnStatus`'s nullable `game` and its `if (game && …)`, the
docstring sentence saying it is *"self-contained so it can be called
unconditionally before PlayArea's loading early-return"*, the three "above the
early return(s)" comments, Print's `describe: () => (game && myKey &&
words.length >= 25 ? 'active' : 'hidden')` and its `run`'s matching guard, and
the gates at the bottom with their `<p>Loading board…</p>` and `<p>Game not
found.</p>`. `GameRow` is exported from `useGame.ts` for the loaded props, and
`useBoard.ts`'s zero-rows comment names the loader and the no-such-game page
rather than the PlayArea's old sentence.

**The not-found gate's comment was WRONG, and the new one says why.** It read
*"`!myKey` and a short word list are DERIVED from the game row, so they can
only be missing when it is"*. `myKey` is also null for a viewer who holds no
seat — a club member watching — so a watcher has always been told there is no
game. That is unchanged (spectating is `plans/spectating.md`'s, and undecided);
the comment now names the case, and the console `detail` says which of the
three was missing (`rows=… key=seated|none words=…`).

**Two behavior changes, stated now:**

- **The loading gate waits for all three reads.** Before, only `useBoard`'s
  `loading` gated; `useGame`'s and `useClues`' were never read. A board that
  answered before the game row drew *"Game not found."* until the row arrived,
  and one that answered before the clues drew a turn with no clue in it. Both
  windows are gone.
- **The same change the four earlier games made:** while the reads are out
  the header menu has no game rows and `+` does nothing, where before the rows
  were published pre-load and `+` asked the new-game question and then could
  not act. **That IS the Bug in `todo.md`**, deleted there —
  `describe: () => 'active'` is now true rather than optimistic. The empty tab
  ring (`useTabRing([])`) is also mounted only once the surface is, so during
  `<Loading>` nothing holds Tab on the page.

**Every effect's edge, read as it moved** (readability §4): the menu, the
turn status, the terminal verdict and the celebration now first run on a
LOADED surface. The verdict is keyed on `isTerminal` / `playState`, which the
shell already had, so it lands a beat later on an already-finished game, not
differently. `useCelebration` never pops on mount, so an already-won game is
still quiet.

**Verified:** `tsc -b` and eslint clean; 41 files, 356 tests green. No e2e
run for this step.

### Step 3 — the `doc.md` skeleton, with the RPCs and FE submissions written — DONE 2026-09-23

As spellingbee's `52d6897c`: `src/codenamesduet/doc.md`, the same seven
headings, with the lede, a short intro, the RPCs and the FE submissions
written from `supabase/sql/codenamesduet.sql`, the edge function and the call
sites — not from the old doc — and Game rules, Schema, Frontend and Tests
marked owed to pass 2. The RPC section is the `ok` answers only; a refusal
that is part of the story is a clause without a code.

**The intro's four things:** the server decides every guess, the opposite of
spellingbee and connections; a turn is a clue and the guesses it earns, with
the finished-player hand-off and sudden death; the shell's turn machinery does
not reach this game because "your turn" is a clue arriving, not
`current_turn_user_id` moving; and the AI clue suggester.

**The examples are one REAL game**, `PAGE-CHAIN-EGG` on the local stack
(club `joel-moth`, the two `deadbeef-…` seed players, 9 turns, no timer): its
one clue (`WORD` · 2, seat A, turn 1) and B's two guesses in order — SMOKE, an
agent on A's key, then PAGE, a bystander that ended the turn at 2 / 8 with B
to clue. Where no real row exists — the three terminal answers, a pass — the
doc shows the keys with `…` rather than invented numbers.

**This game's own question, answered in the FE-submissions section:** there is
nothing for the frontend to decide, so the section is short. Every sentence a
player reads about their own move is the server's — ten refusal lines, all
races, all `warning` — and the table lists each with the RPC that writes it.
The only words the frontend writes are the header's four peer phrases
(`useTurnStatus`) and the terminal verdicts, which are a standing condition,
not an answer. **Step 4 therefore has less to convert here than at any game
so far** — a finding for that step to confirm, not a conclusion.

**The edge function is listed after the moves, not first.** spellingbee's
stood in front of `create_game` and was what starting a game actually called;
this one is a helper beside the clue form, and `get_clue_context` is described
inside it rather than as an RPC of its own, since only the edge function reads
it.

**Written against the code, and where the old doc disagreed:**

- `create_game` is headed `→ table(id uuid)` and `end_game` `→ void`; both
  answer an envelope.
- `submit_timeout` and `end_game` say a second call raises `P0001` *"which the
  FE swallows"*; both answer `common._raise_game_over()`'s race.
- `status->>'outcome'` throughout, where the key is `reason`.
- The RLS section's *"not planned for the friends-alpha posture"* — the project
  is not alpha.

**Seen with the code open, left for pass 2:**

- **`submit_clue` judges nothing about the clue.** Any word — empty, several
  words, or a word on the board — and any count from zero up. The frontend
  checks only that both are filled. The rulebook forbids a board word as a
  clue; under the trust model that may be exactly right, but nothing says so.
- **`get_clue_context` admits sudden death, where `submit_clue` does not.** The
  clue form is not drawn in sudden death, so the gap is unreachable today;
  the two gates still disagree.
- Comments in `codenamesduet.sql` with the same rename and envelope residue as
  the old doc: `submit_guess`'s *"`outcome` names the CAUSE"* over a `reason`
  key; `submit_timeout`'s and `end_game`'s `P0001` swallowed by the FE;
  `end_game`'s `status.outcome='manual'` and *"`ctx.menu.setGameItems`"*. The
  manifest's `submitTimeout` comment says *"the outcome names the cause"*.
- The edge function's header calls the caller *"the BoardScreen's 'Need a
  clue?' button"* (it is the AI button on the clue form) and says a refusal is
  *"forward[ed as] 403"* (it relays the envelope, as the body's own comment
  says).

**Verified:** the guards green with the file in place (31 files, 285 tests).

### Step 4 — the `AnswerMessage` conversion — DONE 2026-09-23

**No `lib/answer.ts`, by an existing ruling rather than a new one.**
`outcome-fix` (`a193de24`, 2026-09-17) found nothing to key: a guess is one
tile and answers with a reveal, which the board says, so the pill is silent on
all five `ok`s; the log draws guessed words in the key-card palette; the PDF
uses its own marks. The only thing wearing an outcome is the TURN, and
`lib/turnOutcome.ts` is where it is decided (Joel's decision j, 2026-09-16).
`docs/outcomes.md` → *"Two games deliberately have no answer file"* records
it. Step 3 confirmed what that predicted: every sentence about a player's own
move is the server's refusal, and there is no peer line per move — the header
narrates a standing state (`useTurnStatus`), not an answer.

**What the step DID owe is the SQL half**, the rule connections' Step 4 set and
wordle's followed: an `ok` that is one of the game's answers states the fact
and carries no outcome. `submit_guess` still passed one on every `ok` — `won`
for an agent and the win, `lost` for a bystander and both losses — which
outcome-fix had confirmed and left, since nothing read it. The three
`ok_envelope` calls dropped the argument, and the terminal branch's comment
now says why the answer carries none. `pass_turn` already carried none and
already pinned it.

**The pins.** Six assertions asserted the outcome — `game_loop_test.sql`'s
agent, bystander and assassin; `sudden_death_test.sql`'s agent and
`lost_clock`; `win_test.sql`'s win — and now assert `"outcome": null`,
written out because `envelope_is` is containment. `cross_direction_test.sql`'s
three `ok` checks name no outcome and were left: they are about which key
labels a guess, not about the envelope.

**The two sentences that said otherwise:** `turnOutcome.ts`'s docstring and
`docs/games/codenamesduet.md` → The one outcome decision both said
`submit_guess` *"does say a per-guess word in its envelope"*; both now say its
answers carry none and the fold is the only place one is decided. The old
doc's `submit_guess` table lost its `won` / `lost` column entries on the five
`ok` rows.

**Not a word changed on screen.** Nothing on the frontend read a guess's
outcome (`res.outcome` has no reader in `src/codenamesduet/`).

**Verified by planting.** `won` put back on the agent branch from a scratchpad
copy of `submit_guess`: the whole suite went red on exactly the two agent pins
(`game_loop_test.sql` 6, `sudden_death_test.sql` 2), each naming `outcome:
want null, got "won"`; restored, green. The whole pgTAP suite green (181 files,
2584 tests), `tsc -b` clean, 41 files / 356 unit tests green. No e2e for this
step.

### Paused before Step 5 — the events table — 2026-09-23

Talking Step 4 through, Joel asked whether the header's peer phrases should go
through the answer machinery, and the conversation went to the log's shape:
a pass and an AI hint are recorded nowhere, and the log is two tables where
every other game has one. The design is
[plans/codenamesduet-events.md](../codenamesduet-events.md) — one
`codenamesduet.events` table, a backfill, and a `lib/answer.ts` after all.
Joel: *"once i've read that plan, we do this."* **Step 4's "no answer file" is
overtaken by it**; its SQL half — no outcome on a guess's `ok` — stands either
way. Step 5 resumes after.

## Findings

*(`F-codenamesduet-1 · slug · title`, one heading each; a status prefix when it
has one, no prefix means OPEN)*

## Notes

*(things worth remembering about this area that are neither a finding nor
owed work — a forward-fix made from another area, a question for the opening,
a dependency listed and left. Anything durable goes to `todo.md` or
`docs/games/codenamesduet.md` instead; a note here never stands in for either)*

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] `docs/games/codenamesduet.md` reconciled with `todo.md`: its Deferred
      section moved into the todo, or deliberately kept as the standing register
- [ ] the tile-feedback pass done, and the game's tf level updated there
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
