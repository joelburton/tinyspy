# faults — todo

## Bugs

- **`FaultModal`'s docstring promises a diagnostics line it renders
  conditionally.** It lists the modal as three parts and states the third
  flatly — the small muted diagnostics line, "the SAME string the `[db]`
  console line carries" — but the render is `{fault.diagnostics && <p …>}`,
  and most `showFaultModal` call sites pass none, so the common case is a red
  "Error", a sentence, and nothing else. `reportUnhandled` now routes a
  fall-through through `reportDbFault`, which builds a real line, so this may
  be true by the time it is looked at. **Check before editing**; either way the
  docstring should say whether the line is guaranteed or optional.

## Soon

- **The `window.pupfault` install is behind a `typeof window` check** that
  cannot fail — SPA, no server render, and jsdom has a `window`
  (docs/code-conventions.md → Known gotchas). The guard goes; the question to
  answer with the file open is whether the dev helper should install
  unconditionally at all, or only under `import.meta.env.DEV`. `toasts` has the
  identical line for `window.puptoast`.

## Someday

## Maybe
