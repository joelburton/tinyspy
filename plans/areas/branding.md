# Area: branding

The folders it reads: `branding`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN (2026-09-05).** Roster stamped `cs-audited-branding`; every
file read in one sitting; findings below.

## The roster

Agreed 2026-09-05 (Joel: "i agree. read and audit.") — every source file of
`src/common/branding/`:

| file | what it is | stamp |
|---|---|---|
| `src/common/branding/GameLogo.tsx` | a game's 32px square logo, looked up from the registry by gametype string; rendered in the game header's menu trigger and in three club-list rows | `cs-audited-branding` |
| `src/common/branding/GameLogo.module.css` | `.logo` — block, 32×32, `flex-shrink: 0`, and a `color` nothing reads | `cs-audited-branding` |
| `src/common/branding/PuzpuzpuzLogo.tsx` | the app's 32px "P" mark, the menu trigger on home and the club page | `cs-audited-branding` |
| `src/common/branding/PuzpuzpuzLogo.module.css` | `.logo` — the same three declarations as GameLogo's, minus the color | `cs-audited-branding` |
| `src/common/branding/PuzpuzpuzWordmark.tsx` | the wide raster wordmark atop the login and home cards | `cs-audited-branding` |
| `src/common/branding/PuzpuzpuzWordmark.module.css` | `.wordmark` — full width, intrinsic aspect, a spacer below | `cs-audited-branding` |
| `src/common/branding/doc.md` | a one-sentence lede; Design owed | (no stamp — markdown) |
| `src/common/branding/todo.md` | empty at the open | (no stamp — markdown) |

**Decided at the opening, and why:**

- **`puzpuzpuz.svg` and `homeTitle.png` are in the folder and not on the
  roster.** An asset has nowhere to carry a stamp, and the plan reserves the
  asset pass (baked color in the 17 logos, the near-whites in the wordmark
  and favicon) for step 11 at the end. What this area CAN say about them is
  which file is the master, which is F-branding-6.
- **The 17 per-game `logo.svg` files stay out**, per the areas table. Read
  as evidence for F-branding-2 (none uses `currentColor`), not stamped.
- **Evidence, not roster:** `page-header/PageHeaderMenu.tsx` and
  `menu/Menu.tsx` (what actually wraps a logo), the four call sites in
  `club/` and `game-page/`, `home/HomePage.module.css`, `index.html` and
  `scripts/generate-icons.sh` (the favicon lineage), `docs/ui.md`.

## Findings

Recorded 2026-09-05 from one read of the six files, every claim re-checked
against the tree. Shape findings first, prose after. No prefix means OPEN.

### WORKED · F-branding-1 · `manifest-looked-up-twice` · `GameLogo` re-finds a manifest every caller already holds

