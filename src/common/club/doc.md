# club

The club room and everything shown on it: the page, the game cards and rows, the filters, and the dialogs that create and edit a club. The page binds `act-back-to-home`, `act-help`, `act-edit-club` and `act-rename-club`.

## Details

- **Each filter is in the tree twice, and cannot be once** — why is in
  [docs/mobile.md](../../../docs/mobile.md) → "Club page — tabs instead of two
  columns", with the rest of this page's mobile shape. What that section does
  not say, because it is about the markup rather than the alternative: one
  instance placed by a `useIsMobile` hook would state the mobile threshold
  twice, in a media query and in JS, and those two reads can disagree across a
  resize. A duplicated STATELESS control has nothing to disagree about. The
  cost the duplication does carry is real DOM, which is why
  `club-filters.e2e.ts` scopes every locator.
