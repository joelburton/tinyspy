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
