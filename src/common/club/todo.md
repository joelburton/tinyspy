# club — todo

## Bugs

## Soon

- **The viewport-fit chain has no vocabulary.** `min-height: 0` does TWO jobs
  in the app: the chain (the **bound** — `max-height` on a centered card or
  `height` on a full-bleed page; the **relay** — a flex column carrying it
  down; the **scroller**), and a flex/grid item allowed to shrink below its
  content, which is board geometry. The relay still has no good name.

## Someday

- **`common.games.last_opened_at`, and whether the club list sorts by it.**
  Stamped when a game becomes the club's current view (`is_current_view`
  flipping false → true in `set_current_view`: opening it from the club
  page, starting it, a refresh by its only viewer; not a reconnect). Today
  the list sorts and dates by `status_changed_at`, so a game only opened
  stays where it was.

## Maybe

- **The brand-then-coop-first tiebreak is spelled out twice** — `ClubPage`'s
  start list and `EditClubModal`'s enrollment list each sort the registry with
  the same two-clause comparator. A shared `byBrandThenMode` is where that goes
  if a third caller appears; for two, a file is more than the duplication.

## Won't do

- **Adding a newly registered gametype to every existing club automatically.**
  A club gets it through the Edit club dialog, or through a backfill in that
  game's own migration. Neither is common enough to need a standing mechanism.
