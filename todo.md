# app-wide — todo

**Almost every todo belongs in a folder, not here.** Put it in the `todo.md`
of the folder you would edit to do the work — `src/common/<folder>/`,
`src/shared/<folder>/` or `src/<game>/` — where it sits next to the code and
gets read when that area opens. This file is only for work that no single
folder owns: a change across the whole app, or a question about the app as a
whole.

The five sections are the same as every folder's: Bugs · Soon · Someday ·
Maybe are a ramp of certainty, and Won't do is not a queue — it records a
decision against, so a review doesn't propose it again
([docs/common-folders.md](docs/common-folders.md#every-folder-carries-a-docmd-and-a-todomd)).

## Bugs

## Soon

- **Two mobile behaviors need a check on a real phone; headless Playwright
  reproduces neither.** `viewport-fit=cover` stops the browser letterboxing, so
  every full-bleed surface has to clear the notch and the home indicator itself,
  and only FloatingPanel's sheet reads `env(safe-area-inset-*)`: check the game
  header, club page, toasts and celebration dialog on a notched phone.
  `touch-action: manipulation` on the tap-heavy boards is meant to stop iOS
  double-tap zoom and the tap delay: confirm on iOS that rapid taps don't zoom.

## Someday

- **The guards' comment strippers can blank real code.** Several guards strip
  `/* … */` by regex, so a `/*` inside a string literal (a glob like
  `'themes/*.css'`) hides everything up to the next `*/`, and a scanning guard
  passes while a violation ships. Nothing a guard checks is hidden today. Fix
  them all at once with `ts.createScanner` (`typescript` is already a
  devDependency), or not at all: fixing one leaves strippers that disagree.
- **Sweep `cell` vs `tile` to the rule in `docs/naming.md`.** A cell is an
  empty spot on the board to fill; a tile is a letter in a grid. Most games mix
  the two, often in one file. One sweep rather than per-game work; CSS classes
  that name what is drawn are exempt. setgame's `card` → `tile` rename is filed
  with setgame, and needs a forward migration.

## Maybe

- **A dictionary of the repo's words: what each means, and what it must never
  mean.** Split `docs/naming.md`: its lexicon, canonical names and watch list
  become a one-table dictionary, one line per word plus a pointer to the doc
  that owns it, and the naming advice stays. The "never for" column is the
  point, filled only where two meanings have actually clashed. A possible
  guard: an identifier matching a reserved word may appear only in that word's
  allowed folders.
- **Stats, leaderboards and achievements across games.** Nothing is built: no
  `common` table, no RPC, no screen. Solo clubs are meant to anchor per-user
  stats, with each game writing through one `common` RPC. Nobody has asked yet,
  so the shape would be guesswork — which stats, per club or overall, computed
  live or written at `end_game`. Wait for a concrete want. Within a club this
  fits the audience; rankings among strangers don't.
- **A guard that a capitalized stylesheet is imported only by its component.**
  An import of `Foo.module.css` from anything but `Foo.tsx` / `Foo.test.tsx`
  would fail; lowercase sheets are shared and exempt
  ([code-conventions.md → CSS](docs/code-conventions.md#css)). Siblings in one
  folder read a component's sheet today (letterboxed's components read
  `PlayArea.module.css`), so the guard either exempts the same folder or those
  imports move first.
- **Declare the board slots in one place.** Shared sheets read custom
  properties only a game declares: the tile sizing `playArea.module.css` reads,
  the bee board's units, the rank ladder's text and gap. A slot nobody fills
  voids the declaration that reads it, silently. Give each family a declared
  default block beside its reader, as `--local-feedback-min-height` has in
  `base.css`, so a game filling one sees the whole set. (A per-mount guard was
  ruled out: see `common/game-page/todo.md` → Won't do.)
- **Rename each game's `theme.css` to `brand.css`?** Most of those files hold
  nothing but brand tokens, and the name would make any line that isn't brand
  stand out. Against it: per-game file names are role names (`manifest.ts`,
  `logo.svg`), and `docs/tokens.md` documents `theme.css`. If the name stays,
  say so where the file layout is described.

## Won't do
