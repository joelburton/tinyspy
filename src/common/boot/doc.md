# boot

What the app does at the two moments React cannot help it: a plain screen when
the start or a render fails, and a reload for a tab whose build a deploy has
replaced underneath it. Both are wired in from `main.tsx`, which sits at the
root of `src/` and is the boot order itself.

## Design

Everything the app normally uses to say "something went wrong" is React: the
error page, the fault modal, the boundary around the play surface. All of it
needs a rendered tree to live in, and there are two moments when there is no
such tree. One is before the first render, while `main.tsx` is still loading
the theme and finding the root element. The other is after React has hit a
throw with no boundary above it, at which point it unmounts everything and
hands the error back. In both, the default outcome is a blank page, and a
friend looking at a blank page has nothing to report.

This folder answers those two moments, and it deliberately borrows nothing
from the rest of the app. `panic.ts` paints with plain DOM and inline styles,
because on the boot path the stylesheet chain may be the very thing that
failed, and on the render path there is no React left to host a component. It
shows one sentence, the same diagnostics line every other fault writes, and a
Reload button, since a reload is the only recovery either failure has.
`main.tsx` points both moments at that one painter: a `try` around the boot
and React's `onUncaughtError` on the root are two halves of one promise, never
a blank page.

The folder's other module handles a failure that looks like a bug and is not.
Every game's play surface ships as its own lazily loaded chunk, and a deploy
deletes the previous build's chunks, so a tab left open across a deploy that
then opens its first game asks for a file that no longer exists. That is not
something a friend should be told about. `reloadOnStaleChunk.ts` recognizes
that particular failure and reloads the page once, which is exactly what a
person would do by hand if they knew to. How it tells a stale chunk from a
real outage, and why it caps itself at one reload a minute, is in its
docstring.

Reloading the page is what both modules end in, which is why the test fake for
a pressable `location.reload()` lives here too. What is not here is the order
boot runs in. That is `main.tsx`'s own docstring, one reason per line, and the
theme loader it awaits belongs to `common/themes`.

## Details

- **The stale-chunk counter has one accepted gap.** Where a browser blocks site
  data the counter cannot count, so it answers "reloaded just now" and gives
  the recovery up; the cost is a manual refresh. A browser whose storage reads
  but refuses writes is the other way around: it reloads uncounted. That is
  left as is, because it takes that browser and a chunk failure a fresh page
  does not fix, together, to become the loop the counter exists to prevent.
- **`main.tsx` and `App.tsx` are the boot's other half** and sit at the root of
  `src/`, not in this folder. `main.tsx` is the order and `App.tsx` is the
  shell it mounts; which gates run first and what each route shows is
  `App.tsx`'s docstring.
