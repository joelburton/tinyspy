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

- **`<StartGameButtons>` no longer exists and is still named in nine places.**
  The row of per-gametype Start buttons became a `<SelectionList>` of
  `<StartGameRow>`s, and the predicate it used to evaluate for the paint moved
  into ClubPage. Left behind: two comments in `ClubPage.tsx` (402, 1099), one
  in `ModeFilter.tsx` (47), and six doc mentions — `docs/naming.md` (its own
  row in the component table), `docs/ui.md` (the shared-components list, the
  mode-badge "where it shows", the click-target list), `docs/code-conventions
  .md` (the shared list) and `docs/deferred.md` (which also carries the
  pre-reorg path `common/components/club/StartGameButtons.module.css`). The
  docs rows are the ones that matter — a reader looking for the component
  finds nothing. `GameLogo.module.css` names it too; that one belongs to the
  logo's own comment rewrite.
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
- The club page's filters render TWICE, desktop and mobile, each hidden in
  the other mode. A markup decision before a CSS one.
- The two-column fold: `.columns` stacks at `--mobile` and `data-tab` hides
  one side. GamePage answers the same question with the info sheet.

## Someday

- `ClubPage.tsx` builds its own `{ text, diagnostics }` pair and renders
  `<ErrorPage>` from it. `EnvelopeErrorPage` derives both from the envelope the
  hook already has — see `error-page/doc.md`. Whether the club hook keeps its
  pair is this folder's decision, with its files open.

## Maybe
