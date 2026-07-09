# Scrabble AI — strength control & the self-play measurement harness

The move **suggester** (docs/scrabble-ai.md) always plays at full strength: it
finds every legal move and recommends the best. This doc is about the other
direction — an autonomous **AI player** that can play *worse*, at a chosen
level, in ways that feel like a weaker human rather than a lobotomised engine.
It records the strength knobs, the self-play harness that measures them, the
experiment protocol, and the running results.

Status (2026-07-08): the **harness + knobs are built and the 5-level ladder is
tuned** to an evenly-spaced mean-score ladder (N=100 results below). The UI
plumbing for an actual in-game AI opponent is deferred — the brain
(`choosePlay`) exists without it, so the harness can drive it headless.

## The design

Two pieces, both in `src/scrabble/lib/policy.ts`, kept separate from and layered
on top of the suggester engine (`suggest.ts` generation + `rank.ts` ranking):

- **`choosePlay(board, rack, trie, bands, knobs, rng)`** — pick ONE move (or an
  exchange) for a given strength level. Pure and deterministic given `rng`.
  **This is the reusable AI-player brain** — the eventual server/edge opponent
  calls exactly this; the harness calls it too. (Extract-early: the harness is
  the AI player minus the UI.)
- **`playSelfGame(trie, bands, knobs, bagSeed)`** — self-play a whole coop game
  (one shared rack, maximise total score) to completion, returning the final
  score plus diagnostics. Deterministic given `(knobs, bagSeed)`.

A **level is a bag of knob values** (`StrengthKnobs`); `LEVELS` holds the five
presets `beginner → casual → intermediate → strong → best`.

## The knobs (`StrengthKnobs`)

Three reuse the ranking levers already plumbed through `rankMoves`; two model
human *fallibility* (not *finding* the best move), which the deterministic
levers can't:

| knob | what it does | reuses |
|---|---|---|
| `vocabCap` | AI only *plays* words with difficulty ≤ cap (1..6); the game's legal dictionary is unchanged, only the AI's willingness | `rankMoves` vocabCap |
| `scoreFraction` | aim the pick at a fraction of best equity instead of the max | `rankMoves` re-aim |
| `useLeave` | include the leave heuristic; off → a greedy scorer whose rack degrades over the game | `rankMoves` useLeave |
| `bingoMissProb` | probability of "not seeing" an otherwise-best bingo and taking the best non-bingo — a *probability*, because anagramming a full rack is genuinely hard, so weak players land the occasional bingo, not zero | new |
| `equityNoise` | std-dev of Gaussian noise added to each move's equity before the final argmax — models a player who doesn't reliably *find* the best move | new |

**Why the two fallibility knobs matter:** the deterministic levers alone make a
bot that plays *systematically* (always the Nth-best word, never an obscure
one). Real weak players are *noisy* — they miss moves they'd recognise if
pointed at them. `equityNoise` + a mild `vocabCap` reads more human than any
deterministic setting.

## Measurement protocol

**Metric.** Final accumulated coop game score (sum of word scores). No
end-of-game leftover penalty (decision below) — this matches "our team scored
~X" as an external anchor. Report **mean, median, and spread (sd)**, not just
the mean; scores are right-skewed by bingos.

**Paired seeds (common random numbers) — the load-bearing method.** Every level
plays the *identical* set of bag-shuffle seeds, and levels are compared by
per-seed *differences* vs `best`. Tile luck swings a game by 100+ points;
subtracting it per seed cuts the variance enormously, so a modest N resolves
real effects. (Confirmed: at N=20, intermediate's −141 vs `best` has sdΔ≈71, so
≈9σ — decisively resolved. Comparing independent means would need far more
games.) The engine is deterministic given board+rack, and each turn's stochastic
policy RNG is derived from `bagSeed + turnIndex`, so a seed fully reproduces a
game — same seed, different level = same bag, different play.

**Secondary diagnostics (the *why*, not just the *how much*).** Per game the
harness records bingos, exchanges, turns, tiles left, the per-turn score
profile, and the **leave-value trajectory** (rack quality after each turn) —
that last one directly exposes the rack-degradation mechanism behind
`useLeave`.

**Sample size.** N≈200 for a real sweep (~2.4 min); the sweep prints `sdΔ` so we
can confirm each effect is resolved and bump N if not. (N=20 is enough for a
quick look, as above.)

**Sweep protocol.**
1. One-knob-at-a-time from the `best` baseline, to isolate each lever's effect.
2. Evaluate the candidate 5-level presets end-to-end; check the ladder is
   monotone and reasonably *spaced*.
3. Calibrate against Joel's friends' real coop scores as an external sanity
   anchor (is `best` above the group? where do the friends sit on the ladder?).

**Phase 2 (deferred).** Absolute solo score measures raw scoring power, not "how
often a human beats it." Once presets are chosen, run bot-vs-bot *compete*
matches (strong vs weak) for win-rate/margin curves that map onto player
experience. Not needed to pick the knobs.

## Decisions recorded

1. **No leftover penalty** — the metric is accumulated word score only (matches
   how the friends remember their team score).
2. **Exchange when stuck** — if there's no playable word and the bag holds ≥7
   tiles, exchange the whole rack (a scoreless turn) rather than ending; end
   only when the bag can't refill. `MAX_SCORELESS = 3` consecutive exchanges
   also ends the game (a hopeless rack, and a guard against exchange ping-pong).
