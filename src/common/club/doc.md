# club

The club room and everything shown on it: the page, the game cards and rows, the filters, and the dialogs that create and edit a club. The page binds `act-back-to-home`, `act-help`, `act-edit-club` and `act-rename-club`.

## Details

- **Each filter is in the tree twice, and cannot be once.** On desktop a
  filter sits in its column's heading row; on mobile those headings are gone —
  the tab bar names the view — so the filter for the showing tab goes directly
  under the tabs, where the heading would have been. The desktop home is
  inside a column and the mobile one is a sibling of the tab bar, and no CSS
  relocates an element across containers, so one instance placed by CSS is not
  available. The alternative, one instance placed by a `useIsMobile` hook,
  would state the mobile threshold twice — in a media query and in JS — and
  those two reads can disagree across a resize (`mobile/doc.md`). A duplicated
  stateless control cannot be wrong: all the state is `ClubPage`'s, so the two
  instances have nothing to disagree about. The cost it does carry is that the
  hidden copy is real DOM, which is why `club-filters.e2e.ts` scopes every
  locator.
