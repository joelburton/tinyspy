# connections — todo

## Bugs

- **`matched` on `EventRow` is now derivable.** It is `result === 'correct'`,
  and `result` joined the row on 2026-09-17 so the history viewer's three tint
  classes could key on a three-value word instead of a narrowed `Outcome`. Its
  docstring defends it as "the rule, kept separate from the look" — an argument
  against asking a COLOR about the rules, which no longer applies now that the
  fact is there to ask. Collapse it, or rewrite the docstring to say why two
  fields carry one fact.

## Soon

- **An eliminated racer still pauses the game for the survivors.** The
  presence-pause roster is the game's players minus conceders, and a fourth
  mistake eliminates without setting `conceded`, so closing an eliminated tab
  stops everyone still racing. Decide with the SQL open: either elimination
  sets `conceded` too (then `_maybe_finish_compete` and the club-list outcome
  words need re-reading, since "conceded" currently means walked away), or the
  roster rule grows a second exclusion, or the caveat is accepted and written
  as a rule in `docs/games/connections.md`.

## Someday

## Maybe

- **`useGame.ts`'s `as GameRow | undefined` is a cast standing in for a
  compiler flag.** The twin of stackdown's, where the reasoning is filed
  (`src/stackdown/todo.md`): `data[0]` types as present because
  `noUncheckedIndexedAccess` is off, so the `| undefined` is written by hand
  to give the following `if (!row)` something to narrow. Correct today.
- **"Next puzzle" should give the next date we HAVE a puzzle for, not just the
  next date** (Joel, 2026-08-25), quoted as said because it is not certain
  which behavior he means. `connections.next_puzzle_for_club` already skips
  gaps — it selects from `connections.puzzles`, so a date with no row cannot
  come back. The case he is probably describing is the OVERRIDE: type a date
  the archive lacks and the field says there is no puzzle for it and stops,
  where it could offer the next date that has one. Confirm which before
  building. Raised in the `forms` area while converting
  `<SetupNextPuzzleSection>`, and deliberately not done there.
- **Per-tile rise-and-fade animations on a category match.** A rejected guess
  shakes (the shared verdict mark); the match-resolved animation does not
  exist — the arriving band's attention flash is the nearest thing, and it is
  deliberately for the OTHER players. Pass 3 (tile-feedback) is where this is
  weighed.

## Won't do
