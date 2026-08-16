# Win & lose: the finish/defeat taxonomy

How every game decides winning and losing, in both modes — the analysis behind
the (proposed, not yet built) idea of letting friends pick between "race" and
"best" compete play. Everything in the tables describes the roster **as it is
today**, verified against [game-status-labels.md](game-status-labels.md) (the
generated ground truth) and the terminal SQL; the one forward-looking item is
the `compete_style` knob, marked as proposed where it appears.

This doc also fixes the **vocabulary** for talking about all of this — in
conversation, in docs, and in codeful places (setup keys, function names,
comments). Terms defined here are the canonical ones; see the table at the end.

## The three primitives

Almost everything below derives from three ideas:

1. **The finish line** — what "done" means, and who supplies it:
   - **built-in** — the game is its own goal (wordle: the word; crosswords:
     the grid; strands: the consumed board).
   - **target** — setup picks the finish line (`target_rank`, `win_percent`);
     without it the game is **open-ended** and can only end neutrally.
   - **none** — no finish line exists at all; playing just stops
     (scrabble coop's bag, wordiply coop's five guesses).
2. **The compete style** — what one player finishing means to the race:
   - **race** — **first past the post**: the first finisher ends the game on
     the spot. Ties are structurally impossible (the games-row lock
     serializes simultaneous finishes: the first commits the winner, the
     second finds a finished game).
   - **best** — everyone **plays out**: a finisher goes *locally terminal*
     ([playarea.md](playarea.md)) while the others continue, and a ranking
     decides at the end. Tiebreaks are **quality-then-speed** everywhere
     (`order by <metric> asc, solved_at asc`); wordiply's comparator alone
     falls through to **co-winners**.
