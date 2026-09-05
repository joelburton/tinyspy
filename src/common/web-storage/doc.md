# web-storage

`localStorage` and `sessionStorage`, wrapped so a browser that blocks site data
cannot crash the app, plus the hook for a control whose position should survive a
reload. Nothing outside this folder touches either storage raw.

## Design

Browser storage looks like a plain key-value box and behaves like one right up
until it doesn't. A browser set to block site data throws on `window.localStorage`
itself — before any method is called — and a full quota throws on the write. Both
are rare, neither is an error the player did anything about, and either one
uncaught takes down whatever was rendering. Remembering which tab you had open is
not worth a blank screen, so every access in the app goes through three small
functions here that cannot throw, and a guard keeps everyone else out.

The interesting half is what a failure should mean, because that is not the same
for reading and writing. A write that fails is swallowed: the app carries on with
the value in memory, and the only cost is that the preference will not be there
next time. A read that fails cannot be swallowed the same way, because "nothing
stored" and "storage unreachable" may deserve different answers — so a caller
passes what it wants an absent value to mean, and almost every caller says
"treat it as unset". The one that doesn't is a reload guard, which has to fail
closed.

On top of that sits one hook, for the common case: a control whose choice should
still be there after a reload. It takes the list of positions the control can be
in and validates whatever it finds against that list, so a renamed option or a
hand-edited key cannot wedge the UI into a state its own control can't
represent. A boolean is not a special case — it is a two-position choice, which
is why crosswords' rebus preference is this same hook with `['off', 'on']` and
there is no separate flag hook.

## Details

- **`localStorage` is nearly all of it** — preferences, panel rects, the theme,
  what you have already seen. `sessionStorage` has exactly one caller,
  `reloadOnStaleChunk`, because a per-tab lifetime is precisely what a reload
  guard wants. That is the bar for reaching for it.
- **Renaming a key orphans whatever is stored under it**, since nothing reads
  both. The cost is a preference reset, never correctness — but a player sees
  it, so it is a decision to take rather than a surprise to discover.
- **The key shape** every stored key takes is stated in `storage.ts`, in the
  wrapper all of them go through.
- **`src/guards/rawStorage.test.ts`** is what keeps raw access out, and argues
  why this is a guard rather than a convention.
- **Tests never get the real thing**: `storage.fake.ts` installs a stand-in and
  can make storage fail both ways — the property access and the method call —
  because those are two different bugs.
