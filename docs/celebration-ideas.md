# Celebration / win-terminal ideas

Brainstorm notes (2026-07-10) on generalizing waffle's new terminal treatment to
the other coop games. **Status: ideas, not a plan.** Waffle is the shipped
reference implementation; **wordle is the second adopter** (celebration +
no-GameOverModal + hide-the-word-on-loss + Replay/Reveal menu items — see
[games/wordle.md](games/wordle.md) → Terminal flow). Compete is explicitly out
of scope for now.

## The shipped prototype — waffle

Waffle's terminal flow (see [games/waffle.md](games/waffle.md) → Terminal flow,
and [ui.md → Modals for terminal results](ui.md#modals-for-terminal-results)):

- **No GameOverModal.** The lasting verdict is carried in-page: the info-column
  outcome line + the below-board terminal pill.
- **`CelebrationDialog` pops on the coop win** — via `useCelebration`, ONLY when
  `playState` flips to `'won'` mid-session (the flip lands on every connected
  client via realtime, so the group celebrates together). Opening an
  already-won game shows nothing; replay → second solve celebrates again.
- **`RestartButton`** (common purpose button: `SkipBack`, `info` tone) in the
  terminal action row, left of Back-to-Club. Same handler as the menu's
  replay-board; the confirm is skipped at terminal (nothing left to lose).
- **Golf-style win verdict**: "Par +2" / "Par!" instead of a generic "Solved!" —
  the celebration carries the *moment*, the verdict carries the *score*.

## The proposed coop-wide pattern

Split "the moment" from "the record":

- **The moment** = a flip-only dialog (celebration for wins). Now that every v3
  game carries the lasting verdict in-page, re-announcing "won"/"lost" in a
  modal on every reload is redundant. The GameOverModal tried to be both moment
  and record; this model separates them.
- **The record** = the in-page terminal UI (outcome line, pill, review mode).

The gate that works: `playState === 'won'` — synchronously available from ctx
on the first render, and coop-only by the states vocabulary (compete writes
`won_compete`). **Do NOT gate on per-game fetched data** (`game.mode` etc.):
it's null while the game hook loads, so the fetch landing fakes a mid-session
flip and pops the celebration on every mount of a won game. (Caught live by an
e2e; unit tests with synchronous mocks miss it.)

### Losses

Asymmetry is a feature: celebrate wins loudly, let losses land quietly through
the red pill. Exception worth building someday: **a dramatic loss moment where
the game authors a dramatic event** — tinyspy's assassin is *the* case (there's
a culprit, a moment, a story; waffle's out-of-swaps fizzle has none).
`useCelebration` is already tone-agnostic ("pop X on the flip"), so an assassin
reveal is the same primitive with inverted art direction: dark backdrop instead
of confetti, the assassin tile as the centerpiece, a low sting instead of the
tada jingle. Heuristic for the roster: dramatic loss dialog only when the game
produces a dramatic *event*; attrition losses stay in the pill.

## Don't reveal the solution on loss

Idea: on a loss, do NOT show the winning solution. Instead offer **Restart**
(replay the board) and/or an explicit **"Reveal board"** action.

- Under the friends-only trust model this is mostly **FE-only**: where the
  solution shield lifts at terminal, simply not *displaying* it is enough
  (devtools peeking is not a threat we defend against). "Reveal board"
  post-loss can even be FE-local — the solution is already on the client.
- **The two ideas reinforce each other**: the replay's value depends on the
  answer staying hidden. Force-reveal at loss time and replaying with a
  different opening becomes theater — you already know where the tree ends.
  Hide-on-loss protects both the emotional beat AND the replay's epistemic
  value.
- Applies to the hidden-solution games (waffle, wordle, stackdown, crosswords,
  connections' categories, tinyspy's keycard, psychicnum's number) — not to the
  word-list games where "the solution" isn't a single answer.

## Replay — three player motivations, not one

1. **The do-over** — we lost; let us finish the thing.
2. **The line-explorer** — same puzzle, different tree. Wordle: "if I had
   started with a different word, would that have made a big difference?" Not
   score-padding — a chess-post-mortem-style experiment. (Your prior guesses'
   colors carry over only in fuzzy memory, same as remembering an old line.)
3. **The optimizer** — I won, but I want to beat my swap count. Waffle has a
   literal par number; it's the golf game of the roster.

Waffle's Restart already serves all three because it shows at *any* terminal,
not just losses — keep that property when rolling out.

## Wrinkles / open questions

- **Per-game replay RPC needed.** Only waffle has `replay_board` today, but
  `common.reset_game` already exists as the common-layer half — each game's
  replay is a follow-the-waffle-pattern job, not new architecture.
- **"Same board" means something different per game.** Waffle is
  perfect-information → a genuine do-over. Wordle same-target and connections
  same-board carry partial knowledge from the failed attempt. Probably fine
  among friends, but decide same-board vs fresh-board deliberately per game.
- **Replay after a win erases the win** — `reset_game` wipes results, so the
  game sits "unwon" until re-solved; replay-then-abandon leaves it looking
  unfinished. Acceptable (the group chose it), just a known cost of par-chasing.
- **Replay wipes the previous attempt's turn log** — which is exactly the
  artifact the line-explorer would want to compare against. Keeping prior
  attempts' logs viewable is the natural someday-extension if the analysis use
  proves real; probably overkill now.
- **Terminal-row layout**: outcome + Restart + Reveal + Club is four items in a
  `nowrap` row in a ~22rem column. Three was already snug in waffle; four
  probably wraps. Needs a deliberate answer (icon-only, two rows, or fold
  Reveal elsewhere) before rollout.
- **Compete** (out of scope): the solution shield keys on `is_terminal`, and
  replay un-terminals — so replay *re-shields* automatically; the interaction
  is likely benign.
- **Docs**: when adopted, ui.md's "Modals for terminal results" essentially
  inverts — the flip-only celebration becomes the coop norm and GameOverModal
  the compete/legacy path; the waffle paragraph becomes the template.
