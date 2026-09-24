# boot

What the app does at the two moments React cannot help it: a plain screen when
the start or a render fails, and a reload for a tab whose build a deploy has
replaced underneath it. Both are wired in from `main.tsx`, which sits at the
root of `src/` and is the boot order itself.

## Intro to area

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

The folder's other job is a tab that outlives a deploy, which fails in two
ways, and both are handled by a reload — exactly what a person would do by
hand if they knew to. Every game's play surface ships as its own lazily
loaded chunk, and a deploy deletes the previous build's chunks, so a tab that
then opens its first game asks for a file that no longer exists;
`reloadOnStaleChunk.ts` recognizes that failed import and reloads once. A tab
whose chunks are all in memory fails nothing: it runs old code against a
server that has moved on, and is silently wrong wherever a wire shape changed.
Nothing in the tab can notice that on its own, so `reloadOnStaleBuild.ts`
asks the server — the build writes its stamp into the bundle and into
`version.json` beside it, and the tab compares the two when the person comes
back to it, when a game page is entered, and when an answer arrives that the
code has no branch for. Neither failure is something a friend should be told
about, but a page that rebuilds itself is worth a sentence, so both reloads
leave a note (`reloadNotice.ts`) that `App` turns into one toast.

Reloading the page is what every module here ends in, which is why the test
fake for a pressable `location.reload()` lives here too. What is not here is
the order boot runs in. That is `main.tsx`'s own docstring, one reason per
line, and the theme loader it awaits belongs to `common/themes`.

## Details

**What the main bundle holds.** The shell, `common/` and every manifest's
constants; a game's play surface, setup form and Help are lazy, and its
`theme.css` is imported from its `PlayArea.tsx`, so its JS and CSS both land in
its own chunk. **`version.json` is never cached**: it falls under
`public/_headers`' `/*` rule (`max-age=0, must-revalidate`), the same as
`index.html`, which is what lets a stale tab see a new stamp.

**What `main.tsx` and `App` render.** The root of every other folder's tree;
which folder owns a node is in parentheses:

```
main.tsx                          loads the theme, finds the root; onUncaughtError → panic.ts
└── <StrictMode>
    └── App                       the session gates, then the page, then the hosts
        ├── one of, by session state — and nothing else renders until it is the page:
        │     Loading (loading) · LoginScreen (auth) · EnvelopeErrorPage (error-page)
        │     ClaimHandleScreen (auth) · the two devtools pages, outside the audit
        ├── one of, by route:
        │     ClubPageLoader (club) → ClubPage            /c/<handle>
        │     GamePageGate (game-page) → … → the game     /g/<gametype>/<gameId>
        │     HomePage (home)                             / — and any path that matches nothing
        ├── EditProfileModal (account)        while the account menu has it open
        ├── WordEditDialog (definitions)      while an editor has it open
        └── under every real page, never the auth screens — the singletons:
              GameInvitations (invitations, headless) · ToastHost (toasts)
              AppActionsHost (actions) · ConfirmationHost (floating-panels)
              FaultModal (faults) · TooltipHost (tooltips) · DefinitionHost (definitions)
```

Why each host is at the root and not in a page is `App.tsx`'s docstring: a
thing is mounted here when its state crosses subtrees, and a store is how a
page reaches it.

- **The stale-chunk counter has one accepted gap.** Where a browser blocks site
  data the counter cannot count, so it answers "reloaded just now" and gives
  the recovery up; the cost is a manual refresh. A browser whose storage reads
  but refuses writes is the other way around: it reloads uncounted. That is
  left as is, because it takes that browser and a chunk failure a fresh page
  does not fix, together, to become the loop the counter exists to prevent.
- **The build stamp is the build's own output.** `vite.config.ts` computes it
  once per run — the ISO time as the identity, since two builds of one commit
  are still two builds, and the short SHA (`-dirty` when the tree had edits)
  for a report — and bakes it into the bundle as `__BUILD_STAMP__` while a
  plugin emits `version.json` from the same run. One command produces both,
  so a partial deploy cannot ship a bundle without its stamp. The tab compares
  the fetched file against its own constant, never against storage: two tabs
  of different ages would overwrite each other's idea of "current".
- **Why a reload and not a dialog** (Joel, 2026-09-19). A refresh loses no
  more than a pause already does — `PauseBoundary` unmounts the play surface
  on every presence blip, so nothing a player types survives one anyway —
  and a dialog whose one way out is Refresh explains but cannot defer. The
  toast afterwards carries the explanation instead.
- **The stale-build reload caps itself by value, not by time.** A Netlify
  deploy takes a moment to settle across its CDN, so a reload can land on the
  old build while `version.json` already says the new one. The tab remembers
  the stamp it reloaded for and never reloads for that value again; the race
  costs one spurious reload, never a loop. The return trigger also waits five
  minutes between checks, since focus and visibility fire on every alt-tab.
- **The hole:** a backend-only deploy (`deploy-funcs`, a `supabase/sql/`
  re-apply) moves no stamp, so a tab stays stale relative to the server and
  only the unhandled-answer trigger can catch it. `gmake deploy` ships all
  three halves together, which is what makes the FE stamp a fair proxy.
- **`main.tsx` and `App.tsx` are the boot's other half** and sit at the root of
  `src/`, not in this folder. `main.tsx` is the order and `App.tsx` is the
  shell it mounts; which gates run first and what each route shows is
  `App.tsx`'s docstring.
