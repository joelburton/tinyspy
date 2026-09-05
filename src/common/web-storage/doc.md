# web-storage

`localStorage` and `sessionStorage`, wrapped so a browser that blocks site data
cannot throw, plus the hook for a control whose position should survive a
reload. Nothing outside this folder touches either storage raw.

## Design

**The folder is three guarded functions and one hook on top of them**, and that
is the whole of it. `storage.ts` carries the reasoning a caller needs — why it
takes the NAME of a storage rather than a `Storage`, why a failed write is
swallowed while a failed read makes you decide, and the shape every key in the
app takes. `src/guards/rawStorage.test.ts` keeps everyone else out, and argues
the case for being a guard rather than a convention.

Three rulings that belong to the folder rather than to any file in it:

- **`localStorage` is nearly all of it.** Preferences, panel rects, the theme,
  what you have already seen. `sessionStorage` has exactly one caller,
  `reloadOnStaleChunk`, because a per-tab lifetime is precisely what a reload
  guard wants — and that is the bar for reaching for it.
- **A boolean is a two-position choice, not a special case.** Crosswords' rebus
  preference is `useStickyChoice` with `['off', 'on']`. There is no
  `useStickyFlag` and the folder does not want one until something needs it.
- **Renaming a key orphans whatever is stored under it**, since nothing reads
  both. That costs a preference reset, never correctness — but it is visible to
  a player, so it is a decision to take rather than a detail to discover
  afterwards.

Tests do not get the real thing: `storage.fake.ts` installs a stand-in and
supplies both ways storage fails, for reasons its own docstring explains.
