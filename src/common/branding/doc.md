# branding

The marks the app puts on screen as itself: its square "P" logo, its wordmark,
and the component that draws a game's logo. Three images and nothing else — no
state, no hooks, no click. A game's own artwork lives with that game; what is
here is the app's, plus the one component every game borrows to show its.

## Design

A mark in this app is a bare `<img>` and never a control. That is the whole
rule the folder is built on, and it exists because the same mark has to work in
two very different wrappers. On a page header the app's logo is the thing you
click to open the page menu; in a club's list of games a game's logo is the
first thing in a row you click to open that game. The click, the hover, the
focus ring and the chevron belong to those wrappers, which know what a click
means where they are. If a mark carried any of that it would be wrong in one of
the two places, so it carries none of it.

Two of the three marks are deliberately the same size, and the same shape of
nothing. A page menu's trigger shows the app's logo on home and on a club page,
and the game's logo on a game — one slot, two occupants — so the two are
interchangeable only if neither brings a frame, a padding or a background of
its own. They share `--logo-size` for the edge, the header's height is composed
from that number rather than agreeing with it by hand, and both marks supply
their own ground inside the artwork. Swapping one for the other moves nothing.

The wordmark is the exception, and it is an exception about register rather
than size. It is artwork: the big lockup at the top of the two card screens a
signed-out or just-signed-in person sees. It was once tried as the page menu's
trigger and read badly — a hero image is not a control, and a disclosure
chevron has nowhere to sit on a 400px-wide picture — so it went back to being
a picture, and the small square mark took the menu. That is why the folder has
two versions of the same brand and why neither is redundant.

What this folder does NOT hold is any color decision. Every mark is baked
color inside its own asset, so nothing here reads a theme token and nothing
here would change if a theme did. The marks are pictures the app owns, in the
same sense as the member identity colors — which is also why they are the last
thing a dark page would be able to fix, and the reason each carries a note
about the near-white it depends on.

## Details

- **`<GameLogo>` takes the manifest, not the gametype.** Every caller already
  holds one — a game page takes it as a prop, the club rows build from it —
  so a string would mean resolving it a second time and carrying a not-found
  branch none of them can reach.
- **The 32 is written twice on purpose, and only one of them is the size.**
  The CSS reads `--logo-size`; the components also state `width={32}
  height={32}` as HTML attributes, which no variable can reach. Those are the
  intrinsic-size hint that reserves the box before the image loads
  ([docs/ui.md](../../../docs/ui.md#layout-stability)), which is a different
  job from sizing and stays whatever the token says.
- **The "P" exists twice on disk, and one file could not do both jobs.**
  `public/favicon.svg` answers to a URL that `index.html`, the web manifest and
  `scripts/generate-icons.sh` all name, and gets the always-revalidate cache
  policy every unhashed file gets; the copy here rides the module graph, so
  Vite hashes it and it is cached forever. Edit one and re-run the icon script.
- **The mark's rounded corners are painted, not cut.** The tile is a plain
  square of indigo with its corners covered in the page background, so it reads
  as rounded on a light page and shows four pale corners anywhere else. The
  icon script strips exactly that path to render the home-screen icons
  full-bleed.
- **The wordmark is a raster and stays one.** Its drop shadow and hand-drawn
  outlines do not survive a trace, so the PNG is the master, shipped at 2x and
  scaled down by `width: 100%`.
- **A per-game `logo.svg` lives in that game's folder**, reaches this component
  through the manifest's `logoUrl`, and is not `currentColor` — none of them
  is. An SVG loaded through `<img src>` cannot see the page's CSS anyway.
