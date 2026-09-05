# mobile

How the app tells a phone from a desktop. One stylesheet names the thresholds, a
few hooks let JavaScript ask the same questions, and two smaller pieces measure
the room a browser actually leaves for the page.
[docs/mobile.md](../../../docs/mobile.md) is canonical.

## Design

The app has one set of pages that has to work on a desktop, a tablet and a
phone, and nearly all of the difference between them is visual — a column
becomes a row, padding tightens, a button drops its label. Differences like that
belong in CSS, and that is where almost all of them live. This folder exists for
the two things CSS cannot do on its own: agree on where "mobile" begins, and
tell JavaScript what kind of device it is running on for the rare difference
that isn't visual.

The agreeing half is `breakpoints.css`. It declares each device condition once,
as a named `@custom-media`, and a PostCSS step injects those declarations into
every stylesheet in the app — so any module writes `@media (--mobile)` instead of
repeating `(max-width: 56.25rem)`, and changing the number here changes it
everywhere at once. (A CSS variable could not do this: `var()` isn't allowed
inside a media condition, and several of these conditions combine width with
orientation anyway.)

The asking half is the hooks, for when a device difference changes what React
*renders* rather than how it looks — the menu offering a different set of rows,
the info column becoming a sheet that has to mount. The browser API for that is
`matchMedia`, and it takes a condition, not a name: it cannot read `--mobile`
out of the stylesheet. So each hook writes its condition out a second time, as a
string in TypeScript.

That second copy is the one real hazard in this folder. Tune a threshold in the
CSS, forget the hook, and nothing breaks loudly — the layout just folds at one
width while the JavaScript switches at another. So each hook is paired with a
test that reads `breakpoints.css` and asserts the two still say the same thing,
which is what makes the duplication safe to live with.

There are three device questions, and they are different questions rather than
three sizes of one. `--mobile` is about width, and marks where the two-column
layouts fold into one; phones and portrait tablets are below it. `--phone` is
about the tightest devices in either orientation — the ones with no room to
spare, where a row of buttons has to drop its labels. `--touch` is not about
width at all but about how you point: a landscape tablet is desktop-width and
still has no mouse, so anything needing a precise pointer is off there. When a
hook could be avoided, avoid it — a CSS rule and a hook are two independent
reads of the same threshold and can briefly disagree across a resize, where one
rule cannot disagree with itself.

The last two pieces are not about device class at all; they are about how much
room the browser is really giving the page, which is why they live here too.
`useVisualViewport` reports the part of the page a phone can currently show,
which shrinks when the on-screen keyboard opens — a full-screen sheet sized
without it extends behind the keyboard. `layoutWidth` publishes the page width
minus the scrollbar as a CSS property, because `100vw` includes the scrollbar
and the content box does not.

## Details

**`--phone` is composed, and two names are vocabulary.** The phone condition is
built from its two arms (`--phone-p`, `--phone-l`) rather than repeating them,
so each condition is written once and a stylesheet wanting one orientation has a
name for it. `--tablet-p` / `--tablet-l` are declared and read by nothing today,
kept so a tablet-only tweak has a name waiting; they are the only unread names
in the file.

**The hooks are one-liners over one engine.** `useMediaQuery` holds all of the
subscription machinery — `useSyncExternalStore` over a `MediaQueryList` — and
each device hook names a query and explains what that query means. A hook
returning a boolean is named for the question it answers (`useIsMobile`,
`useIsPhone`, `useIsCoarsePointer`); that is an app-wide rule, in
[docs/code-conventions.md](../../../docs/code-conventions.md).

**jsdom has no `matchMedia`, and that absence is load-bearing.** The engine
treats a missing `matchMedia` as "query unmet", so every component test in the
repo renders the desktop layout without asking. A test wanting the other answer
installs `matchMedia.fake.ts`.

**A missing browser FEATURE is guarded; a missing `window` is not.** This is an
SPA with no server render and jsdom provides a `window`, so a `typeof window`
check guards a case that cannot happen. `matchMedia` and `visualViewport` can
genuinely be absent, and those branches carry the defaults above.

**`useVisualViewport` must return the same object when nothing changed.**
`useSyncExternalStore` compares snapshots with `Object.is`, so a fresh object per
call never settles. The module-level cache is what prevents that, and it reads
like an optimization if you don't know why it is there.

**`--client-width` is read by the play-area layout alone** — that is where it is
used, not where it belongs. It corrects `100vw` on every device, not just small
ones.
