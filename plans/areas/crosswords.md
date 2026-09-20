# Area: crosswords

**Brand: CrossPlay.** The codename is what the code says everywhere; the
brand appears in the manifest's `BRAND` and nowhere else.

One of the sixteen game areas. The process is [app-audit.md](../app-audit.md)
§4; the plan holds the order, this file holds the reading. Owed work lives in
`src/crosswords/todo.md`, not here.

**Status: NOT OPENED.**

**Two passes, back to back**: the audit — React, SQL and CSS together — then
the tile-feedback pass against [tile-feedback.md](../tile-feedback.md).

## The roster

*(agreed with Joel when the area opens — `src/crosswords/`, its two SQL files,
and `docs/games/crosswords.md`. List the files and STOP)*

## Findings

*(`F-crosswords-1 · slug · title`, one heading each; a status prefix when it
has one, no prefix means OPEN)*

### F-crosswords-1 · `club-nyt-status-does-not-exist` · two references to a view nobody ever wrote

Found from the connections area, 2026-09-19, while checking whether its own
`club_game_status` has a reader (F-connections-6). `crosswords.club_nyt_status`
is named twice and **exists nowhere** — not in `supabase/sql/crosswords.sql`,
not in a migration, not in the local database's view list:

- `supabase/sql/crosswords.sql`, in `create_game`: "what the setup dialog's
  calendar colors by (`club_nyt_status` below)" — there is nothing below, and
  the calendar picker itself went at `53e71cc1` (2026-08-13).
- `supabase/migrations/20260813000002_crosswords_games_puzzle_date.sql`, in the
  `comment on column`: "Read by crosswords.club_nyt_status to color the setup
  calendar." **An applied migration, so it is not edited** — the comment is in
  prod's catalog, and changing it means a new migration that does
  `comment on column` again, or accepting it.

Both sentences also describe `puzzle_date` as a calendar's input when nothing
reads it that way any more. Options at this area's opening: *fix the
`crosswords.sql` comment only* and let the catalog comment stand · *fix both*,
the second through a new migration · *leave both* until `puzzle_date` itself
is re-examined.

## Notes

*(things worth remembering about this area that are neither a finding nor
owed work — a forward-fix made from another area, a question for the opening,
a dependency listed and left. Anything durable goes to `todo.md` or
`docs/games/crosswords.md` instead; a note here never stands in for either)*

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] `docs/games/crosswords.md` reconciled with `todo.md`: its Deferred
      section moved into the todo, or deliberately kept as the standing register
- [ ] the tile-feedback pass done, and the game's tf level updated there
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
