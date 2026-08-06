# Plan — the screenshot gallery

**Working doc.** Delete it once the thing exists and its durable notes have moved
into [testing.md](testing.md) (how to run it) and [ui.md](ui.md) (that it's the
tool for cross-game consistency).

## The problem

Fifteen games × coop/compete × mid-game/won/lost × desktop/mobile is more states
than anyone will ever open by hand. So cross-game inconsistency goes unnoticed:
not bugs, but drift — a heading styled differently here, a verdict phrased
another way there, a mobile layout nobody has looked at since it shipped. The
2026-08-05 session found two of these (`Win at: undefined%`, and setup lists
that had drifted into reporting different facts on paper than on screen), both
only because a PDF happened to get rendered.

Starting these games by hand is the barrier. A compete game needs several real
accounts, several browser sessions, and someone to play both sides.

## What it is

**A script that puts every game into every interesting state and photographs
it**, writing an HTML contact sheet you can scroll.

**Not a test.** It asserts nothing and fails nothing. Playwright's
`toHaveScreenshot` is deliberately unused: baseline snapshots answer "did
anything change?", which in a UI that changes daily means constant baseline
churn for changes you meant. The question here is "do these fifteen games look
like one app?", and only a person answers that. So: no CI gate, no baselines,
no approval workflow.

## Architecture — three layers

The split that matters: **getting into a state is server work; looking at it is
browser work.** They are separate layers and only the second needs a browser.

### 1. State builders (no browser)

Per-game, `e2e/gallery/<game>.ts`, mirroring the per-game seams the repo already
uses (`lib/history.ts`, `lib/setupSummary.ts`). Each declares which cells it
supports and how to reach them.

**They drive the game's own RPCs**, as the fixtures already do
(`asUser(session).schema(…).rpc(…)`) — *not* hand-written row inserts.

Row inserts are the obvious shortcut given a disposable local DB, and they're
the wrong call:

- They can build states the game **cannot actually produce**. A gallery whose
  job is "does this look right?" must never show a state that can't happen —
  it would send you chasing a layout bug in a screen no player can reach.
- They **duplicate the rules**. Every game's move logic lives in plpgsql;
  reproducing enough of it per game to land a legal mid-game is more work than
  calling `submit_word` three times, and it rots independently.
- They're **no faster**. Neither path involves a browser; both are a few
  round-trips to local Postgres.

Direct SQL stays available as an escape hatch for anything the RPCs can't reach,
but each use must be commented with *why*, because each one is a small lie.

**Terminal states come from SETUP, not from playing.** Driving wordle to a loss
is six rounds of waiting; creating it with one guess is instant. letterboxed
with `extra_words: 0` is two words from a full chain. The `create<Game>Game`
fixtures already take these parameters.

### 2. Capture (browser, but no interaction)

One `browser.newContext()` per viewport, `signIn()` with the state builder's
session, navigate to the game, wait for the board, screenshot. **The browser
never plays** — which is what removes the flakiness, since realtime waits are
what make e2e fragile.

Compete needs one context per player only where the *screenshot* differs by
player (a rival's hidden rack). Otherwise capture one seat.

**PDFs are just another phase**: open the game menu, click Print, catch the
download, `pdftoppm` it to a PNG, and it lands in the same sheet as everything
else.

### 3. The index

An HTML contact sheet, written alongside the images.

**Grouped by CELL, not by game** — this is the one design decision to get right.
The instinct is `gallery/letterboxed/coop-mid-desktop.png`, but the question is
cross-game consistency, so the useful page puts all fifteen games' *"coop /
mid-game / desktop"* side by side. Per-game grouping answers a question you
don't have. Files can be laid out however; the sheet is what you actually read.

Ragged by design: bananagrams is compete-only, codenamesduet coop-only, several
games have no natural loss. **A missing tile is informative** — it says nobody
has looked at that state — so the sheet should draw the hole rather than close
the gap.

## The matrix

| axis | values |
|---|---|
| game | all fifteen |
| mode | coop, compete (whichever the game has) |
| phase | fresh, mid-game, won, lost, PDF |
| viewport | desktop (1280×900), mobile (390×844) |

Ceiling is ~180 tiles; the real number is lower once ragged cells drop out.

## Determinism

**Seed the boards.** The pgTAP fixtures already pass synthetic boards for
exactly this reason, and most `create<Game>Game` helpers accept one. Without
that, two runs re-roll different words and can't be compared — which kills the
main benefit of committing the output.

**Don't reset the database by default.** It's a slow hammer and determinism
comes from the board fixtures, not from an empty DB. Each run makes its own
club + users under a fixed prefix. Keep a `RESET=1` flag for when local data
gets cluttered — you've said the local DB is expendable, so the escape hatch is
free, it just shouldn't be the default cost of every run.

## Committed, not gitignored

Your call, and I think it's right: the history is the point — being able to see
what the club page looked like in July is worth more than a clean tree.

One caveat to decide up front: ~180 PNGs is roughly 10–25 MB per full run, and
git keeps every version forever. So **treat a gallery run as a deliberate act**
(run it, look, commit when it's worth a marker) rather than something that fires
on every change. If it does start to bloat, the lever is capture resolution, not
throwing the history away.

## Where it lives

A `gmake` target (`gallery`), since that's the repo's convention for tooling,
writing to `gallery/`. It is **not** part of `npm run test:e2e` — it's not a
test, and it shouldn't run in the same breath as one.

Runtime will be minutes, not seconds. That's fine for an on-demand tool.

## Costs, honestly

- **Fifteen state builders to write and keep alive.** This is the whole cost;
  the harness is small. Mitigated by them being RPC calls over fixtures that
  already exist, and by a rotted builder showing up as a missing tile — which
  announces itself, unlike a silently-passing test.
- **Ragged coverage** will look untidy. It should; that's information.
- **Not proof of anything.** It puts states in front of you cheaply. Resisting
  the urge to make it assert is what keeps it cheap.

## Sequencing

1. ~~The harness + index generator, with **two games**.~~ **Done** —
   `gmake gallery`, `e2e/gallery/`, letterboxed + wordle, 28 tiles.
2. ~~Look at the sheet; fix the shape before multiplying by fifteen.~~ **Done** —
   see "What the first run taught us" below.
3. Add PDFs as a phase for those two.
4. Sweep the remaining thirteen builders.
5. Move the "how to run it" note into testing.md, the "this is the consistency
   tool" note into ui.md, and delete this file.

## What the first run taught us

- **Every member must join, not just the one being photographed.** A game whose
  players aren't all connected PRESENCE-PAUSES, so the first run captured four
  paused overlays instead of compete boards. The harness now opens a context per
  club member and shoots only the viewer's — which is precisely the
  "several accounts in several tabs" chore this tool exists to remove, so it
  belongs in the harness rather than in each builder.
- **Terminal cells don't pause**, which is why compete/won captured on the first
  run while compete/fresh didn't. Everyone joins regardless, to keep one path.
- **Size is smaller than feared**: 28 tiles ≈ 1.3 MB, so a full fifteen-game
  sheet lands near 7 MB rather than the 10–25 MB estimated above. Committing
  each run is affordable; committing *deliberately* still seems right.
- **The by-cell grouping is the right call.** Reading a strip of "everyone's
  mid-game, desktop, coop" side by side is exactly the comparison that was
  impossible before.
