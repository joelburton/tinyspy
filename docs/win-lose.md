# Win & lose

The ideas every game's winning and losing is built from, and the words for
them. Each game's own rules — what wins, what loses, what its clock does — are
in its doc; this is what those rules are made of, and the invariants none of
them may break.

## The three primitives

1. **The finish line** — what "done" means, and who supplies it:
   - **built-in** — the game is its own goal: the word, the grid, the board
     consumed.
   - **target** — setup picks the finish line (a rank, a percentage); without
     one the game is **open-ended** and can only end neutrally.
   - **none** — no finish line at all; playing just stops (a bag running out,
     a guess allowance spent), and that stop is neutral.
2. **The compete style** — what one player finishing means to the others:
   - **race** — **first past the post**: the first finisher ends the game on
     the spot. Ties cannot happen, because the game row's lock serializes two
     simultaneous finishes: the first commits the winner and the second finds a
     finished game.
   - **best** — everyone **plays out**: a finisher goes **locally terminal**
     while the others continue, and a ranking decides at the end. Ties break
     **quality-then-speed** (`order by <metric>, solved_at`); a game whose
     ranking deliberately has no speed component has **co-winners** instead.
3. **The reachable-end rule** ([states.md](states.md)) — what the clock means:
   *a timeout is a loss iff the game had a reachable end you didn't reach.*
   It gives the three things a timeout can do:
   - **all lose** — a finish line existed and nobody crossed it: a collective
     loss, standings ignored, however high the scores.
   - **rank the finishers** — a per-player finish line existed and some crossed
     it: they are ranked, and the players still mid-board simply didn't finish.
     The winner is "solved, and best at it", never "got furthest".
   - **rank the standings** — there was no finish line to miss, so the clock is
     just how the session stops and what each player had IS the result.

**A race's clock always all-loses**, and not by choice: a finisher ends a race,
so a race still running at timeout has no finishers, and the reachable-end rule
does the rest. A race cut short by the clock may instead rank the standings,
when the game's partial progress is a real measure of it — a deliberate
departure, recorded in that game's doc.

**A collective finish has no finishers to rank** — the bag or the deck runs out
for everyone at once. Its timeout crowns the leader when the standings at any
moment are a complete result (a count of sets taken, a score), and otherwise is
a collective loss.

## Where a coop loss comes from

Where the win comes from (the finish line) and where the loss comes from are
two separate choices. The sources of a coop defeat:

- **move budget** — every move spends it (guesses, swaps).
- **mistake budget** — only a wrong move spends it, so perfect play cannot lose.
- **sudden death** — one fatal act ends it.
- **clock only** — nothing to exhaust; the only way to lose is running out of
  time. A game whose board cannot dead-end has only this.
- **refundable budget** — a cap that blocks play but that undo refunds, so it
  can never kill.

A game with no finish line (`none`) can be moved to **target** with an opt-in
setup knob, and the timeout-becomes-a-loss rule comes with it. Where the game
also has a bounded session, reaching the session's end below the target then
becomes a loss rather than a neutral stop — a bigger change than arming the
clock, and one to make knowingly.

## The invariants

**No survival wins.** Outliving never wins. All-conceded and all-eliminated
are **collective losses** everywhere, and a last player standing must still
finish. If surviving crowned you, conceding would hand out wins. This is the
rule a newly ported game is most likely to break by accident.

**Refusing to lose is out of scope** (ruled 2026-08-07). In a best-style game a
trailing player could stall forever rather than be ranked. A site for strangers
would defend against that; this one does not — the trust model (CLAUDE.md:
friends, not strangers) answers it. **Don't propose anti-stall machinery.** The
remedy is opt-in: play with a timer, whose clock ranks the finishers, and End
is the social way out of a timerless standoff.

**A hint in compete must be priced.** A hint is what a game hands a stuck
player — a nudge, a reveal, a check, an AI suggestion — and in compete it must
be one of:

- **banned** in compete;
- **earned** by play;
- **scored** into the ranking, which suits a best-style game (one more ranking
  component) and not a race;