`GameLogo` takes a gametype string and does
`gametypes.find((g) => g.gametype === gametype)`, with an `if (!manifest)
return null` branch. All four callers already have the manifest in hand:
`GamePage` takes it as a prop (its docstring argues exactly this — "a second
lookup here could only fail in a way the first one already ruled out");
`ClubGameCard` and `ClubGameRow` each run the same `find` a few lines above
the `<GameLogo>` they render; `StartGameRow`'s prop IS a `GameManifest`. So
the component does a lookup nobody needs and carries a null branch nothing
can reach.

**Recommendation:** take the manifest — `<GameLogo manifest={…} />` — and
drop the branch. Four call sites, each one-line. Separately and NOT this
area's: the registry lookup is hand-written in eight files
(`App.tsx`, three in `club/`, `useGameInvitations.ts`, this one); whether
`manifest` should export a `manifestFor(gametype)` is that folder's decision
with its files open, and is a line for `manifest/todo.md`.

**Resolution (2026-09-05, Joel: "1.")** — recommendation 1 taken; the four
call sites came with it, since the prop's type change breaks them at
typecheck. `GameLogo` now takes `manifest: GameManifest`, and the `find` and
the unreachable `if (!manifest) return null` are gone. `GamePage` passes the
prop it already had (it was unwrapping it to `manifest.gametype` on line 238
and having the logo resolve it back); `StartGameRow` passes its `game`.
`ClubGameCard` and `ClubGameRow` hold `GameManifest | undefined` from their
own `find`, so they were first written as `{manifest && <GameLogo …>}`. Joel
asked whether there would ever not be a manifest: no — `ClubPage.tsx:748–749`
drops an unknown gametype (`if (!manifest) continue`) before a row exists, so
that guard and the identical one their `<ModePill>` already sat under are both
unreachable. They were briefly given one `if (!manifest) return null` after
the lookup instead, rendering logo and pill unguarded with no assertion
(Joel: "just leave them unguarded (not assertion needed)") — superseded a step
later by the `ListedGame` change below, which removes the lookup itself.

Recommendations 3 and 4 NOT taken: `GamePage`'s prop docstring is untouched,
and the eight hand-written registry lookups stay a `manifest` decision.
`tsc -b` clean, eslint clean, guards 26/270 green.

**`ListedGame` went with it (2026-09-05, Joel: "drop the todo and just do
it").** The early return above was the interim; the lookup is gone from both
row components instead. `ClubPage`'s `ListedGame` copied `baseGametype` and
`brand` off the manifest, computed `statusLabel` from it, then handed the
gametype STRING down to be re-resolved — Joel: *"it includes some things on
the manifest for a gametype, but also wants to include manifest itself."* It
now carries `gameId · manifest · title · lastActiveAt · isTerminal ·
statusLabel`: the game's own fields plus the gametype it belongs to, with
`statusLabel` the exception because `labelFor(row)` is a call, not a field.
Seven sites in `ClubPage.tsx` (the type, the `listed.push`, the two "Your
games" filter reads, and three props/nav), and both row components lose their
`@/gametypes` import, their `find` and their branch — `ClubGameRow` loses
`gametype` entirely, `ClubGameCard` reads `manifest.gametype` for `gamePath`.
The fully-flattened alternative (`logoUrl` / `mode` / `aiOpponent` copied on
too, `<GameLogo>` back to loose `src`/`alt` props so "the logo's alt is the
game's name" stops being one decision) was weighed and left.

### WORKED · F-branding-2 · `dead-color-on-an-img` · `GameLogo.module.css` sets a color no logo can read, and says why in a sentence that is false

`.logo { color: var(--page-text-color) }` under a comment: "the SVG uses
`currentColor` for stroke/fill so the icon inherits the wrapping link's
color". Zero of the sixteen `src/<game>/logo.svg` files contain
`currentColor` — every one is baked color, which is what step 11's asset
pass is about — and an SVG loaded through `<img src>` cannot see the
document's CSS at all, so `currentColor` would not reach it even if a logo
used it. The declaration is dead and the comment describes an asset format
the app has never had. `PuzpuzpuzLogo.module.css` is the same rule without
the color, which is the correct one.

**Recommendation:** delete the declaration and the sentence. Nothing moves:
the property has no effect on an `<img>`.

**Resolution (2026-09-05, Joel: "do it.")** — both gone; the comment keeps its
true half (`display: block` strips the inline-image baseline gap). Counted at
the fix: 16 per-game `logo.svg` (one per live game) plus the mark, and
`currentColor` appears in NONE of them nor in `public/*.svg` — the roster note
above says "17 per-game", which is the 16 plus `puzpuzpuz.svg`.
`--page-text-color` is read in 74 files, so `cssTokens` is untroubled.
The file's other stale sentence — `flex-shrink` naming "the StartGameButtons
cards" — was deliberately LEFT for F-branding-3, which owns that rewrite.
`<StartGameButtons>`'s nine other mentions (two `ClubPage.tsx` comments, one
in `ModeFilter.tsx`, and six across `docs/naming.md`, `docs/ui.md` ×3,
`docs/code-conventions.md`, `docs/deferred.md`) went to `club/todo.md` on
Joel's ruling ("4. file it in club").

### WORKED · F-branding-3 · `logo-docstrings-describe-an-older-header` · Both logo components explain click semantics that no longer exist

`GameLogo`'s docstring: the parent "wraps this component in a `<Link>`
(terminal) or `<a>` (non-terminal with intercept)" with a suspend-confirm on
click, and "Future: this is where the 'switch to another game' dropdown will
land — Joel's design has the logo expand into a menu … Not built yet". The
menu IS built: `<PageHeaderMenu>` wraps the logo in `<Menu>`'s trigger
`<button>`, adds the chevron, and the game menu carries Back to club
(`menu/gameMenu.ts`). There is no `<Link>` and no intercept on the logo. It
also says the logo is "the leftmost element of the GamePage header" — it is
also the first thing in three club-list rows (`ClubGameCard`, `ClubGameRow`,
`StartGameRow`), which is what its stylesheet's `flex-shrink: 0` is for; that
stylesheet in turn names "the StartGameButtons cards", a component that does
not exist (the rows above do).

`PuzpuzpuzLogo`'s docstring has the same shape one step less stale: "the
click semantics (open the club menu) live on the `<Menu>` wrapper at the call
site — see ClubPage", when the wrapper is `<PageHeaderMenu>` and the home
page is a second call site.

**Recommendation:** rewrite both. What each should say: what it renders
(a 32px `<img>`), where it appears, that the click belongs to whatever wraps
it (today `<PageHeaderMenu>` on the headers, a `<Link>` row in the club
lists), and the one real design constraint the two share — they render the
same bare 32×32 image so the two menu triggers are interchangeable.

**Resolution (2026-09-05, Joel: "do all")** — both docstrings rewritten to
that shape, F-branding-7's sentence folded into the second (see there), and
the stylesheet's `flex-shrink` comment now names the club's game rows instead
of `StartGameButtons`. Re-verified while writing: `<PageHeaderMenu>` is the
wrapper at all three headers and supplies the chevron (`PageHeaderMenu.tsx`
→ `<Menu>`); the three-branch leave-the-game logic is `requestBackToClub`
(`GamePage.tsx:419–424`) reached from the menu's **Back to club** row
(`gameMenu.ts:109–112`), not from any click on a logo; `<PuzpuzpuzLogo>` has
TWO call sites, `ClubPage.tsx:943` ("Club menu") and `HomePage.tsx:172`
("Main menu"). The "Future: the logo expands into a menu" paragraph is gone —
that menu is what wraps it.

### WORKED · F-branding-4 · `32px-in-six-places` · The logo's size is a number written six times and a contract derived from it by hand

`32px` is written as CSS width and height in both logo stylesheets, as
`width={32} height={32}` attributes in both components, and the header's
height contract — `--pageHeader-height: 2.5rem` — is explained in `base.css`
and `PageHeader.tsx` as "a 32px logo plus 0.25rem of padding each side".
Each logo stylesheet says it is "sized to match" the other. So one number,
chosen once, is kept in step by two comments and a sentence.

The attributes are not the CSS's twin: they are the intrinsic-size hint a
browser uses to reserve the box before the image loads, which is layout
stability (docs/ui.md → Layout stability) and stays whatever else changes.

**Recommendation, Joel's call:** (a) one token the two stylesheets read
and the header contract composes from — `--pageHeader-height: calc(<the
logo size> + 2 * 0.25rem)` — so the arithmetic stops being prose; or (b)
leave the number, and have each stylesheet's comment point at the contract
rather than at the other stylesheet. (a) is the shape `--game-header-bottom`
already takes for the same reason.

**Resolution (2026-09-05, Joel: "a")** — `--logo-size: 32px` added to
`base.css`'s `:root` beside the header tokens (the file's naming convention
exactly: `--iconButton-size`, `--floatingPanel-titlebar-height`), read by both
logo stylesheets, and `--pageHeader-height` is now
`calc(var(--logo-size) + 2 * 0.25rem)` — the same 40px it was written as.
Both stylesheet comments now name the shared edge and the composition instead
of pointing at each other.

Three things the fix could NOT reach, each recorded where it belongs:
the `width={32} height={32}` ATTRIBUTES stay literal because no variable
reaches an HTML attribute, and the new token's comment says why that is
correct rather than a compromise (they are the intrinsic-size hint, which is
layout stability); the `0.25rem` is `Menu.module.css:39`'s trigger padding
with no token of its own, so that term is still two files agreeing, and the
token's comment says so; and `PageHeader.tsx:32–34`'s "arithmetic nobody had
written down" is past-tense archaeology already owed to `page-header`, so it
was left alone — it is still true as history.

**`base.css` moved after `corecss`'s closing re-read**, which is paused
awaiting Joel's blessing. The new token carries a `/* @@ */` marker like every
other, so it is in the unblessed state by construction; base.css's marker
count goes 85 → 86.

### WORKED · F-branding-5 · `wordmark-margin-is-spacer-1` · The one vocabulary literal in the folder

`PuzpuzpuzWordmark.module.css`: `margin: 0 auto 1.5rem`. `1.5rem` is
`--spacer-1` exactly, so it converts silently under §5 and its `pending` row
comes off `guards/vocabularies.test.ts`. Done at the audit; nothing moves.

### CLOSED, NO CHANGE · F-branding-6 · `one-mark-two-masters` · The "P" mark is two byte-identical files, and each is documented as the source

`src/common/branding/puzpuzpuz.svg` and `public/favicon.svg` are identical
(`cmp` says so). `PuzpuzpuzLogo.tsx` says "source SVG is at
`src/common/branding/puzpuzpuz.svg`"; `scripts/generate-icons.sh` says
`public/favicon.svg` is "the single source of truth for the mark" and builds
every touch icon from it. Two masters agree today by nobody having edited
either; the day one is retouched, the header and the home-screen icon
diverge with no test to say so.

**Recommendation, Joel's call:** one file. The two workable shapes: the
component imports `public/favicon.svg`'s bytes is not one of them (a
`public/` asset is served by path, unhashed, and is not on the module
graph), so either the script reads the branding copy, or the branding copy
goes and the component points at `/favicon.svg` by URL and accepts an
unhashed asset. The first keeps the app's asset hashing and moves one line
in the script. Step 11's asset pass then has one file to touch.

**Resolution (2026-09-05, Joel: "no, keep both. no guard needed.")** — closed
with no change. Two corrections to that recommendation, found re-verifying it:
"the script reads the branding copy" does NOT dedupe, because `index.html:5`
and `manifest.webmanifest:29` both name `/favicon.svg` and the webmanifest is
static JSON Vite cannot rewrite; and the two copies want different DELIVERY,
which is why one file cannot serve both — `public/_headers` puts everything
outside `/assets/` on `max-age=0, must-revalidate` (its comment says "plus
favicon"), while the component's `?url` import lands in `/assets/` as
`immutable`, so a single file would make the app's header mark revalidate on
every page load. Half the documented conflict is already gone: F-branding-3
left the component saying where it imports FROM, not that it is the source.

### WORKED (with F-branding-3) · F-branding-7 · `rounded-square-is-painted-corners` · The mark's docstring describes a shape the SVG does not have

`PuzpuzpuzLogo.tsx`: "a white 'P' on its own rounded indigo square". The
SVG's ground is a plain square path (`M0 0 … 1254 1254 … Z`, four straight
sides) and the rounding is a separate near-white path (`#FAFAFC`) painted
OVER the corners — the one `generate-icons.sh` strips as "the favicon's own
painted corners" before making the full-bleed touch icons. That is why the
plan's step 11 lists the mark among the "near-whites that fail on a dark
page": on anything but a white ground the corners show as pale squares.

**Recommendation:** say so in the docstring, in a sentence — it is the one
fact about this asset a future dark theme needs, and the touch-icon script
already depends on it. Comment-only; the fix to the asset is step 11's.

**Resolution (2026-09-05, Joel: "do all")** — folded into F-branding-3's
rewrite of the same docstring rather than reopening the file for one sentence.
`<PuzpuzpuzLogo>` now says the tile is a plain indigo square whose corners are
painted over in the page background (#FAFAFC), reading as rounded on a white
page and showing four pale corners on anything else, and that
`generate-icons.sh` strips that path for the full-bleed home-screen icons.
Re-verified in the SVG (the ground is a four-sided path, the `#FAFAFC` path is
separate and over it) and in the script, whose Python asserts `len(corner)
== 1` on exactly that fill. Nothing said about WHICH file is the master — that
is F-branding-6's, still open.

### WORKED · F-branding-8 · `homeTitle-named-for-a-use` · The wordmark's file is named for the page it first sat on

`homeTitle.png` renders through `<PuzpuzpuzWordmark>`, on the login screen
as well as home, and the docstring has to explain that "source is
`homeTitle.png`". The component, the class and the alt text all say
wordmark; the file says home title.

**Recommendation:** `git mv` to `puzpuzpuz-wordmark.png` and change the one
import. A rename is what a whole-repo read is for (§4 → Renaming is the
point).

**Resolution (2026-09-05, Joel: "do all")** — `git mv`'d to
`puzpuzpuz-wordmark.png`, beside `puzpuzpuz.svg` under the folder's own
convention of prefixing its assets. The local binding went with it
(`homeTitle` → `wordmark`) — the same wrong word one level in — and the
docstring's path sentence updated; its "the PNG *is* the master" paragraph is
untouched, which is the part worth keeping. A whole-repo grep found the name
nowhere else: three sites, all inside `PuzpuzpuzWordmark.tsx`, and two plan
mentions left alone (`css-philosophy.md:1165`, which also carries a pre-reorg
path, and the do-not-read draft).

### F-branding-9 · `ui-md-describes-a-placeholder` · docs/ui.md still describes the mark as a placeholder at its pre-reorg path

`docs/ui.md` → ClubPage header: "`<PuzpuzpuzLogo />` — a generic placeholder
SVG at `src/common/puzpuzpuz.svg`, the same 4-dot-grid the per-game logos
use. Wrapped by `<Menu>` exactly like the game logo." Three things: the path
is pre-reorg (`src/common/branding/puzpuzpuz.svg`); it is not a placeholder
or a dot grid, it is the "P" mark; and the wrapper is `<PageHeaderMenu>`.
A sentence about this area's file, so a forward fix here.

## Notes

- **The `alt` texts stay** (`manifest.name`, "PuzPuzPuz"): existing ARIA is
  kept, not extended.
- **No tests in the folder, and none owed after F-branding-1**: three
  presentational components, and the one branch (`GameLogo`'s null) goes
  with the lookup.
- **The wordmark's squeeze is handled by its host, correctly.**
  `docs/ui.md` → Page-height says the wordmark "absorbs the squeeze by
  getting shorter" unless something says otherwise; `HomePage.module.css`
  says otherwise (`.card > *:not(.clubsSection) { flex-shrink: 0 }`), and
  the login card does not fill, so it cannot squeeze. Verified, no finding.
- **Verified and holding:** the raster is 840×216 and renders at ~416px
  inside a 480px card with 2rem padding, as its docstring says; both
  `?url` / default-import explanations are right; `docs/ui.md` → GamePage
  header's "the logo is a menu trigger" is current.
- **Left for `page-header`:** `PageHeader.tsx:33`'s "arithmetic nobody had
  written down" is the same archaeology corecss removed from `docs/ui.md`.
- **Left for `manifest`:** the hand-written registry lookup in eight files
  (F-branding-1).
- **Owed by every area from `mobile`, checked here:** no hooks; `window` is
  not referenced.

## Predicted test breaks

- `src/guards/vocabularies.test.ts` — F-branding-5's row is deleted in the
  same edit as the conversion (done; green).
- `src/guards/cssTokens.test.ts` — F-branding-2 removes a READER of
  `--page-text-color`, which has many others; F-branding-4 (a) would add a
  token and must add its readers in the same commit.
- No component test names these components; `e2e/` — none predicted.
  F-branding-8 changes an asset path only Vite resolves.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design written; its row off `DESIGNS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
