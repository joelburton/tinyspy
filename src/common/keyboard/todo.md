# keyboard — todo

## Bugs

## Soon

- **`useTabRing` has no test at all**, and its on-screen test is false for a
  `position: fixed` element. It is the mechanism `plans/tab-rings.md` was
  written to produce. (Noted in a read since deleted; re-derive rather than
  trust.)
- **`useAppShortcuts` binds at two scopes, which is a hook doing two jobs.**
  `~` word lookup and `⌥\`` anagrams are global; `/` chat is page-dependent
  (`chat: false` on the home page, where no `<Chat>` is mounted). The honest
  shape is a split: the two dialogs and their keys become one app-level host,
  and the `/`-chat binding stays with the pages that have a chat panel. That
  also fixes the mounting half — today the hook returns JSX and three pages
  must each remember TWO things, the hook call and rendering its node; do one
  without the other and the key fires, flips state nobody renders, and
  nothing appears. `AnagramDialog` and `WordLookupDialog` are thus mounted
  three times where one instance would do (they position in viewport space,
  so depth does not misplace them). Its docstring also named two pages when
  three call it.
- **`keyboardHandoff.ts` has a scheduled successor.** `handOffKeyboardOnTab`
  is the "ring transition" row of `plans/tab-rings.md`, and both its callers
  (`ChatBody`, `GameScratchpadCompanion`) are floating panels, so the
  conversion is `floating-panels/todo.md`'s. Recorded here so nobody "tidies"
  a file that audits clean and has a replacement coming.

## Someday

## Maybe
