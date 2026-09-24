# club — todo

## Bugs

## Soon

- **The `=` solo-handle convention is still written in two SQL sites** —
  `common.sql` and the setgame migration say `like '=%'` where
  `common.clubs.is_solo` (a generated column over the same prefix) would do.
  The FE no longer tests the prefix anywhere: `ClubPage` reads `is_solo` off
  `get_club_page`'s payload and passes it down, `SetupGameModal` takes it as
  `soloClub`. Joel: *"fine for now, but we should get '=' stuff out of FE when
  we get to them."*
- **The viewport-fit chain has no vocabulary.** `min-height: 0` does TWO jobs
  in the app: the chain (the **bound** — `max-height` on a centered card or
  `height` on a full-bleed page; the **relay** — a flex column carrying it
  down; the **scroller**), and a flex/grid item allowed to shrink below its
  content, which is board geometry. The relay still has no good name.

## Someday

## Maybe

- **The brand-then-coop-first tiebreak is spelled out twice** — `ClubPage`'s
  start list and `EditClubModal`'s enrollment list each sort the registry with
  the same two-clause comparator. A shared `byBrandThenMode` is where that goes
  if a third caller appears; for two, a file is more than the duplication.

## Won't do

- **Adding a newly registered gametype to every existing club automatically.**
  A club gets it through the Edit club dialog, or through a backfill in that
  game's own migration. Neither is common enough to need a standing mechanism.