3. **The reachable-end rule** ([states.md](states.md)) — what the clock means:
   *timeout is a loss iff the game had a reachable end you didn't reach.*
   The three observable timeout behaviors all follow from it:
   - **all lose** — a finish line existed, nobody crossed it → collective
     loss, standings ignored (boggle-with-target is the purest ruling:
     "nobody wins, however high the score").
   - **rank the finishers** — a *per-player* finish line existed and some
     crossed it → they get ranked; the mid-board players simply didn't
     finish ("the winner is still 'solved, on the fewest hints', never 'got
     furthest'" — strands' timeout comment).
   - **rank the standings** — no finish line to have missed → the clock is
     just how the session stops, and what you had *is* the result
     (boggle-without-target's top scorer).

## The grid: every game+mode at a glance

One row per playable game+mode, win and loss conditions spelled out — the
holistic read; the sections after it carry the analysis. Two omissions to
keep the rows sharp: **manual End** (neutral `ended`, available everywhere)
is neither a win nor a loss, and **every compete row also loses on
all-conceded** (collective loss, roster-wide) — both left off rather than
repeated fourteen times.

| game | win | loss |
|---|---|---|
| codenamesduet (coop) | find all 15 agents | hit the assassin OR out of turns OR out of time |
| psychicnum-coop | find all 3 secrets | out of guesses OR out of time |
| connections-coop | all 4 groups | 4 mistakes OR out of time |
| waffle-coop | solve within the swap budget | out of swaps OR out of time |
| wordle-coop | guess the word within 6 | out of guesses OR out of time |
| stackdown-coop | clear the stack | out of time (only — play can't dead-end) |
| crosswords-coop | complete the grid | out of time (only) |
| strands-coop | consume the board | out of time (only — nothing to exhaust) |
| letterboxed-coop | cover the 12 within the cap | out of time (only — the cap blocks, undo refunds) |
| spellingbee-coop | reach the target rank OR no-win if no target | time expires with the target unmet OR no-loss if no target |
| wordwheel-coop | reach the target rank OR no-win if no target | time expires with the target unmet OR no-loss if no target |
| boggle-coop | reach the target % OR no-win if no target | time expires with the target unmet OR no-loss if no target |
| scrabble-coop | no-win (bag-out is a neutral end) | out of time (only) |
| wordiply-coop | no-win (guesses spent is a neutral end) | out of time (only) |
| psychicnum-compete | first to find their own 3 secrets | every budget spent with nobody done OR out of time |
| connections-compete | first to all 4 groups | everyone eliminated at 4 mistakes OR out of time |
| bananagrams | first out (peel a dry bunch, all tiles placed) | out of time |
| stackdown-compete | first to clear | out of time |
| crosswords-compete | first correct grid | out of time (no natural loss — reveal is banned, dropping out is concede) |
| spellingbee-compete | first to the target rank (target required) | time expires with nobody at the target |
| wordwheel-compete | first to the target rank (target required) | time expires with nobody at the target |
| boggle-compete | first to the target % OR (no target) top scorer at the whistle | time expires with nobody at the target OR (no target) no-loss — the whistle always crowns |
| letterboxed-compete | first to cover the 12; at the whistle, most letters covered (→ fewest words → co-winners) | no-loss except all-conceded — the whistle adjudicates |
| waffle-compete | fewest swaps among solvers (everyone plays out; the whistle ranks solvers too) | nobody solves — budgets spent or time up with zero solvers |
| wordle-compete | fewest guesses among solvers (everyone plays out) | nobody solves — budgets spent or time up with zero solvers |
| strands-compete | fewest hints among solvers, earliest solve breaking ties | time up with zero solvers |
| wordiply-compete | best comparator once everyone's done (length% → letters → earlier → co-winners) | nobody scores a valid word — guesses spent or time up |
| scrabble-compete | highest score at the natural end (bag out) | out of time — all lose, standings ignored |
| setgame-coop | clear the deck — no sets left to find | out of time (only) |
| setgame-compete | the most sets when the deck runs dry; a tie is a tie (co-winners) | out of time with nobody having scored |

## Coop

Two independent axes: where the **win** comes from, and where the **loss**
comes from.

| game | finish | defeat sources |
|---|---|---|
| codenamesduet | built-in — 15 agents | turn budget + **sudden death** (the assassin) + clock |
| psychicnum | built-in — 3 secrets | move budget (size configurable) + clock |
| connections | built-in — 4 groups | **mistake budget** (4; only wrong guesses spend it — perfect play cannot lose) + clock |
| waffle | built-in — solve the board | move budget (swaps; margin configurable via `extra_swaps`) + clock |
| wordle | built-in — the word | move budget (6 guesses) + clock |
| stackdown | built-in — clear the stack | clock only (the no-trap board invariant means play can't dead-end) |
| crosswords | built-in — complete the grid | clock only |
| strands | built-in — consume the board | clock only (hints are *earned*, guesses unlimited — nothing to exhaust) |
| letterboxed | built-in — cover the 12 | clock only — the chain cap is a **refundable budget**: it blocks, but undo refunds it, so it can never kill |
| spellingbee | **target** (rank) or open-ended | clock only; timeout is a loss iff a target was set |
| wordwheel | **target** (rank) or open-ended | clock only; same rule |
| boggle | **target** (%) or open-ended | clock only; same rule |
| scrabble | **none** — bag-out is a neutral session end | clock only (loss-able but never win-able) |
| wordiply | **none** — guesses spent is a neutral session end | clock only (same shape as scrabble) |
| setgame | built-in — clear the deck (no sets left to find) | clock only (nothing to exhaust; the deal rule means play can't dead-end) |

Defeat-source vocabulary, in full: **move budget** (every move spends it),
**mistake budget** (only errors spend it), **sudden death** (one fatal act),
**clock only**, and letterboxed's **refundable budget** (a cap that can't
kill). codenamesduet is the roster's only triple-threat, and connections'
mistake budget and the assassin are the only two exotic loss shapes sixteen
games have ever needed.

The `none` row is also the migration path: "invent a goal for wordiply" isn't
a new category, it's moving a game into the **target** row with an opt-in
setup knob — machinery spellingbee/wordwheel/boggle already establish
(including timeout-becomes-a-loss when the target is set).

## Compete

Two axes again — the **style** and the **finish** — with the clock behavior
*derived* from them via the reachable-end rule (one recorded deviation).

| game | style | finish | on timeout |
|---|---|---|---|
| psychicnum | race — own 3 secrets first | built-in | all lose |
| connections | race — 4 groups first | built-in | all lose |
| bananagrams | race — first out | built-in | all lose |
| stackdown | race — first clear | built-in | all lose |
| crosswords | race — first correct grid | built-in | all lose |
| spellingbee | race — first to the target | **target** | all lose |
| wordwheel | race — first to the target | **target** | all lose |
| boggle (target set) | race — first to the target | **target** | all lose |
| letterboxed | race — first coverage | built-in | ⚠ **rank the standings** (most letters covered) — the roster's one deviation, deliberate: "timeout resolves on coverage" |
| waffle | best — fewest swaps | built-in (per-player solve) | rank the finishers |
| wordle | best — fewest guesses | built-in (per-player solve) | rank the finishers |
| strands | best — fewest hints (earliest solve breaks ties) | built-in (per-player solve) | rank the finishers |
| wordiply | best — the comparator (length score → letters → earlier-if-timed → co-winners) | none (a bounded per-player session) | rank the standings |
| boggle (no target) | best — highest score | none | rank the standings (the clock *is* the finish line) |
| scrabble | best — highest score at the natural end | built-in but **collective** (the bag, not a per-player solve) | all lose — with no per-player finish there are no finishers to rank |
| setgame | best — most sets, **no speed tiebreak** (ties → co-winners) | built-in but **collective** (the deck, not a per-player solve) | ⚠ **rank the standings** — the second deviation, see below |
| *(any)* | **survival** | — | **EMPTY — see the invariant below** |

Why race games' clocks all-lose isn't a choice per game — it's forced: in
race style a finisher *ends the game*, so a running game at timeout by
definition has zero finishers, and the reachable-end rule does the rest.
Race games also never need tiebreakers (first past the post can't tie);
the "quality metric as tiebreak" idea only enters a race when the clock cuts
it short, which is exactly letterboxed's deviation.

**setgame's timeout is the roster's second deviation**, and it sits in the same
row as scrabble's while ruling the opposite way. Both have a collective finish
(the bag; the deck), so neither has finishers to rank — but scrabble voids the
game and setgame crowns the leader. The difference is whether a partial result
means anything: scrabble's board mid-game is a position, not a score anyone
would accept as an outcome, whereas setgame's count of sets taken IS the
complete result at every instant. The clock there is simply how the session
stops, which is boggle-without-a-target's reasoning applied to a game that
happens to have a natural end as well. A race nobody scored in is still a
collective loss.

**The no-survival invariant.** No game awards a win for outliving. All-conceded
and all-eliminated are **collective losses** everywhere (`Lost (all conceded)`
roster-wide; connections ends all-eliminated as "nobody solved" rather than
crowning the survivor), and a last player standing must still finish. This is
deliberate and load-bearing — if surviving crowned you, conceding would hand
wins — and it's the invariant a ported game #16 could most plausibly break by
accident.

**Out of scope, ruled explicitly (2026-08-07): refusing to lose.** In a
best-style game a trailing player could simply never finish — stall until the
leader gets bored and concedes or ends. A serious-competition site defends
against this (e.g. by disallowing timerless games); we deliberately don't —
it's the temporal flavor of cheating, and the trust model (CLAUDE.md: friends,
not strangers) already answers it. **Don't propose anti-stall machinery.**
The opt-in remedy exists for any group that wants it: play with a timer —
best's clock ranks the finishers, so a staller loses to a finisher at the
whistle — and manual End is the social escape hatch for a timerless wedge
(neutral `ended`, nobody wins, which is the stall "succeeding" and is fine).

## Clock fairness: shared vs turn-based play

The shared game clock is fair exactly when play is **simultaneous** — wall
time is every player's thinking time equally, which is every compete game in
the roster except one. **scrabble compete is the roster's only turn-based
compete game**, and there the shared clock is structurally unfair: your
rival's deliberation spends *your* time, and a slow opponent can lose you
both the game ("we both lose, and that wasn't my fault").

codenamesduet has the same turn structure but is coop, where the shared
clock is *correct* — a shared fate is the point of coop, even when one
player's pace dominates. Mild frustration there is the game working.

The turn-based-compete fix is a **player clock** (chess clock): each player
gets their own configurable time budget, spent only on their own turns. The
framing that keeps it consistent with the rest of this doc: **flag fall is
an automatic concede** — NOT chess's "flag falls, opponent wins", which
would be the roster's first survival win. As a concede, everything composes
with existing machinery: the survivor plays on and still has to finish,
all-flags-fallen = all-conceded = collective loss, and the Quit-vs-Lost
verdict vocabulary already fits. (Cost note: this is real work — today's
timer is one game-level countdown anchored at `started_at`; a player clock
needs per-turn elapsed accounting and server-side flag-fall detection. The
cheap interim is for scrabble compete's setup to stop offering a countdown
at all.)

## Help in compete

**Help** is the umbrella for hints, reveals, checks and AI suggestions. The
roster's compete stances, verified against the SQL and game docs:

| game | help | in compete? | price |
|---|---|---|---|
| strands | the earned hint bar | yes — it's core | **scored**: fewest hints IS the ranking |
| crosswords | check / reveal | check yes; reveal **banned** ("reveal-all would trivially win the compete race") | check deliberately free: "wrong is self-informative, not answer-leaking" |
| letterboxed | hint / spoiler | **banned** (`hints_used` is a coop-only tally) | — |
| setgame | the hint ladder | **banned** (`record_hint` raises `hint-in-compete`; the button still renders, disabled, saying why) | — |
| psychicnum | hint / reveal | **yes, both, free** (`_unfound_secret` scopes to the compete caller) | ⚠ **un-priced** |

The principle the deliberate rows share: **help in compete must be priced** —
**banned**, **earned**, **scored** into the ranking, or free only when
**self-informative** (it can tell you you're wrong; it can't hand you
progress). Free *generative* help in a race is the one indefensible square,
and psychicnum's compete reveal sits in it: the revealed word is still
guessable, so ask-then-guess is a legal shortcut toward the win. Harmless
among friends, but it's the roster's one undecided cell — decide it, don't
inherit it. Pricing also composes with the styles: **scored** help fits
*best* games (one more ranking component); *race* games only get banned /
earned / self-informative.

## Proposed (not built)

Marked separately so the tables above stay pure current-state:

- **`setup.compete_style: 'race' | 'best'`** — the exact shape of coop's
  `coop_style: 'turns'`: an opt-in style field in setup, validated by
  `create_game`, branched at the terminal transition. Not a new gametype.
  **boggle is the existence proof**: setting `win_percent` already makes it
  a race with an all-lose clock, leaving it unset already makes it a best
  game whose clock is the finish line — the knob just names, per game, what
  boggle does implicitly via its target. Pilot candidate: waffle (both
  halves already exist in the roster — "best" is waffle today, "race" is
  crosswords' solve branch), with wordle / strands / psychicnum /
  letterboxed as natural second adopters and the rest degenerate under one
  style or the other (see the tables — a game needs a *per-player* finish
  for "best" to rank, and something slower than a typing contest for "race"
  to mean anything).
- **Standings on a collective loss** — when an all-lose timeout fires, keep
  the verdict a loss but ATTACH the standings ("Lost (out of time) ·
  closest: melissa 4/6"), rather than crowning anyone. This was weighed
  against a per-game "crown the closest at timeout" option and rejected in
  its favor: "closest" is ill-defined in most built-in-finish games (closest
  at wordle by greens? by guesses left? neither is the game's own metric),
  and crowning a collective failure muddies the won/lost vocabulary. A
  ranking shown on the loss gets the social value — who was ahead — with
  the reachable-end rule intact. Carriers exist (per-player `result` jsonb,
  terminal RLS reveals); the work is the per-game standings-metric choices.
- **The player clock** for scrabble compete (above), as flag-fall-concedes.
- **Coop targets for the two no-win rows** — wordiply gains a
  `target_score` on the composite metric below, scrabble coop a
  `target_score` on plain points. Both migrate `finish: none` → `target`:
  reaching it mid-play wins on the spot, and the clock arms per the
  reachable-end rule — the spellingbee pattern, with wordiply's metric
  doing double duty (the same composite ranks compete; build once, both
  modes consume it). ⚠ One decision these two add that boggle never faced:
  both have **bounded sessions** (five guesses; a finite bag), and with a
  target set the natural session end stops being neutral — guesses spent /
  bag out below the target is a **loss** (wordle's out-of-guesses shape),
  not `Ended · 60%`. Setting a target converts the session end into a
  pass/fail moment; that's the point of the feature, but it's a bigger
  change than arming the clock and should be implemented knowingly.
  Without a target, both rows stay exactly as today.
- **A composite score for wordiply's "best"** — the current winner is a
  lexicographic comparator (length score → letter count → …), which makes
  the letter count matter only on an exact length-score tie: in practice
  only the marquee word counts, flattening the five-guess game. The
  replacement shape: normalize letter count to 0–100 against its ceiling
  (5 × `max_word_length`), then rank on `w·length% + (1−w)·volume%` — one
  tunable weight deciding how many extra letters overall outweigh one
  letter of marquee (at `w = 0.6` on a max-16 board, ≈ a dozen). A composite
  also fixes a legibility gap the comparator can't: one number that IS the
  ranking. Co-winners survives as the exact-tie fallback; the comparator
  lives in SQL *and* the FE verdicts, so this is a two-places change with
  its tests re-pinned. (The winner is already our invention — Guardian
  Wordiply shows both stats and crowns nobody — so the metric is ours to
  own.)

## Vocabulary

The canonical terms. Prefer these in docs, comments, identifiers and setup
keys; retire ad-hoc synonyms on contact.

| term | meaning |
|---|---|
| **finish (line)** | what "done" is for one player/team; sources: **built-in**, **target** (setup-chosen), or **none** |
| **open-ended** | a target-capable game played without one — can only end neutrally |
| **race** / **best** | the two compete styles: first finisher ends it vs everyone plays out and a ranking decides (proposed setup key: `compete_style`) |
| **first past the post** | the race mechanism — instant end, lock-serialized, ties impossible |
| **play out** | best-style property: the game waits for every racer |
| **locally terminal** | a finished racer's state while others play on (existing term — [playarea.md](playarea.md)) |
| **standings** | partial progress read as a ranking |
| **all lose** / **rank the finishers** / **rank the standings** | the three timeout adjudications |
| **the reachable-end rule** | timeout is a loss iff an end was reachable and unreached ([states.md](states.md)) |
| **collective loss** | everyone loses together — `lost` / `lost_compete`, no winner |
| **no survival wins** | the invariant: outliving never wins; concede/elimination can't crown |
| **move budget** / **mistake budget** / **sudden death** / **clock only** | the coop defeat sources |
| **refundable budget** | a cap that blocks play but can't kill it (letterboxed's chain) |
| **quality-then-speed** | best's universal tiebreak ordering (`<metric> asc, solved_at asc`) |
| **co-winners** | a comparator exhausted with players still level — a shared win (wordiply); or a ranking with NO tiebreak at all, where a tie is simply a tie (setgame) |
| **shared clock** | the game-level countdown every game has today — fair only under simultaneous play |
| **player clock** | a per-player time budget spent on your own turns (chess clock) — the turn-based-compete answer; proposed, not built |
| **flag fall** | a player clock running out — ruled an automatic **concede**, never a crowning (see no survival wins) |
| **standings on a loss** | a collective loss that still records who was ahead — a ranking attached to the verdict, not an adjudication |
| **help** | the umbrella for hints, reveals, checks and AI suggestions |
| **priced help** | the compete rule: help must be **banned**, **earned**, **scored**, or free-only-if-**self-informative** — never free and generative |
| **comparator** | a lexicographic ranking (wordiply today): later components matter only on exact ties |
| **composite score** | a weighted blend of ranking components into one number that IS the ranking (proposed for wordiply) |
| **refusing to lose** | stalling a best game to avoid the ranking — explicitly out of scope; never defended against (the trust model answers it; a timer is the opt-in remedy) |