- free only when **self-informative** — it can tell you you're wrong, never hand
  you progress.

A free hint that hands over progress in a race is the one indefensible case:
asking and then using the answer becomes a legal shortcut to the win.

## Clock fairness

The shared game clock is fair exactly when play is **simultaneous**: wall time
is every player's thinking time equally. In **turn-based compete** it is not —
a rival's deliberation spends your time, and a slow opponent can lose the game
for both of you. In turn-based coop the shared clock is right: a shared fate is
the point of coop.

The turn-based-compete answer is a **player clock** (a chess clock): each
player's own budget, spent only on their own turns. **Flag fall is an automatic
concede** — never chess's "flag falls, the opponent wins", which would be a
survival win. As a concede it composes with everything already here: the
survivor plays on and must still finish, and all flags fallen is all conceded,
a collective loss. It is real work — today's timer is one game-level count, and
a player clock needs per-player accounting and server-side flag-fall
detection.

## Ideas, not built

- **`setup.compete_style: 'race' | 'best'`** — an opt-in style in setup, the
  shape of coop's `coop_style: 'turns'`, validated by `create_game` and branched
  at the terminal transition; not a new gametype. boggle already does this
  implicitly: a target makes it a race with an all-lose clock, and no target
  makes it a best game whose clock is the finish line. A game needs a
  per-player finish for "best" to rank anything, and something slower than a
  typing contest for "race" to mean anything.
- **Standings on a collective loss** — keep an all-lose verdict a loss, but
  attach who was ahead ("Lost (out of time) · closest: melissa 4/6") rather than
  crowning anyone. Weighed against crowning the closest and preferred: "closest"
  is ill-defined in most built-in-finish games, and crowning a collective
  failure muddies won and lost. The carriers exist (per-player `result`, the
  terminal reveals); the work is each game's choice of standings metric.

## Vocabulary

Prefer these in docs, comments, identifiers and setup keys.

| term | meaning |
|---|---|
| **finish (line)** | what "done" is for one player or team; **built-in**, **target** (setup-chosen), or **none** |
| **open-ended** | a target-capable game played without a target — it can only end neutrally |
| **race** / **best** | the two compete styles: the first finisher ends it, or everyone plays out and a ranking decides |
| **first past the post** | the race mechanism — an instant end, serialized by the lock, so no ties |
| **play out** | the best-style property: the game waits for every player |
| **locally terminal** | a finished player's state while others play on; `common.game_players.locally_terminal` ([common.md](common.md)) |
| **standings** | partial progress read as a ranking |
| **all lose** / **rank the finishers** / **rank the standings** | the three things a timeout can do |
| **the reachable-end rule** | a timeout is a loss iff an end was reachable and unreached ([states.md](states.md)) |
| **collective loss** | everyone loses together — `lost` / `lost_compete`, no winner |
| **collective finish** | a finish nobody reaches alone: the bag or the deck running out for everyone |
| **no survival wins** | outliving never wins; conceding or elimination can't crown anyone |
| **move budget** / **mistake budget** / **sudden death** / **clock only** / **refundable budget** | where a coop loss comes from |
| **quality-then-speed** | best's tiebreak ordering (`<metric>, solved_at`) |
| **co-winners** | a shared win: a ranking exhausted with players still level, or one with no tiebreak at all |
| **comparator** | a lexicographic ranking — later components matter only on an exact tie |
| **composite score** | a weighted blend of ranking components into one number that IS the ranking |
| **shared clock** / **player clock** | the one game-level countdown / a per-player budget spent on your own turns |
| **flag fall** | a player clock running out — an automatic **concede**, never a crowning |
| **standings on a loss** | a collective loss that records who was ahead, without adjudicating |
| **hint** | what a game hands a stuck player: a nudge, a reveal, a check, an AI suggestion. **Never "help"** — help is the text explaining a form field, the rules of a game, or what an AI does (Joel, 2026-09-17) |
| **priced hint** | the compete rule: banned, earned, scored, or free only if self-informative |
| **refusing to lose** | stalling a best game to avoid the ranking — out of scope, never defended against |
