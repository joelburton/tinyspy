# club — todo

## Bugs

- **A first-load roster read that fails leaves `members` at `[]` for the life
  of the page.** `useClubRoster` deliberately leaves `members` alone rather
  than emptying it when a read fails, which is right for a refetch — but on the
  FIRST load "alone" is the empty initial value, and nothing retries. Every
  consumer then renders its no-member fallback permanently: chat attributes no
  message to anyone, and every identity disc is neutral. Found from the
  `members` side, where those fallbacks live; the fix belongs here, with the
  hook.

## Soon

- **The `=` solo-handle convention is still tested in the FE** — `modeSuffix`
  in `SetupGameModal.tsx`. `common.clubs.is_solo` (a generated column) carries
  it, and the homepage reads that instead. Joel: *"fine for now, but we should
  get '=' stuff out of FE when we get to them."* `ClubPage`'s `soloClub` was
  the other one; it reads `is_solo` off `get_club_page`'s payload now. The two
  SQL sites (`common.sql`, the setgame migration) write `like '=%'` and can
  take the column too.
- **The viewport-fit chain has no vocabulary.** `min-height: 0` does TWO jobs
  in the app: the chain (the **bound** — `max-height` on a centered card or
  `height` on a full-bleed page; the **relay** — a flex column carrying it
  down; the **scroller**), and a flex/grid item allowed to shrink below its
  content, which is board geometry. The relay still has no good name.

## Someday

## Maybe
