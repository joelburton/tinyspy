# Area: strands

**Brand: PaulPath.** The codename is what the code says everywhere; the
brand appears in the manifest's `BRAND` and nowhere else.

One of the sixteen game areas. The process is [app-audit.md](../app-audit.md)
§4; the plan holds the order, this file holds the reading. Owed work lives in
`src/strands/todo.md`, not here.

**Status: NOT OPENED.**

**Two passes, back to back**: the audit — React, SQL and CSS together — then
the tile-feedback pass against [tile-feedback.md](../tile-feedback.md).

## The roster

*(agreed with Joel when the area opens — `src/strands/`, its two SQL files,
and `docs/games/strands.md`. List the files and STOP)*

## Findings

*(`F-strands-1 · slug · title`, one heading each; a status prefix when it
has one, no prefix means OPEN)*

### F-strands-1 · `unread-view` · `club_game_status` has no reader, and its comment says New game is one

Found from the connections area, 2026-09-19, when connections' twin view was
dropped for having no reader (F-connections-6). strands copied the shape, and
the same two things are true of it: **nothing reads it** — not `src/`, not the
schema's own SQL, not its pgTAP — and its comment claims "New game reads it to
advance to the next UNPLAYED date", which `strands.next_puzzle_for_club`
plainly does not: it answers from `strands.puzzles` joined to
`common.game_players`, and never names the view.

The false sentence was fixed on the spot (it also pointed at connections'
deleted view "for the full rationale"), and the comment now says the view is
unread and names this finding. What is left is the decision: *drop it* — a
tombstone `drop view if exists` in the repeatable file, the pattern
`psychicnum.sql` and `letterboxed.sql` already use, which is what connections
did — or *keep it* as a club-history read a future surface might want, with
the comment saying that is the reason.

## Notes

*(things worth remembering about this area that are neither a finding nor
owed work — a forward-fix made from another area, a question for the opening,
a dependency listed and left. Anything durable goes to `todo.md` or
`docs/games/strands.md` instead; a note here never stands in for either)*

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] `docs/games/strands.md` reconciled with `todo.md`: its Deferred
      section moved into the todo, or deliberately kept as the standing register
- [ ] the tile-feedback pass done, and the game's tf level updated there
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