3. **No *strategic* exchange (a known limitation).** Neither the suggester nor
   any level exchanges a *playable-but-bad* rack (dumping a stranded Q, a
   6-consonant leave) — exchange fires only when there is literally no legal
   play, mirroring the current suggester. Consequence: **`best` slightly
   *underestimates* true expert play**, since a strong human sometimes takes a
   zero-scoring exchange to escape a stuck rack. Withholding strategic exchange
   is arguably also part of what makes weak play weak; it's a latent future
   lever. Keep this in mind when calibrating `best` against real players.

## AI players in compete (the opponent build) — BUILT

The autonomous opponent is built on the `choosePlay` brain. Seating + turns are
seat-based (`scrabble.games.current_seat`; AI seats live only in
`scrabble.players` with `user_id` null + `ai_level`, never in
`common.game_players`/`profiles`). Shipped in 8 stages (S1–S8): seat schema +
turn/finish conversion, create_game seating + band validation, the shared
`_commit_*` cores + `ai_*` RPCs + `get_ai_context`, `scrabble-ai-move` edge
function, setup UI, FE roster/log/terminal + the move trigger, and pgTAP +
a human-vs-AI e2e. Decisions locked for that build:

- **AI is compete-only**, 0–3 seats, **one skill level for all AIs** (setup:
  count radio + a single skill selector).
- **Band rule = the level's `vocabCap`** (beginner 1, casual 2, intermediate 4,
  strong/best 6 — **strong stays 6**). The game's `dict_2` AND `dict_3plus`
  must be ≥ that band whenever an AI is present, else the AI can't play at its
  tuned strength (and, structurally, it can never play a word illegal in the
  game since it generates against the game's bands).
- **Setup validation, not auto-adjust.** Changing the AI skill does NOT silently
  move the dictionary bands — a player might not notice. Instead the setup form
  shows a validation error ("dictionary must be at least band N for a <level>
  AI") and blocks Start until the bands are raised. Only fires when `ai_count > 0`.
  The server (`create_game`) enforces the same rule as the authority.

## The harness CLI

`npm run scrabble:selfplay` → `supabase/scripts/scrabble-selfplay.ts`. Loads the
dictionary straight from `common.words` (play_word's exact universe: len 2..15,
american OR british, rated), so the harness plays by the live rules. Needs psql
+ a populated local `common.words` (`npm run words:import`).

```
npm run scrabble:selfplay -- --level best --games 200
npm run scrabble:selfplay -- --sweep --games 200            # all 5 levels, paired
npm run scrabble:selfplay -- --sweep --games 200 --offset 1000   # a fresh seed block
```

## Results log

### 2026-07-08 — tuned ladder, N=100

Tuned via the one-knob-at-a-time protocol: characterize each knob's transfer
curve (isolated), then compose per level to hit Joel's target spread
(450 / 580 / 710 / 840 / max). The transfer curves that drove it (N=40, all else
at full strength): equity noise 8→846, 16→750, 20→700, 28→597; vocabCap 1→658,
2→734, 4→847; `useLeave` off → 850; bingoMiss trades ~140 points across 0→1.

Final presets (in `LEVELS`): beginner `{band 1, no leave, miss .9, noise 30}`,
casual `{band 2, no leave, miss .4, noise 10}`, intermediate `{band 4, leave,
miss .3, noise 10}`, strong `{full, leave, miss .1, noise 8}`, best `{full,
leave, 0, 0}`.

```
        level    mean  median     sd  bingo  exch  turns  %best   Δbest    sdΔ
     beginner   450.3     447   33.7   0.03  0.18   41.6     50  -455.8   73.3
       casual   582.0     581   49.2   0.39  0.02   34.0     64  -324.1   87.0
 intermediate   719.5     716   56.4   2.02  0.00   30.1     79  -186.6   83.1
       strong   843.5     840   69.8   3.37  0.00   26.5     93   -62.6   87.4
         best   906.1     905   67.0   3.87  0.00   23.9    100     0.0    0.0
```

**Ladder:** 450 / 582 / 720 / 844 / 906 — evenly spaced (gaps ≈132 / 138 / 124 /
62), matching the target 450 / 580 / 710 / 840 / max. The strong→best gap is the
tightest because `best` is a hard optimal ceiling.
- **Beginner is truly beginner** — band-1 vocab + heavy noise → ~0.03 bingos and
  the occasional forced exchange (0.18/game) when its tiny vocabulary is stuck.
- Bingos climb smoothly with level (0.03 / 0.39 / 2.02 / 3.37 / 3.87) — the
  earlier casual↔intermediate bingo cliff is gone.
- `best` empties the bag every game (0 tiles left, ~24 turns) — an optimal
  solitaire ceiling well above any casual-human coop game, as expected.

**Still open:** calibrate against Joel's friends' real coop scores (which rung do
they sit on?), and Phase 2 bot-vs-bot compete win-rate curves once the opponent
UI exists. Retuning = re-run `npm run scrabble:selfplay -- --sweep`.

## Where this connects

- Engine reused: `generateMoves` (`suggest.ts`), `rankMoves` + `leaveValue`
  (`rank.ts`), `evaluatePlay` (`play.ts`), bag constants (`board.ts`).
- Shipped suggester architecture: docs/scrabble-ai.md (§12 of games/scrabble.md).
- The 5-level presets, once tuned, become the autonomous opponent's difficulty
  setting when the AI-player UI is built.
